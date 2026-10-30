import { createHmac, randomBytes, scrypt, timingSafeEqual } from 'node:crypto';
import { promisify } from 'node:util';

const scryptAsync = promisify(scrypt);
const SECRET = process.env.AUTH_SECRET || (() => {
  if (process.env.NODE_ENV === 'production') throw new Error('AUTH_SECRET must be set in production');
  console.warn('AUTH_SECRET not set: using an insecure development secret');
  return 'dev-only-secret';
})();
const TOKEN_DAYS = 60;

export async function hashPassword(password) {
  const salt = randomBytes(16);
  const key = await scryptAsync(password, salt, 64);
  return `scrypt$${salt.toString('base64')}$${key.toString('base64')}`;
}

export async function verifyPassword(password, stored) {
  const [, salt, key] = stored.split('$');
  const expected = Buffer.from(key, 'base64');
  const actual = await scryptAsync(password, Buffer.from(salt, 'base64'), expected.length);
  return timingSafeEqual(actual, expected);
}

const sign = (data) => createHmac('sha256', SECRET).update(data).digest('base64url');

export function issueToken(customerId) {
  const body = Buffer.from(JSON.stringify({ sub: customerId, exp: Date.now() + TOKEN_DAYS * 864e5 })).toString('base64url');
  return `${body}.${sign(body)}`;
}

export function readToken(token) {
  if (typeof token !== 'string') return null;
  const [body, sig] = token.split('.');
  if (!body || !sig) return null;
  const a = Buffer.from(sig);
  const b = Buffer.from(sign(body));
  if (a.length !== b.length || !timingSafeEqual(a, b)) return null;
  try {
    const { sub, exp } = JSON.parse(Buffer.from(body, 'base64url').toString());
    return exp > Date.now() ? sub : null;
  } catch {
    return null;
  }
}

// Express middleware: sets req.customerId when a valid bearer token is present.
export function authenticate(req, _res, next) {
  const h = req.get('authorization') || '';
  req.customerId = h.startsWith('Bearer ') ? readToken(h.slice(7)) : null;
  next();
}

export function requireAuth(req, res, next) {
  if (!req.customerId) return res.status(401).json({ error: 'Please log in' });
  next();
}

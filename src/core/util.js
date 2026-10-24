export class GameError extends Error {
  constructor(message) { super(message); this.name = 'GameError'; }
}

export function fail(message) { throw new GameError(message); }

export function uid(prefix = '') {
  // randomUUID needs a secure context; fall back for plain-http LAN testing.
  const r = globalThis.crypto?.randomUUID?.() ?? `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 12)}`;
  return prefix + r;
}

export function cleanText(value, field, { max = 80, required = true } = {}) {
  const s = typeof value === 'string' ? value.trim().replace(/\s+/g, ' ') : '';
  if (required && !s) fail(`${field} is required`);
  if (s.length > max) fail(`${field} must be at most ${max} characters`);
  return s;
}

export function cleanLongText(value, field, max = 500) {
  const s = typeof value === 'string' ? value.trim() : '';
  if (s.length > max) fail(`${field} must be at most ${max} characters`);
  return s;
}

export function intInRange(value, field, min, max) {
  const n = Number(value);
  if (!Number.isInteger(n) || n < min || n > max) fail(`${field} must be a whole number from ${min} to ${max}`);
  return n;
}

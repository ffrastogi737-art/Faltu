// Create the first owner (or any staff account) from the server shell:
//   STAFF_PASSWORD='...' npm run create-staff -- --name "Owner Name" --mobile 98xxxxxxxx --role owner
// There is no default login; the password comes from the environment or an interactive prompt.
import { createInterface } from 'node:readline/promises';
import { parseArgs } from 'node:util';
import { pool } from '../src/db.js';
import { hashPassword } from '../src/auth.js';
import { migrate } from './migrate.js';
import * as v from '../src/validate.js';

const { values } = parseArgs({ options: { name: { type: 'string' }, mobile: { type: 'string' }, role: { type: 'string', default: 'owner' } } });
if (!values.name || !values.mobile || !['owner', 'admin', 'employee'].includes(values.role)) {
  console.error('Usage: npm run create-staff -- --name "Name" --mobile 98xxxxxxxx [--role owner|admin|employee]');
  process.exit(1);
}
const mobile = v.mobile(values.mobile);
let password = process.env.STAFF_PASSWORD;
if (!password) {
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  password = await rl.question('Password (min 8 characters): ');
  rl.close();
}
if (!password || password.length < 8) throw new Error('Password must be at least 8 characters');
await migrate();
const { rows } = await pool.query(
  `INSERT INTO staff (name, mobile, role, password_hash) VALUES ($1,$2,$3,$4)
   ON CONFLICT (mobile) DO UPDATE SET name = EXCLUDED.name, role = EXCLUDED.role, password_hash = EXCLUDED.password_hash, active = true
   RETURNING id, name, role`,
  [values.name, mobile, values.role, await hashPassword(password)],
);
console.log(`staff #${rows[0].id} ${rows[0].name} (${rows[0].role}) ready; log in with mobile ${mobile}`);
await pool.end();

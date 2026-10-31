// First-start setup for hosts without a shell (e.g. Render free):
// - creates the first owner from OWNER_NAME / OWNER_MOBILE / OWNER_PASSWORD, only while no owner exists
// - adds the 12 default categories, only while there are none
import { query } from './db.js';
import { hashPassword } from './auth.js';
import * as v from './validate.js';

export const DEFAULT_CATEGORIES = ['Earrings', 'Necklace Sets', 'Rings', 'Bangles', 'Bracelets', 'Mangalsutra', 'Pendant Sets', 'Anklets', 'Bridal Jewellery', 'Party Wear', 'Daily Wear', 'Accessories'];

export async function bootstrap(env = process.env) {
  const { rows: [{ owners, categories }] } = await query(
    `SELECT (SELECT count(*) FROM staff WHERE role = 'owner')::int AS owners, (SELECT count(*) FROM categories)::int AS categories`);
  if (!owners && env.OWNER_MOBILE && env.OWNER_PASSWORD) {
    if (env.OWNER_PASSWORD.length < 8) throw new Error('OWNER_PASSWORD must be at least 8 characters');
    await query('INSERT INTO staff (name, mobile, role, password_hash) VALUES ($1,$2,$3,$4) ON CONFLICT (mobile) DO UPDATE SET role = $3, active = true',
      [env.OWNER_NAME || 'Owner', v.mobile(env.OWNER_MOBILE), 'owner', await hashPassword(env.OWNER_PASSWORD)]);
    console.log('created the first owner account; you can now remove OWNER_PASSWORD from the environment');
  } else if (!owners) {
    console.warn('no owner account yet: set OWNER_MOBILE and OWNER_PASSWORD (or run npm run create-staff) to log in to /admin');
  }
  if (!categories) {
    for (const [i, name] of DEFAULT_CATEGORIES.entries()) {
      await query('INSERT INTO categories (slug, name, sort_order) VALUES ($1,$2,$3) ON CONFLICT (slug) DO NOTHING', [name.toLowerCase().replace(/\s+/g, '-'), name, i]);
    }
  }
}

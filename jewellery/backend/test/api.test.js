// Integration tests against a real, throwaway PostgreSQL database.
// TEST_DATABASE_URL must point at a database this test may drop and recreate.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import pg from 'pg';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';

const url = new URL(process.env.TEST_DATABASE_URL || 'postgres://jewel:jewel@127.0.0.1:5432/jewellery_test');
const admin = new pg.Client({ connectionString: Object.assign(new URL(url), { pathname: '/postgres' }).toString() });
await admin.connect();
await admin.query(`DROP DATABASE IF EXISTS ${url.pathname.slice(1)} WITH (FORCE)`);
await admin.query(`CREATE DATABASE ${url.pathname.slice(1)}`);
await admin.end();
process.env.DATABASE_URL = url.toString();
process.env.UPLOAD_DIR = mkdtempSync(`${tmpdir()}/jw-uploads-`);

const { migrate } = await import('../scripts/migrate.js');
const { pool } = await import('../src/db.js');
const { createApp } = await import('../src/app.js');
const { computeTotals } = await import('../src/pricing.js');
const { upiLink } = await import('../src/upi.js');

let server, base;
const sql = (q, p) => pool.query(q, p);

async function call(method, path, body, headers = {}) {
  const res = await fetch(base + path, { method, headers: { 'content-type': 'application/json', ...headers }, body: body && JSON.stringify(body) });
  return { status: res.status, body: await res.json() };
}
const auth = (token) => ({ authorization: `Bearer ${token}` });
const address = { house: '12B', street: 'MG Road', area: 'Civil Lines', city: 'Jaipur', state: 'Rajasthan', pincode: '302001', landmark: 'Near temple' };
const PNG = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';

before(async () => {
  await migrate();
  await sql(`UPDATE store_settings SET shop_name='Test Shop', upi_id='shop@upi', upi_payee_name='Test Shop', delivery_charge_paise=5000, free_delivery_min_paise=200000`);
  await sql(`INSERT INTO categories (slug, name) VALUES ('rings','Rings')`);
  await sql(`INSERT INTO products (sku, slug, name, category_id, original_price_paise, selling_price_paise, stock, images, tags)
             VALUES ('R1','ring-one','Ring One',1,120000,100000,3,'{/a.jpg}','{trending}'),
                    ('R2','ring-two','Ring Two',1,50000,50000,1,'{}','{}')`);
  server = createApp().listen(0);
  base = `http://127.0.0.1:${server.address().port}/api`;
});

after(async () => {
  server.close();
  await pool.end();
});

test('pricing: 3% UPI discount on ₹1,000, none for COD', () => {
  const lines = [{ unit_original_paise: 100000, unit_price_paise: 100000, quantity: 1 }];
  const s = { upi_discount_percent: 3, delivery_charge_paise: 0, free_delivery_min_paise: 0 };
  assert.equal(computeTotals(lines, s, 'upi').upiDiscountPaise, 3000);
  assert.equal(computeTotals(lines, s, 'upi').totalPaise, 97000);
  assert.equal(computeTotals(lines, s, 'cod').totalPaise, 100000);
  assert.equal(computeTotals(lines, { ...s, delivery_charge_paise: 4900, free_delivery_min_paise: 150000 }, 'cod').totalPaise, 104900);
});

test('UPI link carries payee, order id and exact amount', () => {
  const link = upiLink({ upiId: 'shop@upi', payeeName: 'My Shop', shopName: 'My Shop', orderNumber: 'JW1001', amountPaise: 97050 });
  assert.equal(link, 'upi://pay?pa=shop%40upi&pn=My%20Shop&tr=JW1001&tn=My%20Shop%20order%20JW1001&am=970.50&cu=INR');
});

test('catalog: products, search, tags, detail with related', async () => {
  assert.equal((await call('GET', '/products')).body.total, 2);
  assert.equal((await call('GET', '/products?tag=trending')).body.items[0].sku, 'R1');
  assert.equal((await call('GET', '/products?q=two')).body.items[0].sku, 'R2');
  assert.equal((await call('GET', '/products?q=%25')).body.total, 0);
  const d = await call('GET', '/products/ring-one');
  assert.equal(d.body.discountPercent, 17);
  assert.deepEqual(d.body.related.map((r) => r.sku), ['R2']);
  assert.equal((await call('GET', '/products/nope')).status, 404);
});

test('full customer journey: register, UPI order, verification, notifications', async () => {
  const reg = await call('POST', '/auth/register', { name: 'Priya', mobile: '+91 98765 43210', password: 'secret123' });
  assert.equal(reg.status, 201);
  assert.equal(reg.body.customer.mobile, '9876543210');
  assert.equal((await call('POST', '/auth/register', { name: 'Priya', mobile: '9876543210', password: 'secret123' })).status, 409);
  assert.equal((await call('POST', '/auth/login', { mobile: '9876543210', password: 'wrong-pass' })).status, 401);
  const { token } = (await call('POST', '/auth/login', { mobile: '9876543210', password: 'secret123' })).body;

  const quote = (await call('POST', '/cart/quote', { items: [{ productId: 1, quantity: 2 }] })).body;
  assert.equal(quote.upi.totalPaise, 200000 - 6000); // free delivery at ₹2,000, 3% off
  assert.equal(quote.cod.totalPaise, 200000);

  // tampered client total is rejected, not charged
  const bad = await call('POST', '/orders', { items: [{ productId: 1, quantity: 2 }], paymentMethod: 'upi', contact: { name: 'Priya', mobile: '9876543210' }, address, expectedTotalPaise: 100 }, auth(token));
  assert.equal(bad.status, 409);
  assert.equal(bad.body.code, 'PRICE_CHANGED');

  const order = await call('POST', '/orders', { items: [{ productId: 1, quantity: 2 }], paymentMethod: 'upi', contact: { name: 'Priya', mobile: '9876543210' }, address, expectedTotalPaise: quote.upi.totalPaise, saveAddress: true }, auth(token));
  assert.equal(order.status, 201);
  assert.equal(order.body.totals.totalPaise, 194000);
  assert.equal(order.body.paymentStatus, 'pending');
  assert.match(order.body.upiLink, /am=1940\.00/);
  assert.equal(order.body.guestToken, null);
  assert.equal((await sql('SELECT stock FROM products WHERE id = 1')).rows[0].stock, 1);
  assert.equal((await call('GET', '/me/addresses', null, auth(token))).body.length, 1);

  const n = order.body.orderNumber;
  assert.equal((await call('POST', `/orders/${n}/payment-confirmation`, { reference: 'bad ref!' }, auth(token))).status, 400);
  const paid = await call('POST', `/orders/${n}/payment-confirmation`, { reference: '412345678901' }, auth(token));
  assert.equal(paid.body.paymentStatus, 'verification_pending');
  assert.equal(paid.body.upiLink, null);
  assert.equal(paid.body.canCancel, false);
  assert.equal((await call('POST', `/orders/${n}/cancel`, {}, auth(token))).status, 409);

  // admin app verifies payment and moves the order along: triggers write history + notifications
  await sql(`UPDATE orders SET payment_status = 'verified' WHERE order_number = $1`, [n]);
  await sql(`UPDATE orders SET status = 'confirmed' WHERE order_number = $1`, [n]);
  const detail = (await call('GET', `/orders/${n}`, null, auth(token))).body;
  assert.deepEqual(detail.timeline.map((t) => t.status), ['new', 'confirmed']);
  const notes = (await call('GET', '/notifications', null, auth(token))).body;
  assert.deepEqual(notes.items.map((x) => x.title).slice(0, 3), ['Order confirmed', 'Payment verified', 'Order placed']);
  await call('POST', '/notifications/read', {}, auth(token));
  assert.equal((await call('GET', '/notifications', null, auth(token))).body.unread, 0);

  // another customer cannot see it
  const other = (await call('POST', '/auth/register', { name: 'Ravi', mobile: '9123456780', password: 'secret123' })).body.token;
  assert.equal((await call('GET', `/orders/${n}`, null, auth(other))).status, 404);
  assert.equal((await call('GET', '/orders', null, auth(token))).body.length, 1);
});

test('stock is validated by the server', async () => {
  const res = await call('POST', '/orders', { items: [{ productId: 2, quantity: 2 }], paymentMethod: 'cod', contact: { name: 'Guest', mobile: '9000000001' }, address });
  assert.equal(res.status, 409);
  assert.deepEqual(res.body.problems, [{ productId: 2, issue: 'insufficient_stock', available: 1 }]);
});

test('guest COD order: token access, cancel restores stock', async () => {
  const res = await call('POST', '/orders', { items: [{ productId: 2, quantity: 1 }], paymentMethod: 'cod', contact: { name: 'Guest', mobile: '9000000001' }, address });
  assert.equal(res.status, 201);
  assert.equal(res.body.totals.totalPaise, 55000); // ₹500 + ₹50 delivery, no UPI discount
  assert.equal(res.body.upiLink, null);
  const n = res.body.orderNumber;
  const g = { 'x-guest-token': res.body.guestToken };
  assert.equal((await call('GET', `/orders/${n}`)).status, 404);
  assert.equal((await call('GET', `/orders/${n}`, null, { 'x-guest-token': 'wrong' })).status, 404);
  assert.equal((await sql('SELECT stock FROM products WHERE id = 2')).rows[0].stock, 0);
  const c = await call('POST', `/orders/${n}/cancel`, { reason: 'Ordered twice' }, g);
  assert.equal(c.body.status, 'cancelled');
  assert.equal((await sql('SELECT stock FROM products WHERE id = 2')).rows[0].stock, 1);
  assert.equal((await call('POST', `/orders/${n}/cancel`, {}, g)).status, 409);
});

test('replacement: only delivered orders, within the window, once per item', async () => {
  const res = await call('POST', '/orders', { items: [{ productId: 2, quantity: 1 }], paymentMethod: 'cod', contact: { name: 'Guest', mobile: '9000000001' }, address });
  const n = res.body.orderNumber;
  const g = { 'x-guest-token': res.body.guestToken };
  const itemId = res.body.items[0].id;
  const req = { orderItemId: itemId, issue: 'damaged', description: 'Stone fell out', photos: [PNG] };
  assert.equal((await call('POST', `/orders/${n}/replacements`, req, g)).status, 409);

  await sql(`UPDATE orders SET status = 'delivered' WHERE order_number = $1`, [n]);
  assert.equal((await call('POST', `/orders/${n}/replacements`, { ...req, issue: 'changed_mind' }, g)).status, 400);
  assert.equal((await call('POST', `/orders/${n}/replacements`, { ...req, photos: [] }, g)).status, 400);
  assert.equal((await call('POST', `/orders/${n}/replacements`, { ...req, photos: ['data:image/png;base64,AAAA'] }, g)).status, 400);
  const ok = await call('POST', `/orders/${n}/replacements`, req, g);
  assert.equal(ok.status, 201);
  assert.equal(ok.body.replacements[0].status, 'requested');
  assert.match(ok.body.replacements[0].photos[0], /^\/uploads\/replacements\/.+\.png$/);
  assert.ok(ok.body.replacementDeadline);
  assert.equal((await call('POST', `/orders/${n}/replacements`, req, g)).status, 409);

  await sql(`UPDATE orders SET delivered_at = now() - interval '4 hours' WHERE order_number = $1`, [n]);
  await sql(`DELETE FROM replacement_requests`);
  const late = await call('POST', `/orders/${n}/replacements`, req, g);
  assert.equal(late.status, 409);
  assert.match(late.body.error, /3-hour/);
});

test('owner changes UPI discount: the next quote uses it', async () => {
  await sql('UPDATE store_settings SET upi_discount_percent = 5');
  assert.equal((await call('GET', '/settings')).body.upiDiscountPercent, 5);
  const q = (await call('POST', '/cart/quote', { items: [{ productId: 2, quantity: 1 }] })).body;
  assert.equal(q.upi.upiDiscountPaise, 2500);
});

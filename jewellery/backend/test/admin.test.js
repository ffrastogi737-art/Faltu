// Admin / owner / employee API against a real throwaway PostgreSQL database (own DB so it can run
// in parallel with api.test.js).
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import pg from 'pg';
import sharp from 'sharp';
import { mkdtempSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';

const url = new URL(process.env.TEST_ADMIN_DATABASE_URL || 'postgres://jewel:jewel@127.0.0.1:5432/jewellery_admin_test');
const root = new pg.Client({ connectionString: Object.assign(new URL(url), { pathname: '/postgres' }).toString() });
await root.connect();
await root.query(`DROP DATABASE IF EXISTS ${url.pathname.slice(1)} WITH (FORCE)`);
await root.query(`CREATE DATABASE ${url.pathname.slice(1)}`);
await root.end();
process.env.DATABASE_URL = url.toString();
process.env.UPLOAD_DIR = mkdtempSync(`${tmpdir()}/jw-admin-uploads-`);

const { migrate } = await import('../scripts/migrate.js');
const { pool } = await import('../src/db.js');
const { createApp } = await import('../src/app.js');
const { hashPassword } = await import('../src/auth.js');
const { parseCsv, toCsv } = await import('../src/csv.js');
const { computeTotals } = await import('../src/pricing.js');

let server, base;
const sql = (q, p) => pool.query(q, p);
async function call(method, path, body, token, raw) {
  const headers = token ? { authorization: `Bearer ${token}` } : {};
  if (body !== undefined && !raw) headers['content-type'] = 'application/json';
  const res = await fetch(base + path, { method, headers, body: raw ? body : body === undefined ? undefined : JSON.stringify(body) });
  const text = await res.text();
  let json; try { json = JSON.parse(text); } catch { json = text; }
  return { status: res.status, body: json, headers: res.headers };
}
const T = {};
const address = { house: '1', street: 'Main', area: 'Civil Lines', city: 'Jaipur', state: 'Rajasthan', pincode: '302001', landmark: '' };
const order = (method, items = [{ productId: 1, quantity: 1 }], token) =>
  call('POST', '/api/orders', { items, paymentMethod: method, contact: { name: 'Asha', mobile: '9812345678' }, address }, token);

before(async () => {
  await migrate();
  await sql(`UPDATE store_settings SET shop_name='Demo Shop', upi_id='aabhajewels@upi', upi_payee_name='Demo Jewellery Store'`);
  await sql(`INSERT INTO categories (slug, name) VALUES ('rings','Rings'), ('earrings','Earrings')`);
  await sql(`INSERT INTO products (sku, slug, name, category_id, original_price_paise, selling_price_paise, stock, images, is_demo)
             VALUES ('AJ-100','demo-ring','Demo Ring',1,120000,100000,10,'{/uploads/products/demo-ring-0.svg}',true),
                    ('REAL-1','real-ring','Real Ring',1,50000,50000,50,'{}',false)`);
  for (const [name, mobile, role] of [['Olivia Owner', '9000000001', 'owner'], ['Arun Admin', '9000000002', 'admin'], ['Emil Employee', '9000000003', 'employee'], ['Esha Employee', '9000000004', 'employee']]) {
    await sql('INSERT INTO staff (name, mobile, role, password_hash) VALUES ($1,$2,$3,$4)', [name, mobile, role, await hashPassword('password123')]);
  }
  server = createApp().listen(0);
  base = `http://127.0.0.1:${server.address().port}`;
  for (const [k, m] of [['owner', '9000000001'], ['admin', '9000000002'], ['emp', '9000000003'], ['emp2', '9000000004']]) {
    T[k] = (await call('POST', '/api/admin/auth/login', { mobile: m, password: 'password123' })).body.token;
  }
});
after(async () => { server.close(); await pool.end(); });

test('csv helpers: quotes, newlines, formula injection guard', () => {
  assert.deepEqual(parseCsv('a,b\r\n"x, y","he said ""hi"""\n"multi\nline",2\n\n'), [['a', 'b'], ['x, y', 'he said "hi"'], ['multi\nline', '2']]);
  assert.equal(toCsv([{ a: '=SUM(A1)', b: 'x,y' }]), 'a,b\r\n\'=SUM(A1),"x,y"\r\n');
});

test('UPI discount rules: enabled, minimum, cap, dates', () => {
  const lines = [{ unit_original_paise: 100000, unit_price_paise: 100000, quantity: 1 }];
  const s = { upi_discount_percent: 3, delivery_charge_paise: 0, free_delivery_min_paise: 0 };
  assert.equal(computeTotals(lines, s, 'upi').totalPaise, 97000);
  assert.equal(computeTotals(lines, { ...s, upi_discount_enabled: false }, 'upi').upiDiscountPaise, 0);
  assert.equal(computeTotals(lines, { ...s, upi_discount_min_order_paise: 150000 }, 'upi').upiDiscountPaise, 0);
  assert.equal(computeTotals(lines, { ...s, upi_discount_max_paise: 2000 }, 'upi').upiDiscountPaise, 2000);
  assert.equal(computeTotals(lines, { ...s, upi_discount_ends_at: '2000-01-01' }, 'upi').upiDiscountPaise, 0);
  assert.equal(computeTotals(lines, { ...s, upi_discount_starts_at: '2999-01-01' }, 'upi').upiDiscountPaise, 0);
  assert.equal(computeTotals(lines, s, 'cod').upiDiscountPaise, 0);
});

test('logins and role-based access', async () => {
  assert.ok(T.owner && T.admin && T.emp);
  assert.equal((await call('POST', '/api/admin/auth/login', { mobile: '9000000001', password: 'nope-nope' })).status, 401);
  assert.equal((await call('GET', '/api/admin/me')).status, 401);
  // a customer token is not a staff token
  const cust = (await call('POST', '/api/auth/register', { name: 'Cust', mobile: '9876500000', password: 'secret123' })).body.token;
  assert.equal((await call('GET', '/api/admin/orders', undefined, cust)).status, 401);
  assert.equal((await call('GET', '/api/admin/dashboard', undefined, T.admin)).status, 403);
  assert.equal((await call('GET', '/api/admin/settings', undefined, T.admin)).status, 403);
  assert.equal((await call('GET', '/api/admin/orders', undefined, T.emp)).status, 403);
  assert.equal((await call('GET', '/api/admin/reports/daily-sales', undefined, T.emp)).status, 403);
  assert.equal((await call('GET', '/api/admin/reports/inventory', undefined, T.admin)).status, 200);
  assert.equal((await call('PATCH', '/api/admin/settings', { upi_id: 'x@okaxis' }, T.admin)).status, 403);
  assert.equal((await call('GET', '/api/admin/products', undefined, T.admin)).status, 200);
  assert.equal((await call('GET', '/api/admin/demo', undefined, T.admin)).status, 403);
});

test('owner updates branding + UPI; customer app and new payment links use it; audited', async () => {
  assert.equal((await call('PATCH', '/api/admin/settings', { upi_id: 'not a upi' }, T.owner)).status, 400);
  const png = await sharp({ create: { width: 600, height: 600, channels: 4, background: '#c9a45c' } }).png().toBuffer();
  const icon = await call('POST', '/api/admin/uploads?kind=icon', png, T.owner, true);
  assert.equal(icon.status, 201);
  assert.match(icon.body.url, /^\/uploads\/icon\/.+-512\.png$/);
  assert.equal((await call('POST', '/api/admin/uploads?kind=logo', png, T.admin, true)).status, 403);
  const logo = await call('POST', '/api/admin/uploads?kind=logo', png, T.owner, true);
  assert.equal((await call('POST', '/api/admin/uploads?kind=product', Buffer.from('<svg/>'), T.owner, true)).status, 400);

  const res = await call('PATCH', '/api/admin/settings', {
    shop_name: 'Kanak Jewels', brand_display_name: 'KANAK', logo_url: logo.body.url, app_icon_url: icon.body.url,
    upi_id: 'kanakjewels@okhdfcbank', upi_payee_name: 'Kanak Jewels', payment_instructions: 'Pay the exact amount.',
    upi_discount_percent: 5, whatsapp_number: '98290 11111', opening_hours: '10am–8pm',
  }, T.owner);
  assert.equal(res.status, 200, JSON.stringify(res.body));
  const pub = (await call('GET', '/api/settings')).body;
  assert.equal(pub.shopName, 'Kanak Jewels');
  assert.equal(pub.brandName, 'KANAK');
  assert.equal(pub.logoUrl, logo.body.url);
  assert.equal(pub.upiDiscountPercent, 5);
  assert.equal(pub.whatsappNumber, '919829011111');
  assert.equal(pub.contact.openingHours, '10am–8pm');
  const manifest = (await call('GET', '/manifest.webmanifest')).body;
  assert.equal(manifest.name, 'KANAK');
  assert.equal(manifest.icons[0].src, icon.body.url.replace('-512.png', '-192.png'));
  assert.ok(existsSync(process.env.UPLOAD_DIR + icon.body.url.replace('/uploads', '').replace('-512', '-192')));

  const o = await order('upi', [{ productId: 2, quantity: 1 }]);
  assert.match(o.body.upiLink, /^upi:\/\/pay\?pa=kanakjewels%40okhdfcbank&pn=Kanak%20Jewels&tr=JW\d+/);
  assert.equal(o.body.totals.upiDiscountPaise, 2500);
  const log = (await call('GET', '/api/admin/audit', undefined, T.owner)).body;
  const entry = log.find((a) => a.entity === 'payment_settings');
  assert.equal(entry.details.upi_id.from, 'aabhajewels@upi');
  assert.equal(entry.details.upi_id.to, 'kanakjewels@okhdfcbank');
  await call('PATCH', '/api/admin/settings', { upi_discount_percent: 3 }, T.owner);
});

test('products: create with images, update price, stock moves logged, oversell blocked, sync to customer API', async () => {
  const jpg = await sharp({ create: { width: 3000, height: 2000, channels: 3, background: '#eee' } }).jpeg().toBuffer();
  const imgs = [];
  for (let i = 0; i < 2; i++) imgs.push((await call('POST', '/api/admin/uploads?kind=product', jpg, T.admin, true)).body.url);
  const meta = await sharp(process.env.UPLOAD_DIR + imgs[0].replace('/uploads', '')).metadata();
  assert.equal(meta.format, 'webp');
  assert.equal(meta.width, 1600);

  const created = await call('POST', '/api/admin/products', {
    name: 'Kundan Choker', sku: 'KJ-001', categoryId: 1, originalPrice: '2499', sellingPrice: '1999', stock: 4, images: imgs,
    description: 'Real photo', specifications: { Plating: 'Gold' }, tags: ['featured', 'bogus'],
  }, T.admin);
  assert.equal(created.status, 201, JSON.stringify(created.body));
  const id = created.body.id;
  assert.equal((await call('POST', '/api/admin/products', { name: 'Dup', sku: 'KJ-001', originalPrice: 1, sellingPrice: 1 }, T.admin)).status, 409);
  assert.equal((await call('POST', '/api/admin/products', { name: 'Bad', sku: 'X1', originalPrice: 1, sellingPrice: 2 }, T.admin)).status, 400);
  assert.equal((await call('POST', '/api/admin/products', { name: 'Bad', sku: 'X2', originalPrice: 1, sellingPrice: 1, images: ['/etc/passwd'] }, T.admin)).status, 400);

  let pub = (await call('GET', '/api/products?q=Kundan')).body.items[0];
  assert.deepEqual([pub.sellingPricePaise, pub.images.length, pub.tags], [199900, 2, ['featured']]);
  const p = (await call('GET', `/api/admin/products/${id}`, undefined, T.admin)).body;
  await call('PUT', `/api/admin/products/${id}`, { ...p, originalPrice: 2499, sellingPrice: 1799, categoryId: 1, images: [imgs[1], imgs[0]], specifications: p.specifications }, T.admin);
  pub = (await call('GET', '/api/products?q=Kundan')).body.items[0];
  assert.equal(pub.sellingPricePaise, 179900);
  assert.equal(pub.images[0], imgs[1]);

  assert.equal((await call('POST', `/api/admin/products/${id}/stock`, { change: -10, reason: 'damaged' }, T.admin)).status, 409);
  assert.equal((await call('POST', `/api/admin/products/${id}/stock`, { change: 6, reason: 'restock', note: 'New lot' }, T.admin)).body.stock, 10);
  const moves = (await call('GET', `/api/admin/products/${id}`, undefined, T.admin)).body.movements;
  assert.deepEqual(moves.slice(0, 2).map((m) => [m.reason, m.change, m.stock_after, m.staff_name]), [['restock', 6, 10, 'Arun Admin'], ['opening', 4, 4, 'Arun Admin']]);

  await call('PUT', `/api/admin/products/${id}`, { ...p, originalPrice: 2499, sellingPrice: 1799, stock: 10, active: false, categoryId: 1, images: imgs }, T.admin);
  assert.equal((await call('GET', '/api/products?q=Kundan')).body.total, 0);
});

test('CSV import validates, previews, imports only valid rows', async () => {
  const csv = 'Product Name,SKU,Category,Original Price,Selling Price,Stock,Description\n' +
    'Pearl Studs,PS-1,Earrings,"₹1,299",999,5,Lovely\n' +
    'Bad Price,PS-2,Earrings,abc,10,1,\n' +
    'Dup In File,PS-1,Earrings,10,10,1,\n' +
    'Existing,REAL-1,Rings,10,10,1,\n' +
    'Unknown Cat,PS-3,Hats,10,10,1,\n';
  const preview = (await call('POST', '/api/admin/products/import', { csv }, T.admin)).body;
  assert.deepEqual([preview.totalRows, preview.validCount, preview.invalidCount, preview.imported], [5, 1, 4, 0]);
  assert.deepEqual(preview.duplicateSkus.sort(), ['PS-1', 'REAL-1']);
  assert.equal((await call('GET', '/api/products?q=Pearl')).body.total, 0);
  const done = (await call('POST', '/api/admin/products/import', { csv, commit: true }, T.admin)).body;
  assert.equal(done.imported, 1);
  assert.equal((await call('GET', '/api/products?q=Pearl')).body.items[0].sellingPricePaise, 99900);
  assert.equal((await call('POST', '/api/admin/products/import', { csv: 'Name,SKU\nx,y' }, T.admin)).status, 400);
});

test('delivery: assign, employee sees only own orders, picks up, delivers without OTP, records COD', async () => {
  const o = (await order('cod', [{ productId: 2, quantity: 1 }])).body;
  const n = o.orderNumber;
  const empId = (await sql(`SELECT id FROM staff WHERE mobile='9000000003'`)).rows[0].id;
  for (const s of ['confirmed', 'preparing', 'ready_for_delivery']) assert.equal((await call('POST', `/api/admin/orders/${n}/status`, { status: s }, T.admin)).status, 200);
  assert.equal((await call('POST', `/api/admin/orders/${n}/status`, { status: 'new' }, T.admin)).status, 409);
  assert.equal((await call('POST', `/api/admin/orders/${n}/assign`, { employeeId: 1 }, T.admin)).status, 400); // owner is not a delivery employee
  assert.equal((await call('POST', `/api/admin/orders/${n}/assign`, { employeeId: empId }, T.admin)).status, 200);
  assert.equal((await call('GET', `/api/orders/${n}`, undefined, undefined)).status, 404);

  assert.equal((await call('GET', `/api/admin/orders/${n}`, undefined, T.emp2)).status, 404);
  const mine = (await call('GET', '/api/admin/my-orders', undefined, T.emp)).body;
  assert.deepEqual(mine.map((x) => x.order_number), [n]);
  const detail = (await call('GET', `/api/admin/orders/${n}`, undefined, T.emp)).body;
  assert.equal(detail.address.city, 'Jaipur');
  assert.equal(detail.customer, null);
  assert.equal((await call('POST', `/api/admin/orders/${n}/status`, { status: 'delivered' }, T.emp)).status, 409);
  assert.equal((await call('POST', `/api/admin/orders/${n}/status`, { status: 'cancelled', reason: 'x' }, T.emp)).status, 403);
  assert.equal((await call('POST', `/api/admin/orders/${n}/pickup`, {}, T.emp)).status, 200);
  assert.equal((await call('POST', `/api/admin/orders/${n}/status`, { status: 'out_for_delivery' }, T.emp)).status, 200);
  assert.equal((await call('POST', `/api/admin/orders/${n}/cod`, { amount: 100 }, T.emp)).status, 400); // short without note
  assert.equal((await call('POST', `/api/admin/orders/${n}/status`, { status: 'delivered' }, T.emp)).status, 200);
  assert.equal((await call('POST', `/api/admin/orders/${n}/cod`, { amount: o.totals.totalPaise / 100 }, T.emp)).status, 200);
  assert.equal((await call('POST', `/api/admin/orders/${n}/cod`, { amount: 1 }, T.emp)).status, 409);

  const row = (await sql('SELECT * FROM orders WHERE order_number = $1', [n])).rows[0];
  assert.equal(row.delivered_by, empId);
  assert.ok(row.delivered_at && row.picked_up_at);
  assert.equal(row.payment_status, 'verified');
  assert.equal(row.cod_collected_paise, o.totals.totalPaise);
  const hist = (await call('GET', `/api/admin/orders/${n}`, undefined, T.owner)).body.history;
  assert.deepEqual(hist.map((h) => h.by), [null, 'Arun Admin', 'Arun Admin', 'Arun Admin', 'Emil Employee', 'Emil Employee']);
});

test('UPI verification: owner only, needs bank reference + confirmation, no duplicate references', async () => {
  const a = (await order('upi', [{ productId: 2, quantity: 1 }])).body.orderNumber;
  const b = (await order('upi', [{ productId: 2, quantity: 1 }])).body.orderNumber;
  assert.equal((await call('POST', `/api/admin/orders/${a}/payment`, { status: 'verified', bankReference: '412345678901', confirmBankCredit: true }, T.admin)).status, 403);
  assert.equal((await call('POST', `/api/admin/orders/${a}/payment`, { status: 'verified', bankReference: '412345678901' }, T.owner)).status, 400);
  assert.equal((await call('POST', `/api/admin/orders/${a}/payment`, { status: 'verified', confirmBankCredit: true }, T.owner)).status, 400);
  assert.equal((await call('POST', `/api/admin/orders/${a}/payment`, { status: 'verified', bankReference: '412345678901', confirmBankCredit: true }, T.owner)).status, 200);
  assert.equal((await call('POST', `/api/admin/orders/${b}/payment`, { status: 'verified', bankReference: '412345678901', confirmBankCredit: true }, T.owner)).status, 409);
  assert.equal((await call('POST', `/api/admin/orders/${b}/payment`, { status: 'failed' }, T.owner)).status, 400);
  assert.equal((await call('POST', `/api/admin/orders/${b}/payment`, { status: 'failed', note: 'No credit found' }, T.owner)).status, 200);
  assert.equal((await sql('SELECT payment_status FROM orders WHERE order_number = $1', [a])).rows[0].payment_status, 'verified');
});

test('dashboard: collected money excludes unverified UPI; pending amounts split out', async () => {
  const pending = (await order('upi', [{ productId: 2, quantity: 1 }])).body;
  await call('POST', `/api/orders/${pending.orderNumber}/payment-confirmation`, { reference: '999988887777' }, undefined);
  const d = (await call('GET', '/api/admin/dashboard', undefined, T.owner)).body;
  const verified = (await sql(`SELECT COALESCE(sum(total_paise),0)::int AS s FROM orders WHERE payment_method='upi' AND payment_status='verified'`)).rows[0].s;
  const cod = (await sql(`SELECT COALESCE(sum(cod_collected_paise),0)::int AS s FROM orders`)).rows[0].s;
  assert.equal(d.summary.collected_paise, verified + cod);
  assert.ok(d.summary.pending_upi_paise >= pending.totals.totalPaise);
  assert.equal(d.summary.gross_paise - d.summary.product_discount_paise - d.summary.upi_discount_paise + d.summary.delivery_paise, d.summary.net_paise);
  assert.equal(d.summary.status_delivered, 1);
  assert.ok(d.daily.length === 1 && d.monthly.length >= 12);
  const csv = await call('GET', '/api/admin/reports/upi-collection?format=csv', undefined, T.owner);
  assert.match(csv.headers.get('content-type'), /text\/csv/);
  assert.match(csv.body, /^order_number,created_at,contact_name/);
});

test('replacement: reject needs a reason; status reaches the customer', async () => {
  const o = (await order('cod', [{ productId: 2, quantity: 1 }])).body;
  await sql(`UPDATE orders SET status='delivered' WHERE order_number=$1`, [o.orderNumber]);
  const png = 'data:image/png;base64,' + (await sharp({ create: { width: 4, height: 4, channels: 3, background: '#f00' } }).png().toBuffer()).toString('base64');
  await call('POST', `/api/orders/${o.orderNumber}/replacements`, { orderItemId: o.items[0].id, issue: 'damaged', photos: [png] }, undefined);
  const g = (await sql('SELECT guest_token FROM orders WHERE order_number=$1', [o.orderNumber])).rows[0].guest_token;
  await fetch(`${base}/api/orders/${o.orderNumber}/replacements`, { method: 'POST', headers: { 'content-type': 'application/json', 'x-guest-token': g }, body: JSON.stringify({ orderItemId: o.items[0].id, issue: 'damaged', photos: [png] }) });
  const list = (await call('GET', '/api/admin/replacements', undefined, T.admin)).body;
  assert.equal(list.length, 1);
  assert.equal(list[0].photos.length, 1);
  assert.equal((await call('POST', `/api/admin/replacements/${list[0].id}/status`, { status: 'rejected' }, T.admin)).status, 400);
  assert.equal((await call('POST', `/api/admin/replacements/${list[0].id}/status`, { status: 'rejected', note: 'Scratches from use' }, T.admin)).status, 200);
  const view = (await fetch(`${base}/api/orders/${o.orderNumber}`, { headers: { 'x-guest-token': g } }).then((r) => r.json()));
  assert.deepEqual([view.replacements[0].status, view.replacements[0].adminNote], ['rejected', 'Scratches from use']);
});

test('demo data: identified, hidden toggle, removal needs confirmation and keeps order history', async () => {
  const o = (await order('cod', [{ productId: 1, quantity: 1 }])).body; // a real order of a demo product
  const demo = (await call('GET', '/api/admin/demo', undefined, T.owner)).body;
  assert.deepEqual([demo.demo_products, demo.demo_with_orders, demo.upiIsPlaceholder], [1, 1, false]);
  await call('PATCH', '/api/admin/settings', { show_demo_products: false }, T.owner);
  assert.equal((await call('GET', '/api/products?q=Demo')).body.total, 0);
  assert.equal((await call('POST', '/api/cart/quote', { items: [{ productId: 1, quantity: 1 }] })).body.problems[0].issue, 'unavailable');
  assert.equal((await call('POST', '/api/admin/demo/remove', { confirm: 'yes' }, T.owner)).status, 400);
  assert.equal((await call('POST', '/api/admin/demo/remove', { confirm: 'REMOVE DEMO DATA' }, T.admin)).status, 403);
  const r = (await call('POST', '/api/admin/demo/remove', { confirm: 'REMOVE DEMO DATA' }, T.owner)).body;
  assert.equal(r.removedProducts, 1);
  assert.equal((await sql('SELECT count(*)::int AS n FROM products WHERE is_demo')).rows[0].n, 0);
  assert.equal((await sql(`SELECT count(*)::int AS n FROM products WHERE NOT is_demo`)).rows[0].n, 3);
  const item = (await sql('SELECT i.* FROM order_items i JOIN orders o ON o.id = i.order_id WHERE o.order_number = $1', [o.orderNumber])).rows[0];
  assert.deepEqual([item.sku, item.name, item.product_id], ['AJ-100', 'Demo Ring', null]);
  assert.equal((await sql('SELECT count(*)::int AS n FROM orders')).rows[0].n > 0, true);
  // real ordered products cannot be hard-deleted
  assert.equal((await call('DELETE', '/api/admin/products/2', undefined, T.admin)).status, 409);
});

test('employees: owner manages accounts; deactivation revokes access', async () => {
  const e = await call('POST', '/api/admin/staff', { name: 'New Rider', mobile: '9000000009', role: 'employee', password: 'rider-pass-1' }, T.owner);
  assert.equal(e.status, 201);
  assert.equal((await call('POST', '/api/admin/staff', { name: 'X', mobile: '9000000008', role: 'employee', password: 'rider-pass-1' }, T.admin)).status, 403);
  const tok = (await call('POST', '/api/admin/auth/login', { mobile: '9000000009', password: 'rider-pass-1' })).body.token;
  assert.equal((await call('GET', '/api/admin/my-orders', undefined, tok)).status, 200);
  await call('PUT', `/api/admin/staff/${e.body.id}`, { name: 'New Rider', mobile: '9000000009', role: 'employee', active: false }, T.owner);
  assert.equal((await call('GET', '/api/admin/my-orders', undefined, tok)).status, 401);
  assert.equal((await call('PUT', '/api/admin/staff/1', { name: 'Olivia Owner', mobile: '9000000001', role: 'owner', active: false }, T.owner)).status, 400);
  await call('POST', `/api/admin/staff/${e.body.id}/password`, { password: 'another-pass' }, T.owner);
  assert.equal((await call('GET', '/api/admin/staff', undefined, T.admin)).body.every((s) => s.role === 'employee'), true);
});

test('promotions: offers drive customer banners; broadcasts only reach opted-in customers', async () => {
  const off = await call('POST', '/api/admin/offers', { kind: 'festival', title: 'Diwali Sparkle', subtitle: 'Up to 40% off', link: '/collection/offers', cta: 'Shop' }, T.owner);
  assert.equal(off.status, 201);
  await call('POST', '/api/admin/offers', { title: 'Expired', endsAt: '2001-01-01', startsAt: '2000-01-01' }, T.owner);
  assert.deepEqual((await call('GET', '/api/settings')).body.banners.map((b) => b.title), ['Diwali Sparkle']);
  const yes = (await call('POST', '/api/auth/register', { name: 'Yes', mobile: '9876511111', password: 'secret123', marketingOptIn: true })).body.token;
  const no = (await call('POST', '/api/auth/register', { name: 'No', mobile: '9876522222', password: 'secret123' })).body.token;
  const b = await call('POST', '/api/admin/notifications/broadcast', { type: 'festival', title: 'Festival collection is live', link: '/' }, T.owner);
  assert.equal(b.body.recipients, 1);
  const seen = async (t) => (await call('GET', '/api/notifications', undefined, t)).body.items.some((n) => n.title === 'Festival collection is live');
  assert.equal(await seen(yes), true);
  assert.equal(await seen(no), false);
  await call('PATCH', '/api/me', { name: 'No', marketingOptIn: true }, no);
  assert.equal(await seen(no), true);
});

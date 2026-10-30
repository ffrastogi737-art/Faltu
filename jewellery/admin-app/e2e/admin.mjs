// End-to-end: owner / admin / employee drive the admin app in Chromium against the real backend +
// PostgreSQL, and every change is checked on the customer side (API and customer PWA).
// Needs both apps built (`npm run build` in admin-app and customer-app).
import { spawn } from 'node:child_process';
import { createRequire } from 'node:module';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import assert from 'node:assert/strict';

const backendReq = createRequire(new URL('../../backend/package.json', import.meta.url));
const pg = backendReq('pg');
const sharp = backendReq('sharp');
const { chromium } = createRequire(import.meta.url)('playwright');

const dbUrl = new URL(process.env.E2E_DATABASE_URL || 'postgres://jewel:jewel@127.0.0.1:5432/jewellery_admin_e2e');
const root = new pg.Client({ connectionString: Object.assign(new URL(dbUrl), { pathname: '/postgres' }).toString() });
await root.connect();
await root.query(`DROP DATABASE IF EXISTS ${dbUrl.pathname.slice(1)} WITH (FORCE)`);
await root.query(`CREATE DATABASE ${dbUrl.pathname.slice(1)}`);
await root.end();

const backend = new URL('../../backend/', import.meta.url).pathname;
const shots = process.env.SHOTS_DIR || mkdtempSync(`${tmpdir()}/jw-admin-shots-`);
const files = mkdtempSync(`${tmpdir()}/jw-admin-files-`);
const env = {
  ...process.env, DATABASE_URL: dbUrl.toString(), PORT: '4200', UPLOAD_DIR: mkdtempSync(`${tmpdir()}/jw-admin-up-`),
  STATIC_DIR: new URL('../../customer-app/dist', import.meta.url).pathname, ADMIN_STATIC_DIR: new URL('../dist', import.meta.url).pathname,
};
const run = (args, extra = {}) => new Promise((ok, fail) => spawn('node', args, { cwd: backend, env: { ...env, ...extra }, stdio: ['ignore', 'ignore', 'inherit'] }).on('exit', (c) => (c ? fail(new Error(args.join(' '))) : ok())));
await run(['scripts/seed.js']);
for (const [name, mobile, role] of [['Olivia Owner', '9000000001', 'owner'], ['Arun Admin', '9000000002', 'admin'], ['Emil Rider', '9000000003', 'employee']]) {
  await run(['scripts/create-staff.js', '--name', name, '--mobile', mobile, '--role', role], { STAFF_PASSWORD: 'password123' });
}
const server = spawn('node', ['src/server.js'], { cwd: backend, env, stdio: ['ignore', 'ignore', 'inherit'] });
const db = new pg.Client({ connectionString: dbUrl.toString() });
await db.connect();
const base = 'http://127.0.0.1:4200';
for (let i = 0; i < 50; i++) {
  try { if ((await fetch(`${base}/api/health`)).ok) break; } catch { /* starting */ }
  await new Promise((r) => setTimeout(r, 200));
}
const api = async (method, path, body, headers = {}) => {
  const r = await fetch(base + '/api' + path, { method, headers: { 'content-type': 'application/json', ...headers }, body: body && JSON.stringify(body) });
  return { status: r.status, body: await r.json() };
};
const address = { house: '7', street: 'MI Road', area: 'C-Scheme', city: 'Jaipur', state: 'Rajasthan', pincode: '302001', landmark: '' };
const custOrder = (productId, paymentMethod) => api('POST', '/orders', { items: [{ productId, quantity: 1 }], paymentMethod, contact: { name: 'Ritu Sharma', mobile: '9811122233' }, address });

// test photos
const png = (w, h, color) => sharp({ create: { width: w, height: h, channels: 3, background: color } }).png().toBuffer();
writeFileSync(`${files}/logo.png`, await png(600, 200, '#17140f'));
writeFileSync(`${files}/icon.png`, await png(512, 512, '#b07a1a'));
writeFileSync(`${files}/photo1.jpg`, await sharp({ create: { width: 2400, height: 2400, channels: 3, background: '#d8b56a' } }).jpeg().toBuffer());
writeFileSync(`${files}/photo2.png`, await png(1200, 1200, '#9b1b30'));
writeFileSync(`${files}/import.csv`, 'Product Name,SKU,Category,Original Price,Selling Price,Stock,Description\nPearl Drop Studs,KJ-EAR-010,Earrings,899,699,12,Freshwater-look pearls\nBroken Row,KJ-X,Hats,1,1,1,\n');

const browser = await chromium.launch();
const errors = [];
async function staffPage(mobile, viewport = { width: 1366, height: 900 }) {
  const ctx = await browser.newContext({ viewport });
  const page = await ctx.newPage();
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto(`${base}/admin/login`);
  await page.getByLabel('Mobile number', { exact: true }).fill(mobile);
  await page.getByLabel('Password', { exact: true }).fill('password123');
  await page.getByRole('button', { name: 'Sign in' }).click();
  return page;
}
const step = (s) => console.log('✓', s);
let owner;

try {
  // ---------- owner ----------
  owner = await staffPage('9000000001');
  await owner.getByRole('heading', { name: 'Dashboard' }).waitFor();
  await owner.getByText('Replace the demo UPI ID').waitFor();
  await owner.getByText('Actual money collected').waitFor();
  await owner.screenshot({ path: `${shots}/01-dashboard.png`, fullPage: true });
  step('1. owner login → dashboard with setup checklist');

  // branding
  await owner.goto(`${base}/admin/settings?tab=branding`);
  await owner.getByLabel('Store name', { exact: true }).fill('Kanak Jewels');
  await owner.getByLabel('Brand display name', { exact: true }).fill('KANAK');
  await owner.getByLabel('Upload Logo', { exact: true }).setInputFiles(`${files}/logo.png`);
  await owner.getByAltText('Logo preview').first().waitFor();
  await owner.getByLabel('Upload App icon', { exact: true }).setInputFiles(`${files}/icon.png`);
  await owner.getByAltText('App icon preview').first().waitFor();
  await owner.getByText('Unsaved changes').waitFor();
  assert.equal((await api('GET', '/settings')).body.shopName, 'Aabha Jewels', 'preview does not publish');
  await owner.screenshot({ path: `${shots}/02-branding.png`, fullPage: true });
  await owner.getByRole('button', { name: 'Save changes' }).click();
  await owner.getByText('Saved — the customer app updates automatically').waitFor();
  const pub = (await api('GET', '/settings')).body;
  assert.deepEqual([pub.shopName, pub.brandName], ['Kanak Jewels', 'KANAK']);
  assert.match(pub.logoUrl, /^\/uploads\/logo\/.+\.webp$/);
  const manifest = await (await fetch(`${base}/manifest.webmanifest`)).json();
  assert.equal(manifest.name, 'KANAK');
  assert.match(manifest.icons[0].src, /-192\.png$/);
  step('4–6. store name, logo and app icon updated (preview before save, manifest follows)');

  // payments
  await owner.goto(`${base}/admin/settings?tab=payments`);
  await owner.getByText('This is the demo UPI ID').waitFor();
  await owner.getByLabel('Merchant UPI ID', { exact: true }).fill('kanak jewels');
  await owner.getByRole('button', { name: 'Save changes' }).click();
  await owner.getByText('UPI ID looks invalid').waitFor();
  await owner.getByLabel('Merchant UPI ID', { exact: true }).fill('kanakjewels@okhdfcbank');
  await owner.getByLabel('Merchant display name', { exact: true }).fill('Kanak Jewels Jaipur');
  owner.once('dialog', (d) => { assert.match(d.message(), /belongs to your merchant account/); d.accept(); });
  await owner.getByRole('button', { name: 'Save changes' }).click();
  await owner.getByText('Saved — the customer app updates automatically').waitFor();
  step('7–8. UPI ID validated + changed with ownership warning; merchant name changed');

  // discount
  await owner.goto(`${base}/admin/settings?tab=discount`);
  await owner.getByLabel('Discount percentage', { exact: true }).fill('5');
  await owner.getByText('discount ₹50').waitFor();
  await owner.getByRole('button', { name: 'Save changes' }).click();
  await owner.getByText('Saved — the customer app updates automatically').waitFor();
  step('10. UPI discount updated to 5%');

  // customer app reflects branding + discount
  const cust = await (await browser.newContext({ viewport: { width: 390, height: 844 } })).newPage();
  cust.on('pageerror', (e) => errors.push(e.message));
  await cust.goto(base);
  await cust.getByAltText('KANAK').first().waitFor();
  await cust.getByText('Pay via UPI & save 5%').waitFor();
  assert.equal(await cust.title(), 'KANAK');
  await cust.screenshot({ path: `${shots}/03-customer-branded.png` });
  step('17. customer app shows new logo, name and discount');

  // demo data
  await owner.goto(`${base}/admin/demo-data`);
  await owner.getByText('Demo products', { exact: true }).waitFor();
  assert.equal(await owner.locator('text=36').count() > 0, true);
  await owner.getByRole('button', { name: 'Hide demo products' }).click();
  await owner.getByText('Demo products hidden from customers').waitFor();
  assert.equal((await api('GET', '/products')).body.total, 0);
  step('11. 36 demo products identified and hidden from customers');

  // real product with photos
  await owner.goto(`${base}/admin/products/new`);
  await owner.getByLabel('Product name', { exact: true }).fill('Kundan Bridal Choker');
  await owner.getByLabel('SKU', { exact: true }).fill('KJ-BR-001');
  await owner.getByLabel('Category', { exact: true }).selectOption({ label: 'Bridal Jewellery' });
  await owner.getByLabel('Description', { exact: true }).fill('Hand-set kundan choker with matching earrings.');
  await owner.getByLabel('Original price (₹)', { exact: true }).fill('4999');
  await owner.getByLabel('Selling price (₹)', { exact: true }).fill('3999');
  await owner.getByLabel('Opening stock', { exact: true }).fill('6');
  await owner.getByLabel('Upload product photos', { exact: true }).setInputFiles([`${files}/photo1.jpg`, `${files}/photo2.png`]);
  await owner.getByAltText('Product image 2').waitFor();
  await owner.getByRole('button', { name: 'Set main' }).click();
  await owner.getByLabel('Featured', { exact: true }).check();
  await owner.getByPlaceholder('e.g. Weight').first().fill('Plating');
  await owner.screenshot({ path: `${shots}/04-product-form.png`, fullPage: true });
  await owner.getByRole('button', { name: 'Save product' }).click();
  await owner.getByText('Product created — live in the customer app').waitFor();
  const productId = Number(new URL(owner.url()).pathname.split('/').pop());
  let p = (await api('GET', '/products?q=Kundan')).body.items[0];
  assert.equal(p.sellingPricePaise, 399900);
  assert.equal(p.images.length, 2);
  assert.match(p.images[0], /\.webp$/);
  assert.deepEqual(p.tags, ['featured']);
  step('13–14. real product created with 2 uploaded photos (reordered, optimised to WebP)');

  await owner.getByLabel('Selling price (₹)', { exact: true }).fill('3499');
  await owner.getByRole('button', { name: 'Save product' }).click();
  await owner.getByText('Product saved').waitFor();
  await owner.getByLabel('Quantity', { exact: true }).fill('4');
  await owner.getByRole('button', { name: 'Update stock' }).click();
  await owner.getByText('Stock is now 10').waitFor();
  p = (await api('GET', `/products/${p.slug}`)).body;
  assert.deepEqual([p.sellingPricePaise, p.stock], [349900, 10]);
  await cust.goto(`${base}/product/${p.slug}`);
  await cust.getByRole('heading', { name: 'Kundan Bridal Choker' }).waitFor();
  await cust.getByText('₹3,499').first().waitFor();
  step('15–17. price and stock update reach the customer product page');

  // CSV import
  await owner.goto(`${base}/admin/import`);
  await owner.getByLabel('CSV file', { exact: true }).setInputFiles(`${files}/import.csv`);
  await owner.getByRole('button', { name: 'Validate & preview' }).click();
  await owner.getByText('Unknown category "Hats"').waitFor();
  await owner.getByRole('button', { name: 'Import 1 valid product(s)' }).click();
  await owner.getByText('1 products added').waitFor();
  assert.equal((await api('GET', '/products?q=Pearl%20Drop')).body.total, 1);
  step('bulk CSV import: preview, invalid row rejected, valid row imported');

  // remove demo data
  const demoOrder = await (async () => { await db.query('UPDATE store_settings SET show_demo_products = true'); const r = await custOrder(1, 'cod'); await db.query('UPDATE store_settings SET show_demo_products = false'); return r.body; })();
  await owner.goto(`${base}/admin/demo-data`);
  await owner.getByRole('button', { name: /Permanently remove/ }).waitFor();
  assert.equal(await owner.getByRole('button', { name: /Permanently remove/ }).isDisabled(), true);
  await owner.getByLabel('Type REMOVE DEMO DATA to confirm', { exact: true }).fill('REMOVE DEMO DATA');
  await owner.getByRole('button', { name: /Permanently remove 36 demo products/ }).click();
  await owner.getByText('No demo products left.').waitFor();
  const kept = (await db.query('SELECT i.name, i.sku FROM order_items i JOIN orders o ON o.id = i.order_id WHERE o.order_number = $1', [demoOrder.orderNumber])).rows[0];
  assert.equal(kept.sku, 'AJ-100');
  assert.equal((await db.query('SELECT count(*)::int AS n FROM products')).rows[0].n, 2);
  step('12. demo products removed after typed confirmation; order history and real products kept');

  // ---------- orders, payments, delivery ----------
  const upi = (await custOrder(productId, 'upi')).body;
  assert.match(upi.upiLink, /^upi:\/\/pay\?pa=kanakjewels%40okhdfcbank&pn=Kanak%20Jewels%20Jaipur&tr=JW\d+/);
  assert.equal(upi.totals.upiDiscountPercent, 5);
  step('9. new payment link uses the new UPI ID, merchant name, exact amount and order id');
  await api('POST', `/orders/${upi.orderNumber}/payment-confirmation`, { reference: '512345678901' }, { 'x-guest-token': upi.guestToken });
  const cod = (await custOrder(productId, 'cod')).body;

  const admin = await staffPage('9000000002');
  await admin.getByRole('heading', { name: 'Orders' }).waitFor();
  assert.equal(await admin.getByRole('link', { name: 'Dashboard' }).count(), 0);
  assert.equal(await admin.getByRole('link', { name: 'Store Settings' }).count(), 0);
  await admin.goto(`${base}/admin/settings`);
  await admin.getByRole('heading', { name: 'Orders' }).waitFor();
  await admin.getByRole('link', { name: `#${cod.orderNumber}` }).click();
  for (const s of ['Confirmed', 'Preparing', 'Ready for Delivery']) {
    await admin.getByRole('button', { name: `Mark ${s}` }).click();
    await admin.getByText(`Marked ${s}`).waitFor();
  }
  await admin.getByLabel('Delivery employee', { exact: true }).selectOption({ label: 'Emil Rider (0 open)' });
  await admin.getByText('Employee assigned').waitFor();
  assert.equal(await admin.getByRole('button', { name: 'Verify payment' }).count(), 0);
  step('18, 21. admin confirms/prepares the order and assigns the employee (no dashboard/settings for admin)');

  const emp = await staffPage('9000000003', { width: 390, height: 844 });
  await emp.getByRole('heading', { name: 'My Deliveries' }).waitFor();
  await emp.getByText(`#${cod.orderNumber}`).waitFor();
  await emp.screenshot({ path: `${shots}/05-employee-deliveries.png` });
  assert.equal((await api('GET', '/admin/dashboard', undefined, { authorization: `Bearer ${await emp.evaluate(() => localStorage.getItem('staffToken'))}` })).status, 403);
  await emp.goto(`${base}/admin/settings`);
  await emp.getByRole('heading', { name: 'My Deliveries' }).waitFor();
  await emp.getByText(`#${cod.orderNumber}`).click();
  await emp.getByRole('button', { name: 'Mark picked up' }).click();
  await emp.getByText('Marked picked up').waitFor();
  await emp.getByRole('button', { name: 'Mark Out for Delivery' }).click();
  await emp.getByText('Marked Out for Delivery').waitFor();
  await emp.getByRole('button', { name: 'Mark Delivered' }).click();
  await emp.getByText('Marked Delivered').waitFor();
  await emp.getByRole('button', { name: /Record ₹.* collected/ }).click();
  await emp.getByText('Cash collection recorded').waitFor();
  await emp.screenshot({ path: `${shots}/06-employee-order.png`, fullPage: true });
  const delivered = (await api('GET', `/orders/${cod.orderNumber}`, undefined, { 'x-guest-token': cod.guestToken })).body;
  assert.deepEqual([delivered.status, delivered.paymentStatus, delivered.deliveryAgentName], ['delivered', 'verified', 'Emil Rider']);
  const row = (await db.query('SELECT delivered_by, cod_collected_paise, total_paise FROM orders WHERE order_number = $1', [cod.orderNumber])).rows[0];
  assert.equal(row.cod_collected_paise, row.total_paise);
  step('20, 22, 24. employee picks up, delivers without OTP, records COD; blocked from owner pages');

  // UPI verification by owner
  await owner.goto(`${base}/admin/payments`);
  await owner.getByRole('link', { name: `#${upi.orderNumber}` }).click();
  await owner.getByRole('button', { name: 'Verify payment' }).click();
  await owner.getByText('Customer reference: 512345678901').waitFor();
  assert.equal(await owner.getByRole('button', { name: 'Confirm payment verified' }).isDisabled(), true);
  await owner.getByLabel(/Transaction reference/).fill('512345678901');
  await owner.getByLabel(/I checked my bank/).check();
  await owner.getByRole('button', { name: 'Confirm payment verified' }).click();
  await owner.getByText('Payment verified', { exact: true }).waitFor();
  assert.equal((await api('GET', `/orders/${upi.orderNumber}`, undefined, { 'x-guest-token': upi.guestToken })).body.paymentStatus, 'verified');
  step('19. owner verifies UPI only with bank reference + explicit bank-credit confirmation');

  // replacement
  const png64 = 'data:image/png;base64,' + (await png(8, 8, '#f00')).toString('base64');
  await api('POST', `/orders/${cod.orderNumber}/replacements`, { orderItemId: delivered.items[0].id, issue: 'damaged', description: 'Stone missing', photos: [png64] }, { 'x-guest-token': cod.guestToken });
  await admin.goto(`${base}/admin/replacements`);
  await admin.getByText(`#${cod.orderNumber}`).click();
  await admin.getByAltText('Customer photo').waitFor();
  await admin.getByLabel('Status', { exact: true }).selectOption('approved');
  await admin.getByRole('button', { name: 'Save' }).click();
  await admin.getByText('Replacement updated').waitFor();
  assert.equal((await api('GET', `/orders/${cod.orderNumber}`, undefined, { 'x-guest-token': cod.guestToken })).body.replacements[0].status, 'approved');
  step('23. replacement reviewed with customer photos and approved; customer sees it');

  // dashboard + reports
  await owner.goto(`${base}/admin/`);
  const d = (await api('GET', '/admin/dashboard', undefined, { authorization: `Bearer ${await owner.evaluate(() => localStorage.getItem('staffToken'))}` })).body;
  assert.equal(d.summary.collected_paise, upi.totals.totalPaise + row.total_paise);
  await owner.getByText('Actual money collected').waitFor();
  await owner.getByText('Kundan Bridal Choker').first().waitFor();
  await owner.screenshot({ path: `${shots}/07-dashboard-after.png`, fullPage: true });
  await owner.goto(`${base}/admin/reports`);
  const dl = owner.waitForEvent('download');
  await owner.getByRole('button', { name: 'Export CSV' }).click();
  assert.match((await dl).suggestedFilename(), /^daily-sales-.*\.csv$/);
  await owner.goto(`${base}/admin/audit`);
  await owner.getByText('aabhajewels@upi').first().waitFor();
  step('25. dashboard collected = verified UPI + recorded cash; CSV export; audit log shows UPI change');

  assert.deepEqual(errors, [], 'no page errors');
  console.log(`\nAll admin journeys passed. Screenshots: ${shots}`);
} catch (err) {
  await owner?.screenshot({ path: `${shots}/failure-owner.png` }).catch(() => {});
  console.error('page errors:', errors);
  throw err;
} finally {
  await browser.close();
  await db.end();
  server.kill();
}

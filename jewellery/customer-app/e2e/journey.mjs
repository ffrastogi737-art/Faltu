// End-to-end customer journey: real backend + PostgreSQL + built PWA in Chromium.
// Needs: `npm run build` first, a Postgres the test may create/drop a DB in (E2E_DATABASE_URL).
// Staff actions from the admin app are simulated with direct SQL on the shared database.
import { spawn } from 'node:child_process';
import { createRequire } from 'node:module';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import assert from 'node:assert/strict';

const require = createRequire(new URL('../../backend/package.json', import.meta.url));
const pg = require('pg');
const { chromium } = createRequire(import.meta.url)('playwright');

const dbUrl = new URL(process.env.E2E_DATABASE_URL || 'postgres://jewel:jewel@127.0.0.1:5432/jewellery_e2e');
const root = new pg.Client({ connectionString: Object.assign(new URL(dbUrl), { pathname: '/postgres' }).toString() });
await root.connect();
await root.query(`DROP DATABASE IF EXISTS ${dbUrl.pathname.slice(1)} WITH (FORCE)`);
await root.query(`CREATE DATABASE ${dbUrl.pathname.slice(1)}`);
await root.end();

const backend = new URL('../../backend/', import.meta.url).pathname;
const shots = process.env.SHOTS_DIR || mkdtempSync(`${tmpdir()}/jw-shots-`);
const env = { ...process.env, DATABASE_URL: dbUrl.toString(), PORT: '4100', STATIC_DIR: new URL('../dist', import.meta.url).pathname, UPLOAD_DIR: mkdtempSync(`${tmpdir()}/jw-up-`) };
await new Promise((ok, fail) => spawn('node', ['scripts/seed.js'], { cwd: backend, env, stdio: 'inherit' }).on('exit', (c) => (c ? fail(new Error('seed failed')) : ok())));
const server = spawn('node', ['src/server.js'], { cwd: backend, env, stdio: ['ignore', 'inherit', 'inherit'] });
const db = new pg.Client({ connectionString: dbUrl.toString() });
await db.connect();
const base = 'http://127.0.0.1:4100';
for (let i = 0; i < 50; i++) {
  try { if ((await fetch(`${base}/api/health`)).ok) break; } catch { /* starting */ }
  await new Promise((r) => setTimeout(r, 200));
}

const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
const page = await ctx.newPage();
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
page.on('console', (m) => m.type() === 'error' && !/Failed to load resource|ERR_UNKNOWN_URL_SCHEME/.test(m.text()) && errors.push(m.text()));
const step = (name) => console.log('✓', name);
const shot = (name) => page.screenshot({ path: `${shots}/${name}.png`, fullPage: false });

try {
  // Home
  await page.goto(base);
  await page.getByText('Pay via UPI & save 3%').waitFor();
  await page.getByRole('heading', { name: 'New Arrivals' }).waitFor();
  await page.getByRole('heading', { name: 'Best Sellers' }).waitFor();
  await page.getByRole('heading', { name: 'Special Offers' }).waitFor();
  await shot('01-home');
  step('home shows banner, UPI offer, categories and collections from the backend');

  // Category -> product
  await page.getByRole('link', { name: 'Categories', exact: true }).click();
  await page.getByRole('link', { name: /Earrings/ }).first().click();
  await page.waitForURL('**/category/earrings');
  await page.getByRole('heading', { name: 'Earrings', level: 1 }).waitFor();
  await page.getByText('3 designs', { exact: true }).waitFor();
  await shot('02-category');
  await page.locator('a[href^="/product/"]').first().click();
  await page.getByRole('heading', { name: 'Specifications' }).waitFor();
  await page.getByText(/^SKU AJ-/).waitFor();
  await page.getByRole('heading', { name: 'Related Jewellery' }).waitFor();
  await shot('03-product');
  await page.getByRole('button', { name: 'Add to wishlist' }).click();
  await page.getByRole('button', { name: 'Increase quantity' }).click();
  await page.getByRole('button', { name: 'Add to cart' }).click();
  await page.getByText('Added to cart').waitFor();
  step('product page: gallery, specs, related, wishlist and add-to-cart');

  // Search
  await page.goto(`${base}/search?q=bangle`);
  await page.getByText(/designs?$/).first().waitFor();
  assert.ok(await page.locator('a[href^="/product/"]').count() > 0, 'search finds bangles');
  step('search');

  // Cart -> checkout as guest
  await page.locator('nav a[href="/cart"]').click();
  await page.getByText('Final amount').waitFor();
  await shot('04-cart');
  await page.getByRole('button', { name: 'Proceed to checkout' }).click();
  await page.getByText('Pay Online & Save 3%').waitFor();
  const fill = async (label, v) => page.getByLabel(label, { exact: true }).fill(v);
  await fill('Full name', 'Asha Verma');
  await fill('Mobile number', '9812345678');
  await fill('House / Flat no.', '21');
  await fill('Street', 'Station Road');
  await fill('Area / Locality', 'Malviya Nagar');
  await fill('City', 'Jaipur');
  await fill('State', 'Rajasthan');
  await fill('PIN code', '302017');
  await fill('Landmark', 'Opp. park');
  const placeBtn = page.getByRole('button', { name: /Place order/ });
  await page.getByRole('button', { name: /Place order · / }).waitFor();
  const upiLabel = await placeBtn.textContent();
  await page.getByText('Pay When Your Order Arrives').click();
  await page.getByRole('button', { name: /Place order · / }).filter({ hasNotText: upiLabel }).waitFor();
  const codLabel = await placeBtn.textContent();
  assert.notEqual(upiLabel, codLabel, 'total changes with payment method');
  await page.getByText('Pay Online & Save 3%').click();
  await page.getByText(/UPI discount \(3%\)/).waitFor();
  await shot('05-checkout');
  await placeBtn.click();
  await page.getByText(/Thank you, Asha/).waitFor();
  step(`guest UPI order placed (${upiLabel.trim()} vs COD ${codLabel.trim()})`);

  const upiHref = await page.getByRole('link', { name: /with UPI app/ }).getAttribute('href');
  assert.match(upiHref, /^upi:\/\/pay\?pa=aabhajewels%40upi&pn=Demo%20Jewellery%20Store&tr=JW\d+&tn=.+&am=\d+\.\d{2}&cu=INR$/);
  await page.getByText('Payment Pending').first().waitFor();
  await shot('06-order-upi');
  await page.getByLabel(/UPI reference/).fill('412398765432');
  await page.getByRole('button', { name: 'I have completed the payment' }).click();
  await page.getByText('Verification Pending').first().waitFor();
  step('UPI deep link correct; customer confirmation moves to Verification Pending (not Verified)');

  const guestOrder = (await db.query('SELECT order_number, total_paise, payment_status FROM orders ORDER BY id DESC LIMIT 1')).rows[0];
  assert.equal(guestOrder.payment_status, 'verification_pending');

  // Admin verifies payment + moves order: customer page updates live (guest => polling/SSE fallback)
  await db.query(`UPDATE orders SET payment_status='verified', status='confirmed' WHERE order_number=$1`, [guestOrder.order_number]);
  await page.reload();
  await page.getByText('Payment Verified').first().waitFor();
  step('payment verified by staff shows as Payment Verified');

  // Register and place a COD order, then cancel it
  await page.goto(`${base}/register`);
  await page.getByLabel('Full name').fill('Meera Shah');
  await page.getByLabel('Mobile number').fill('9876501234');
  await page.getByLabel('Password').fill('meera-pass-1');
  await page.getByRole('button', { name: 'Create account' }).click();
  await page.getByText('Meera Shah').waitFor();
  await shot('07-account');
  step('registration + login');

  const product = (await db.query(`SELECT slug, stock FROM products WHERE stock > 2 ORDER BY id LIMIT 1`)).rows[0];
  await page.goto(`${base}/product/${product.slug}`);
  await page.getByRole('button', { name: 'Add to cart' }).click();
  await page.goto(`${base}/checkout`);
  await page.getByLabel('Full name').waitFor();
  assert.equal(await page.getByLabel('Full name').inputValue(), 'Meera Shah');
  await page.getByLabel('House / Flat no.').fill('5');
  await page.getByLabel('Area / Locality').fill('Vaishali Nagar');
  await page.getByLabel('City').fill('Jaipur');
  await page.getByLabel('State').fill('Rajasthan');
  await page.getByLabel('PIN code').fill('302021');
  await page.getByText('Pay When Your Order Arrives').click();
  await page.getByRole('button', { name: /Place order/ }).click();
  await page.waitForURL(/\/orders\/JW\d+/);
  await page.getByText(/in cash when your order arrives/).waitFor();
  const codNumber = new URL(page.url()).pathname.split('/').pop();
  assert.equal((await db.query('SELECT stock FROM products WHERE slug=$1', [product.slug])).rows[0].stock, product.stock - 1);
  page.once('dialog', (d) => d.accept('Ordered by mistake'));
  await page.getByRole('button', { name: 'Cancel order' }).click();
  await page.getByText('Reason: Ordered by mistake').waitFor();
  assert.equal((await db.query('SELECT stock FROM products WHERE slug=$1', [product.slug])).rows[0].stock, product.stock);
  step('COD order placed, cancelled, stock restored');

  // Second COD order goes all the way to delivered via staff updates, with live SSE refresh
  await page.goto(`${base}/product/${product.slug}`);
  await page.getByRole('button', { name: 'Add to cart' }).click();
  await page.goto(`${base}/checkout`);
  await page.getByText('Deliver to a new address').waitFor(); // saved address from the previous order
  await page.getByText('Pay When Your Order Arrives').click();
  await page.getByRole('button', { name: /Place order/ }).click();
  await page.waitForURL(/\/orders\/JW\d+/);
  await page.getByText(/in cash when your order arrives/).waitFor();
  const number = new URL(page.url()).pathname.split('/').pop();
  assert.notEqual(number, codNumber);
  for (const s of ['confirmed', 'preparing', 'ready_for_delivery']) await db.query(`UPDATE orders SET status=$2 WHERE order_number=$1`, [number, s]);
  await db.query(`UPDATE orders SET status='out_for_delivery', delivery_agent_name='Ravi (Delivery)' WHERE order_number=$1`, [number]);
  await page.getByText('Ravi (Delivery)').waitFor({ timeout: 8000 });
  await db.query(`UPDATE orders SET status='delivered' WHERE order_number=$1`, [number]);
  await page.getByText(/Report an issue within/).waitFor({ timeout: 8000 });
  await shot('08-delivered');
  step('status timeline updates live from staff changes (no page reload), no delivery OTP');

  // Replacement request with photo
  await page.getByRole('link', { name: 'Request replacement' }).click();
  await page.getByText('Time left to report').waitFor();
  await page.locator('input[name=item]').first().check();
  await page.getByText('Product received damaged').click();
  const photo = `${shots}/photo.png`;
  writeFileSync(photo, Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==', 'base64'));
  await page.locator('input[type=file]').setInputFiles(photo);
  await page.getByAltText('Photo 1').waitFor();
  await shot('09-replacement');
  await page.getByRole('button', { name: 'Submit replacement request' }).click();
  await page.getByText('Requested', { exact: true }).waitFor();
  await db.query(`UPDATE replacement_requests SET status='under_review'`);
  await page.getByText('Under Review', { exact: true }).waitFor({ timeout: 35000 });
  assert.equal(await page.getByRole('button', { name: /return|refund/i }).count(), 0, 'no return/refund actions');
  step('replacement requested with photo; status follows staff review');

  // Notifications
  await page.goto(`${base}/notifications`);
  await page.getByText('Replacement under review').waitFor();
  await page.getByText('Out for delivery').first().waitFor();
  await shot('10-notifications');
  step('in-app notifications for order + replacement updates');

  // Owner changes UPI discount -> reflected live
  await page.goto(base);
  await page.getByText('Pay via UPI & save 3%').waitFor();
  await db.query('UPDATE store_settings SET upi_discount_percent = 5');
  await page.getByText('Pay via UPI & save 5%').waitFor({ timeout: 8000 });
  step('UPI discount change by owner appears live');

  // Orders list + logout
  await page.goto(`${base}/orders`);
  // 2 account orders + the guest order kept on this device
  await page.waitForFunction(() => document.querySelectorAll('a[href^="/orders/JW"]').length === 3);
  await page.goto(`${base}/account`);
  await page.getByRole('button', { name: 'Log out' }).click();
  await page.waitForFunction(() => !localStorage.getItem('token'));
  await page.goto(`${base}/account`);
  await page.getByRole('link', { name: 'Log in' }).first().waitFor();
  step('order history + logout');

  // Offline: catalogue still opens from the service worker cache
  await page.goto(base);
  await page.waitForFunction(() => navigator.serviceWorker?.controller);
  await page.reload();
  await page.getByRole('heading', { name: 'New Arrivals' }).waitFor();
  await ctx.setOffline(true);
  await page.reload();
  await page.getByRole('heading', { name: 'New Arrivals' }).waitFor();
  await ctx.setOffline(false);
  step('works offline from cache');

  assert.deepEqual(errors, [], 'no page errors');
  console.log(`\nAll customer journeys passed. Screenshots: ${shots}`);
} catch (err) {
  await shot('failure').catch(() => {});
  console.error('page errors:', errors);
  throw err;
} finally {
  await browser.close();
  await db.end();
  server.kill();
}

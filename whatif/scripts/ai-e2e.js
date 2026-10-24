// Real-model check through the UI: import Qwen2.5-0.5B (GGUF), load it with llama.cpp, interpret the spec example.
// Slow (minutes on CPU). Needs .models/qwen2.5-0.5b-instruct-q4_k_m.gguf.
import { createRequire } from 'node:module';
import assert from 'node:assert/strict';
import { startServer } from './serve.js';

const { chromium, devices } = createRequire(import.meta.url)('playwright');
const file = new URL('../.models/qwen2.5-0.5b-instruct-q4_k_m.gguf', import.meta.url).pathname;
const server = await startServer(0);
const browser = await chromium.launch();
const page = await (await browser.newContext({ ...devices['Pixel 7'] })).newPage();
try {
  await page.goto(`http://127.0.0.1:${server.address().port}/#/models`);
  await page.waitForSelector('input[data-action=import-model]', { state: 'attached' });
  let t = Date.now();
  await page.setInputFiles('input[data-action=import-model]', file);
  await page.waitForSelector('[data-action=load-model]', { timeout: 300000 });
  console.log(`imported in ${((Date.now() - t) / 1000).toFixed(1)} s`);
  t = Date.now();
  await page.click('[data-action=load-model]');
  await page.waitForSelector('text=Running locally', { timeout: 300000 });
  console.log(`loaded in ${((Date.now() - t) / 1000).toFixed(1)} s:`, await page.evaluate(() => window.__whatif.ui.ai.info));
  await page.evaluate(() => { location.hash = '#/create'; });
  await page.fill('textarea[name=text]', 'I have ₹50,000. What if I start an online business selling candles at ₹400 each, 30 orders a month, for 12 months?');
  t = Date.now();
  await page.click('form[data-form=interpret] button[type=submit]');
  await page.waitForSelector('[data-action=accept-draft]', { timeout: 600000 });
  console.log(`interpreted in ${((Date.now() - t) / 1000).toFixed(1)} s`);
  const r = await page.evaluate(() => window.__whatif.ui.create.result);
  console.log(JSON.stringify(r.draft, null, 1));
  assert.equal(r.provider, 'llama');
  assert.equal(r.draft.scenario_type, 'business');
  assert.equal(r.draft.values.startingCash, 50000);
  assert.equal(r.draft.values.price, 400);
  await page.click('[data-action=accept-draft]:not([data-fill])');
  await page.waitForSelector('.notice.ai');
  console.log('AI values shown as unconfirmed:', await page.textContent('.notice.ai'));
  console.log('\nAI E2E PASSED');
} catch (e) {
  console.error('AI E2E FAILED', e);
  process.exitCode = 1;
} finally { await browser.close(); server.close(); }

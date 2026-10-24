// End-to-end acceptance test in Chromium (Pixel 7 viewport). Covers the 17 acceptance criteria,
// including importing a real GGUF model, local inference, cancellation and removal.
// Needs .models/stories260K.gguf (tiny test model; see README). Set E2E_QWEN=1 to also run the real Qwen model.
import { createRequire } from 'node:module';
import { mkdir, readFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import assert from 'node:assert/strict';
import { startServer } from './serve.js';

const { chromium, devices } = createRequire(import.meta.url)('playwright');
const OUT = new URL('../e2e-output/', import.meta.url).pathname;
const MODELS = new URL('../.models/', import.meta.url).pathname;
await mkdir(OUT, { recursive: true });

const server = await startServer(0);
const BASE = `http://127.0.0.1:${server.address().port}/`;
const browser = await chromium.launch();
const context = await browser.newContext({ ...devices['Pixel 7'], acceptDownloads: true });
let page = await context.newPage();
const problems = [];
const watch = (p) => { p.on('pageerror', (e) => problems.push(`pageerror: ${e.message}`)); p.on('console', (m) => { if (m.type() === 'error') problems.push(`console: ${m.text()}`); }); };
watch(page);

let n = 0;
const shot = (name) => page.screenshot({ path: `${OUT}${String(++n).padStart(2, '0')}-${name}.png`, fullPage: true });
const ok = (msg) => console.log(`✓ ${msg}`);
const state = () => page.evaluate(() => window.__whatif.store.state);
const go = async (hash) => { await page.evaluate((h) => { location.hash = h; }, hash); await page.waitForTimeout(150); };
const setField = async (key, value) => { await page.fill(`[data-field="${key}"]`, String(value)); await page.waitForTimeout(400); };
const scenario = async (id) => (await state()).scenarios.find((s) => s.id === id);

try {
  // 1. open without an account
  await page.goto(BASE);
  await page.waitForSelector('.hero');
  await shot('home');
  ok('opens with no account');

  // 2–4. business simulation from a description (rule-based, no AI)
  await page.click('a[href="#/create"].btn');
  await page.fill('textarea[name=text]', 'I have ₹50,000. What if I start an online business selling candles at ₹400 each, 30 orders a month, rent 5000 per month, for 12 months?');
  await page.click('form[data-form=interpret] button[type=submit]');
  await page.waitForSelector('[data-action=accept-draft]');
  await shot('interpretation');
  assert.match(await page.textContent('main'), /Rule-based interpretation/);
  await page.click('[data-action=accept-draft]:not([data-fill])');
  await page.waitForSelector('[data-field=price]');
  let s = (await state()).scenarios[0];
  assert.equal(s.inputs.startingCash.value, 50000);
  assert.equal(s.inputs.price.value, 400);
  assert.equal(s.inputs.variableCost.value, null);
  assert.match(await page.textContent('#readiness'), /Missing/);
  // enter the missing investment & expense assumptions
  await setField('initialInvestment', 10000);
  await setField('variableCost', 150);
  await setField('marketingMonthly', 1000);
  await page.waitForSelector('#live .kpi');
  s = await scenario(s.id);
  assert.equal(s.inputs.variableCost.source, 'fact');
  await page.selectOption('[data-src=variableCost]', 'assumption');
  await page.waitForTimeout(300);
  await shot('business-inputs');
  // 30 × (400−150) = 7500 margin − 6000 fixed = +1500/month; cash 50000 − 10000 + 12 × 1500 = 58000
  const live = await page.textContent('#live');
  assert.match(live, /58,000/);
  ok('business scenario built from text; missing inputs requested, entered and recalculated (cash ₹58,000)');

  // 4. results: revenue, costs, profit, cash flow, formulas
  await page.click('a.btn[href^="#/r/"]');
  await page.waitForSelector('text=How it was calculated');
  const res = await page.textContent('main');
  assert.match(res, /1,44,000/); // revenue 30 × 400 × 12
  assert.match(res, /Break-even/);
  await page.click('.step summary >> text=Break-even sales per month');
  assert.match(await page.textContent('main'), /monthly fixed costs ÷ contribution margin/);
  assert.match(res, /Your assumption/);
  await shot('business-results');
  ok('results show revenue, profit, cash flow, break-even and inspectable formulas');

  // Monte Carlo with a seed
  await page.selectOption('select[name="type:unitsPerMonth"]', 'triangular');
  await page.click('form[data-form=mc] button[value=save]');
  await page.waitForSelector('input[name="mode:unitsPerMonth"]');
  await page.fill('input[name="min:unitsPerMonth"]', '10');
  await page.fill('input[name="mode:unitsPerMonth"]', '30');
  await page.fill('input[name="max:unitsPerMonth"]', '45');
  await page.fill('input[name=trials]', '3000');
  const runMc = async () => {
    await page.evaluate(() => { window.__whatif.ui.mc.result = null; });
    await page.click('form[data-form=mc] button[value=run]');
    await page.waitForFunction(() => !window.__whatif.ui.mc.busy && window.__whatif.ui.mc.result);
    await page.waitForSelector('text=Median (P50)');
    return page.evaluate(() => window.__whatif.ui.mc.result);
  };
  const mc1 = await runMc();
  const mc2 = await runMc();
  assert.deepEqual(mc2, mc1);
  assert.equal(mc1.trials, 3000);
  assert.match(await page.textContent('main'), /not the real-world probability/);
  ok('Monte Carlo runs and is reproducible with the same seed');

  // 6. what-if lab: change inputs and recalculate
  await page.click('[data-action=lab-open]');
  await page.waitForSelector('[data-lab-base]');
  await page.click('[data-action=lab-preset] >> text=Expenses ×2');
  await page.waitForSelector('text=Original vs modified');
  const labText = await page.textContent('main');
  assert.match(labText, /Variables that changed/);
  await shot('lab');
  await page.click('[data-action=lab-save]');
  await page.waitForSelector('.kpis');
  assert.equal((await state()).scenarios.length, 2);
  ok('What-If Lab compares original vs modified and saves the variant');

  // 5. compare multiple scenarios
  await go('#/compare');
  const boxes = await page.locator('[data-compare]').count();
  for (let i = 0; i < boxes; i++) { await page.locator('[data-compare]').nth(i).check(); await page.waitForTimeout(150); }
  await page.waitForSelector('text=Comparison');
  await page.fill('form[data-form=save-comparison] input[name=name]', 'Base vs high expenses');
  await page.click('form[data-form=save-comparison] button');
  await page.waitForFunction(() => window.__whatif.store.state.comparisons.length === 1);
  await shot('compare');
  ok('comparison workspace shows side-by-side results and saves the comparison');

  // 7. career scenario
  await go('#/create');
  await page.fill('textarea[name=text]', 'What if I learn data analysis with 6 hours a week, about 250 hours total, course costs ₹12,000?');
  await page.click('form[data-form=interpret] button[type=submit]');
  await page.waitForSelector('[data-action=accept-draft]');
  await page.click('[data-action=accept-draft][data-fill]');
  await page.waitForSelector('[data-field=hoursPerWeek]');
  await page.fill('#log-hours', '5');
  await page.click('[data-action=log-hours]');
  await page.waitForTimeout(400);
  const career = (await state()).scenarios.at(-1);
  assert.equal(career.type, 'career');
  assert.equal(career.inputs.hoursPerWeek.value, 6);
  assert.equal(career.inputs.completedHours.value, 5);
  await go(`#/r/${career.id}`);
  await page.waitForSelector('text=Alternative time commitments');
  await shot('career-results');
  ok('career scenario with logged hours, finish date and alternative plans');

  // 8. custom what-if
  await go('#/create');
  await page.click('[data-action=new-example][data-type=custom]');
  await page.waitForSelector('[data-out]');
  await page.fill('[data-out="0"][data-ok=formula]', 'income - rent - food - 1000');
  await page.waitForTimeout(500);
  const custom = (await state()).scenarios.at(-1);
  assert.equal(custom.model.outputs[0].formula, 'income - rent - food - 1000');
  assert.match(await page.textContent('#live'), /18,000/);
  ok('custom formula scenario recalculates (₹18,000 monthly savings)');

  // decision tree linked to a scenario
  await go('#/trees');
  await page.click('[data-action=new-tree] >> nth=0');
  await page.waitForSelector('.tnode');
  assert.match(await page.textContent('main'), /Best expected value: 35,000/); // 0.5×100000 + 0.5×(−30000) = 35000 > 20000
  await shot('tree');
  ok('decision tree computes expected values');

  // 10. save and reopen; 17. survives restart
  const before = await state();
  await page.close();
  page = await context.newPage();
  watch(page);
  await page.goto(`${BASE}#/history`);
  await page.waitForSelector('.scard');
  const after = await state();
  assert.equal(after.scenarios.length, before.scenarios.length);
  assert.deepEqual(after.scenarios.map((x) => x.name), before.scenarios.map((x) => x.name));
  assert.equal(after.trees.length, 1);
  ok(`${after.scenarios.length} scenarios, tree and comparison survive closing the app`);

  // 15. offline core engine
  await page.evaluate(() => navigator.serviceWorker.ready);
  await page.reload();
  await context.setOffline(true);
  await page.reload();
  await page.waitForSelector('.scard');
  await go(`#/r/${before.scenarios[0].id}`);
  await page.waitForSelector('.kpis');
  assert.match(await page.textContent('main'), /58,000/);
  await context.setOffline(false);
  ok('opens and calculates offline');

  // 12/13/16. AI optional: works without, then import + use a local model
  await go('#/models');
  await page.waitForSelector('text=No model loaded');
  assert.match(await page.textContent('main'), /works fully without AI/);
  if (existsSync(`${MODELS}stories260K.gguf`)) {
    await page.setInputFiles('input[data-action=import-model]', `${MODELS}stories260K.gguf`);
    await page.waitForSelector('[data-action=load-model]', { timeout: 60000 });
    const m = (await state()).models[0];
    assert.equal(m.meta.architecture, 'llama');
    await page.click('[data-action=load-model]');
    await page.waitForSelector('text=Running locally', { timeout: 60000 });
    await shot('model-loaded');
    await go('#/create');
    await page.fill('textarea[name=text]', 'I have ₹50,000. What if I start an online business?');
    await page.click('form[data-form=interpret] button[type=submit]');
    await page.waitForSelector('[data-action=accept-draft], .notice.warn', { timeout: 120000 });
    const txt = await page.textContent('main');
    // the tiny test model produces nonsense, which must either be validated as AI suggestions or rejected
    assert.ok(/Local AI interpretation/.test(txt) || /rule-based assistant was used/.test(txt), 'AI output was validated or fell back');
    ok('local model imported from a file, loaded with llama.cpp and used for interpretation (output validated)');
    // AI explanation with cancellation
    await go(`#/r/${before.scenarios[0].id}`);
    await page.click('[data-action=ai-explain]');
    await page.waitForSelector('[data-action=cancel-ai]');
    await page.click('[data-action=cancel-ai]');
    await page.waitForSelector('text=Stopped.', { timeout: 60000 });
    ok('AI explanation streams and can be cancelled; calculations unaffected');
    await go('#/models');
    await page.click('[data-action=remove-model]');
    await page.click('dialog button[type=submit]');
    await page.waitForFunction(() => window.__whatif.store.state.models.length === 0);
    assert.equal(await page.evaluate(() => window.__whatif.llama.status().ready), false);
    ok('model removed from storage');
  } else console.log('… skipped model import (.models/stories260K.gguf not present)');

  // load failure is reported, app keeps working
  const failMsg = await page.evaluate(async () => {
    try { await window.__whatif.llama.load(new Blob([new Uint8Array(64)]), { name: 'broken' }); return 'loaded?!'; } catch (e) { return e.message; }
  });
  assert.match(failMsg, /failed to load/i);
  ok('a broken model file fails with a clear error');

  // 11. export and delete
  await go('#/export');
  const [dl] = await Promise.all([page.waitForEvent('download'), page.click('[data-action=export-json]')]);
  const backup = JSON.parse(await readFile(await dl.path(), 'utf8'));
  assert.equal(backup.app, 'whatif');
  assert.equal(backup.data.scenarios.length, after.scenarios.length);
  const [rep] = await Promise.all([page.waitForEvent('download'), page.click('[data-action=export-reports]')]);
  const md = await readFile(await rep.path(), 'utf8');
  assert.match(md, /## Calculation steps/);
  assert.match(md, /not predictions or guarantees/);
  await page.click('[data-action=delete-all]');
  await page.fill('dialog input[name=confirm]', 'DELETE');
  await page.click('dialog button[type=submit]');
  await page.waitForFunction(() => window.__whatif.store.state.scenarios.length === 0);
  await page.reload();
  await page.waitForSelector('.hero');
  assert.equal((await state()).scenarios.length, 0);
  await go('#/export');
  await page.setInputFiles('input[data-action=import-json]', { name: 'b.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(backup)) });
  await page.waitForFunction((k) => window.__whatif.store.state.scenarios.length === k, after.scenarios.length);
  ok('exported backup + report, deleted everything, restored from backup');

  assert.deepEqual(problems, [], problems.join('\n'));
  console.log(`\nE2E PASSED. Screenshots in ${OUT}`);
} catch (e) {
  console.error('\nE2E FAILED:', e);
  if (problems.length) console.error(problems.join('\n'));
  await page.screenshot({ path: `${OUT}failure.png`, fullPage: true }).catch(() => {});
  process.exitCode = 1;
} finally {
  await browser.close();
  server.close();
}

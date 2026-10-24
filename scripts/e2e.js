// End-to-end acceptance test in a real browser (Chromium via Playwright, mobile viewport).
// Walks the full user journey from the spec, including restart persistence, offline use, export and deletion.
import { createRequire } from 'node:module';
import { mkdir, readFile } from 'node:fs/promises';
import assert from 'node:assert/strict';
import { startServer } from './serve.js';

const { chromium, devices } = createRequire(import.meta.url)('playwright');
const OUT = new URL('../e2e-output/', import.meta.url).pathname;
await mkdir(OUT, { recursive: true });

const server = await startServer(0);
const BASE = `http://127.0.0.1:${server.address().port}/`;
const browser = await chromium.launch();
const context = await browser.newContext({ ...devices['Pixel 7'], acceptDownloads: true });
const page = await context.newPage();
const problems = [];
page.on('pageerror', (e) => problems.push(`pageerror: ${e.message}`));
page.on('console', (m) => { if (m.type() === 'error') problems.push(`console: ${m.text()}`); });

let n = 0;
const shot = (name) => page.screenshot({ path: `${OUT}${String(++n).padStart(2, '0')}-${name}.png`, fullPage: true });
const step = (msg) => console.log(`✓ ${msg}`);
const state = () => page.evaluate(() => window.__lifeRpg.store.state);
const go = async (route) => { await page.click(`.nav a[href="#/${route}"]`); await page.waitForSelector(`.nav a[href="#/${route}"][aria-current=page]`); };
const closeModal = async () => { if (await page.locator('dialog[open]').count()) { await page.locator('dialog[open] [data-action=close-modal]').first().click(); } };
const completeByTitle = async (title) => {
  await go('quests');
  await page.locator('article.quest', { hasText: title }).locator('[data-action=complete]').click();
  await page.waitForFunction((t) => window.__lifeRpg.store.state.quests.some((q) => q.title === t && q.status === 'completed'), title);
  await closeModal();
};

try {
  // 1-2. open app, create character without an account
  await page.goto(BASE);
  await page.waitForSelector('form[data-form=onboarding]');
  await shot('onboarding');
  await page.fill('input[name=name]', 'Ada');
  await page.check('input[name=focus][value=programming]');
  await page.click('form[data-form=onboarding] button[type=submit]');
  await page.waitForSelector('.hero h1');
  assert.equal(await page.textContent('.hero h1'), 'Ada');
  await shot('home-new');
  step('character created offline-first, no account');

  // 3. skills and goals
  await go('skills');
  await page.click('[data-action=new-skill]');
  await page.fill('dialog input[name=name]', 'Cooking');
  await page.click('dialog button[type=submit]');
  await page.waitForSelector('.branch:has-text("Cooking")');
  await page.click('.branch:has-text("Cooking")');
  await page.fill('dialog input[name=name]', 'Culinary Arts');
  await page.click('dialog form[data-form=skill] button[type=submit]');
  await page.waitForFunction(() => window.__lifeRpg.store.state.skills.some((s) => s.name === 'Culinary Arts'));
  await page.click('dialog [data-action=toggle-skill]');
  await page.waitForFunction(() => window.__lifeRpg.store.state.skills.find((s) => s.name === 'Culinary Arts').enabled === false);
  await closeModal();
  await shot('skill-tree');
  step('custom skill created, renamed, disabled');

  await go('profile');
  await page.click('[data-action=new-goal]');
  await page.fill('dialog input[name=title]', 'Become a confident Python developer');
  await page.selectOption('dialog select[name=skillId]', 'programming');
  await page.click('dialog button[type=submit]');
  await page.waitForFunction(() => window.__lifeRpg.store.state.goals.length === 1);
  step('goal created');

  // 4. recommended + manual quests
  await go('quests');
  await page.waitForSelector('[data-action=accept-suggestion]');
  await page.locator('details.why').first().click();
  await shot('quest-board-suggestions');
  await page.click('[data-action=accept-suggestion][data-i="0"]');
  await page.waitForFunction(() => window.__lifeRpg.store.state.quests.some((q) => q.source === 'recommendation'));
  const sugg = (await state()).quests.find((q) => q.source === 'recommendation');
  assert.equal(sugg.skillId, 'programming');
  step('accepted a recommended quest');

  await page.click('[data-action=new-quest]');
  await page.fill('dialog input[name=title]', 'Write a CLI todo app');
  await page.selectOption('dialog select[name=type]', 'custom');
  await page.selectOption('dialog select[name=skillId]', 'programming');
  await page.selectOption('dialog select[name=difficulty]', '5');
  await page.fill('dialog input[name=estimatedMinutes]', '180');
  await page.fill('dialog textarea[name=steps]', 'Design commands\nImplement storage');
  await page.click('dialog button[type=submit]');
  await page.waitForSelector('article.quest:has-text("Write a CLI todo app")');
  const card = page.locator('article.quest', { hasText: 'Write a CLI todo app' });
  assert.ok(await card.locator('[data-action=complete]').isDisabled(), 'complete is disabled while steps are open');
  // edit it
  await card.locator('[data-action=edit-quest]').click();
  await page.fill('dialog input[name=criteria]', 'App adds, lists and removes todos');
  await page.click('dialog button[type=submit]');
  await page.waitForFunction(() => window.__lifeRpg.store.state.quests.some((q) => q.criteria === 'App adds, lists and removes todos'));
  for (const box of await card.locator('[data-action=toggle-step]').all()) { await box.click(); await page.waitForTimeout(50); }
  await shot('quest-steps-done');

  // 5-7. complete, XP exactly once, level up
  await card.locator('[data-action=complete]').click();
  await page.waitForSelector('dialog[open] .celebrate');
  await shot('level-up');
  await closeModal();
  let s = await state();
  const cli = s.quests.find((q) => q.title === 'Write a CLI todo app');
  assert.equal(cli.status, 'completed');
  assert.equal(s.ledger.filter((e) => e.sourceId === cli.id).length, 1);
  const dup = await page.evaluate((id) => window.__lifeRpg.store.dispatch('completeQuest', { id }).then(() => 'ok', (e) => e.message), cli.id);
  assert.match(dup, /already completed/);
  s = await state();
  assert.equal(s.ledger.filter((e) => e.sourceId === cli.id).length, 1);
  assert.ok(s.ledger.length >= 2); // quest + "first quest" achievement
  step(`quest completed once (+${cli.xpReward} XP), duplicate rejected, level up shown`);

  // 8. skill progression
  assert.ok(s.skills.find((k) => k.id === 'programming').xp >= cli.xpReward);
  step('skill progression tracked');

  // 9. boss battle via planner (local rules) with linked stage quests
  await page.click('[data-action=open-planner]');
  await page.fill('dialog input[name=goal]', 'Build a functional Python project');
  await page.click('dialog form[data-form=plan] button[type=submit]');
  await page.waitForSelector('dialog form[data-form=plan-accept]');
  await shot('planner-preview');
  await page.click('dialog button[value=boss]');
  await page.waitForSelector('dialog form[data-form=boss]');
  await page.click('dialog form[data-form=boss] button[type=submit]');
  await page.waitForFunction(() => window.__lifeRpg.store.state.bosses.length === 1);
  s = await state();
  const boss = s.bosses[0];
  assert.equal(boss.stages.length, 5);
  assert.equal(s.quests.filter((q) => q.bossId === boss.id).length, 5);
  step('boss battle created from goal plan with 5 stages and linked quests (user confirmed)');

  for (let i = 0; i < boss.stages.length; i++) {
    const stage = boss.stages[i];
    const quest = (await state()).quests.find((q) => q.stageId === stage.id);
    await go('bosses');
    await page.click(`[data-action=boss-detail][data-id="${boss.id}"]`);
    const clearBtn = page.locator(`dialog [data-action=clear-stage][data-stage="${stage.id}"]`);
    assert.ok(await clearBtn.isDisabled(), 'cannot clear stage before its quest');
    if (i === 0) await shot('boss-detail');
    await closeModal();
    await completeByTitle(quest.title);
    await go('bosses');
    await page.click(`[data-action=boss-detail][data-id="${boss.id}"]`);
    await page.click(`dialog [data-action=clear-stage][data-stage="${stage.id}"]`);
    await page.check('dialog input[name=confirm]');
    await page.fill('dialog textarea[name=note]', `Finished stage ${i + 1}`);
    await page.click('dialog form[data-form=clear-stage] button[type=submit]');
    await page.waitForFunction(([b, st]) => window.__lifeRpg.store.state.bosses.find((x) => x.id === b).stages.find((y) => y.id === st).status === 'cleared', [boss.id, stage.id]);
    if (i === boss.stages.length - 1) { await page.waitForSelector('dialog[open] .celebrate'); await shot('boss-defeated'); }
    await closeModal();
  }
  s = await state();
  assert.equal(s.bosses[0].status, 'defeated');
  assert.equal(s.ledger.filter((e) => e.sourceType === 'boss').length, 1);
  step('multi-stage boss defeated, stage order and linked quests enforced');

  // 10. achievements
  await completeByTitle(sugg.title);
  s = await state();
  await go('achievements');
  await shot('achievements');
  const unlocked = s.achievements.map((a) => a.id);
  for (const id of ['first_quest', 'first_boss', 'first_skill_level', 'project_completed', 'seven_quests']) assert.ok(unlocked.includes(id), `missing ${id}`);
  assert.equal(new Set(unlocked).size, unlocked.length);
  step(`achievements unlocked once each: ${unlocked.join(', ')}`);

  // 11. stats from stored data
  await go('stats');
  await shot('stats');
  const statText = await page.textContent('main');
  assert.ok(statText.includes(String(s.completions.length)));
  assert.ok(statText.includes(String(s.profile.lifetimeXp)));
  step('statistics reflect stored data');

  // 12. close & reopen
  const before = await state();
  await page.close();
  const page2 = await context.newPage();
  page2.on('pageerror', (e) => problems.push(`pageerror: ${e.message}`));
  await page2.goto(BASE);
  await page2.waitForSelector('.hero h1');
  const after = await page2.evaluate(() => window.__lifeRpg.store.state);
  assert.equal(after.profile.lifetimeXp, before.profile.lifetimeXp);
  assert.equal(after.completions.length, before.completions.length);
  assert.equal(after.bosses[0].status, 'defeated');
  step(`progress persisted across restart (${after.profile.lifetimeXp} XP)`);

  // 13. offline
  await page2.evaluate(() => navigator.serviceWorker.ready);
  await page2.reload(); // ensure the SW controls the page
  await context.setOffline(true);
  await page2.reload();
  await page2.waitForSelector('.hero h1');
  await page2.click('.nav a[href="#/quests"]');
  await page2.click('[data-action=accept-suggestion][data-i="0"]');
  await page2.waitForFunction((n0) => window.__lifeRpg.store.state.quests.length > n0, after.quests.length);
  const offlineQuest = (await page2.evaluate(() => window.__lifeRpg.store.state)).quests.at(-1);
  await page2.locator(`article[data-quest="${offlineQuest.id}"] [data-action=complete]`).click();
  await page2.waitForFunction((id) => window.__lifeRpg.store.state.quests.find((q) => q.id === id).status === 'completed', offlineQuest.id);
  await page2.screenshot({ path: `${OUT}${String(++n).padStart(2, '0')}-offline.png`, fullPage: true });
  await context.setOffline(false);
  step('app loads and completes quests while offline');

  // 14. export and delete
  await page2.click('.nav a[href="#/profile"]');
  await page2.selectOption('form[data-form=ai] select[name=provider]', 'anthropic');
  await page2.fill('form[data-form=ai] input[name=apiKey]', 'sk-ant-e2e-not-a-real-key');
  await page2.click('form[data-form=ai] button[type=submit]');
  await page2.waitForSelector('form[data-form=ai] .chip.good');
  await page2.screenshot({ path: `${OUT}${String(++n).padStart(2, '0')}-profile.png`, fullPage: true });
  const [download] = await Promise.all([page2.waitForEvent('download'), page2.click('[data-action=export]')]);
  const exported = await readFile(await download.path(), 'utf8');
  const parsed = JSON.parse(exported);
  assert.equal(parsed.app, 'life-rpg');
  assert.equal(parsed.data.profile.name, 'Ada');
  assert.ok(!exported.includes('sk-ant-e2e'), 'API key must not be exported');
  step('data exported (API key excluded)');

  await page2.click('[data-action=delete-all]');
  await page2.fill('dialog input[name=confirm]', 'delete');
  await page2.click('dialog button[type=submit]');
  assert.match(await page2.textContent('dialog [data-err]'), /DELETE/);
  await page2.fill('dialog input[name=confirm]', 'DELETE');
  await page2.click('dialog button[type=submit]');
  await page2.waitForSelector('form[data-form=onboarding]');
  await page2.reload();
  await page2.waitForSelector('form[data-form=onboarding]');
  assert.equal(await page2.evaluate(() => window.__lifeRpg.store.getSecret('anthropicKey')), undefined);
  step('all data deleted and stays deleted after reload');

  // import restores it
  await page2.fill('input[name=name]', 'Temp');
  await page2.click('form[data-form=onboarding] button[type=submit]');
  await page2.waitForSelector('.hero h1');
  await page2.click('.nav a[href="#/profile"]');
  await page2.setInputFiles('input[data-action=import]', { name: 'save.json', mimeType: 'application/json', buffer: Buffer.from(exported) });
  await page2.waitForFunction(() => window.__lifeRpg.store.state.profile.name === 'Ada');
  step('import restored the exported save');

  assert.deepEqual(problems, [], `browser errors:\n${problems.join('\n')}`);
  console.log(`\nE2E PASSED. Screenshots in ${OUT}`);
} catch (err) {
  console.error('\nE2E FAILED:', err);
  if (problems.length) console.error(problems.join('\n'));
  await page.screenshot({ path: `${OUT}failure.png`, fullPage: true }).catch(() => {});
  process.exitCode = 1;
} finally {
  await browser.close();
  server.close();
}

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createStore, memoryAdapter } from '../src/data/store.js';
import { migrate, reconcile } from '../src/core/migrations.js';
import { SCHEMA_VERSION } from '../src/core/config.js';
import { T0 } from './helpers.js';

async function freshStore(adapter = memoryAdapter(), clock = () => T0) {
  const store = createStore(adapter, { clock });
  await store.init();
  return store;
}

async function playedStore(adapter) {
  const store = await freshStore(adapter);
  await store.dispatch('createProfile', { name: 'Ada' });
  await store.dispatch('createQuest', { title: 'Persist me', difficulty: 3, estimatedMinutes: 30, skillId: 'learning' });
  await store.dispatch('completeQuest', { id: store.state.quests[0].id });
  return store;
}

test('progress survives a restart (new store over the same storage)', async () => {
  const adapter = memoryAdapter();
  const first = await playedStore(adapter);
  const xp = first.state.profile.lifetimeXp;
  assert.ok(xp > 0);
  const second = await freshStore(adapter);
  assert.equal(second.state.profile.name, 'Ada');
  assert.equal(second.state.profile.lifetimeXp, xp);
  assert.equal(second.state.quests[0].status, 'completed');
  assert.equal(second.state.achievements[0].id, 'first_quest');
});

test('a failed write leaves the in-memory state unchanged (no half-applied XP)', async () => {
  const adapter = memoryAdapter();
  const store = await freshStore(adapter);
  await store.dispatch('createProfile', { name: 'Ada' });
  await store.dispatch('createQuest', { title: 'Fragile', difficulty: 2, estimatedMinutes: 20 });
  adapter.failNextSave = true;
  await assert.rejects(store.dispatch('completeQuest', { id: store.state.quests[0].id }), /disk failure/);
  assert.equal(store.state.quests[0].status, 'active');
  assert.equal(store.state.profile.lifetimeXp, 0);
  assert.equal(adapter.peek().quests[0].status, 'active');
  await store.dispatch('completeQuest', { id: store.state.quests[0].id });
  assert.ok(store.state.profile.lifetimeXp > 0);
});

test('a double-tap (concurrent dispatches) completes the quest once', async () => {
  const store = await freshStore();
  await store.dispatch('createProfile', { name: 'Ada' });
  await store.dispatch('createQuest', { title: 'Tap tap', difficulty: 2, estimatedMinutes: 20 });
  const id = store.state.quests[0].id;
  const results = await Promise.allSettled([store.dispatch('completeQuest', { id }), store.dispatch('completeQuest', { id })]);
  assert.deepEqual(results.map((r) => r.status), ['fulfilled', 'rejected']);
  assert.equal(store.state.ledger.filter((e) => e.sourceType === 'quest').length, 1);
});

test('export -> wipe -> import round-trips all progress; secrets are not exported', async () => {
  const store = await playedStore();
  await store.setSecret('anthropicKey', 'sk-test-secret');
  const json = store.exportData();
  assert.ok(!json.includes('sk-test-secret'));
  const xp = store.state.profile.lifetimeXp;
  await store.wipe();
  assert.equal(store.state.profile, null);
  assert.equal(await store.getSecret('anthropicKey'), undefined);
  await store.importData(json);
  assert.equal(store.state.profile.lifetimeXp, xp);
});

test('invalid imports are rejected and leave data intact', async () => {
  const store = await playedStore();
  await assert.rejects(store.importData('{nope'), /valid JSON/);
  await assert.rejects(store.importData('{"app":"other"}'), /not a LIFE RPG/);
  await assert.rejects(store.importData(JSON.stringify({ app: 'life-rpg', data: { schemaVersion: 99 } })), /newer app/);
  await assert.rejects(store.importData(JSON.stringify({ app: 'life-rpg', data: { schemaVersion: 2, skills: [] } })), /missing/);
  assert.equal(store.state.profile.name, 'Ada');
});

test('v1 save data migrates to the current schema', async () => {
  const v1 = {
    schemaVersion: 1, createdAt: T0,
    profile: { name: 'Old', avatar: '🧙', createdAt: T0, lifetimeXp: 39, focusSkillIds: [] },
    skills: [{ id: 'learning', name: 'Learning', icon: '📖', color: '#ffd166', xp: 39, enabled: true, custom: false }],
    goals: [],
    quests: [{ id: 'q1', title: 'Old quest', type: 'custom', difficulty: 3, estimatedMinutes: 30, steps: [], prerequisites: [], status: 'completed', createdAt: T0, xpReward: 39 }],
    completions: [{ id: 'c1', questId: 'q1', at: T0, xp: 39, skillId: 'learning', questType: 'custom', minutes: 30 }],
    ledger: [{ id: 'x1', at: T0, amount: 39, sourceType: 'quest', sourceId: 'q1', skillId: 'learning' }],
    achievements: [], bosses: [],
    settings: { difficultyMode: 'relaxed', dailyMinutes: 30, curve: { base: 100, exponent: 1.5 }, skillCurve: { base: 60, exponent: 1.4 } },
  };
  const s = migrate(v1);
  assert.equal(s.schemaVersion, SCHEMA_VERSION);
  assert.deepEqual(s.customAchievements, []);
  assert.equal(s.quests[0].postponeCount, 0);
  assert.equal(s.quests[0].history.length, 1);
  assert.equal(s.settings.difficultyMode, 'relaxed'); // user values kept
  assert.equal(s.settings.ai.provider, 'local'); // new defaults added
  assert.equal(v1.schemaVersion, 1); // input untouched

  // and it boots through the store, keeping progress
  const store = await freshStore(memoryAdapter(v1));
  assert.equal(store.state.schemaVersion, SCHEMA_VERSION);
  // the earlier completion retroactively unlocks "First Quest" exactly once (+15)
  assert.deepEqual(store.state.achievements.map((a) => a.id), ['first_quest']);
  assert.equal(store.state.profile.lifetimeXp, 39 + 15);
});

test('reconcile rebuilds tampered totals from the audit ledger and drops duplicates', () => {
  const s = {
    profile: { lifetimeXp: 99999 },
    skills: [{ id: 'a', name: 'A', xp: 5000 }],
    ledger: [
      { sourceType: 'quest', sourceId: 'q1', amount: 30, skillId: 'a' },
      { sourceType: 'quest', sourceId: 'q1', amount: 30, skillId: 'a' },
      { sourceType: 'quest', sourceId: 'q2', amount: -50, skillId: 'a' },
    ],
  };
  const fixes = reconcile(s);
  assert.equal(s.profile.lifetimeXp, 30);
  assert.equal(s.skills[0].xp, 30);
  assert.equal(s.ledger.length, 1);
  assert.ok(fixes.length >= 3);
});

test('operations work with no network at all (storage is local)', async () => {
  const realFetch = globalThis.fetch;
  globalThis.fetch = () => { throw new Error('network disabled'); };
  try {
    const store = await playedStore();
    assert.ok(store.state.profile.lifetimeXp > 0);
  } finally {
    globalThis.fetch = realFetch;
  }
});

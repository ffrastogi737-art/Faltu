import { test } from 'node:test';
import assert from 'node:assert/strict';
import { levelInfo } from '../src/core/progression.js';
import { newGame, T0, DAY } from './helpers.js';

test('skill XP only comes from quests in that skill', () => {
  const g = newGame();
  const p = g.quest({ skillId: 'programming' });
  const f = g.quest({ title: 'Walk', skillId: 'fitness' });
  const none = g.quest({ title: 'Misc', skillId: null });
  g.do('completeQuest', { id: p.id });
  g.do('completeQuest', { id: f.id });
  g.do('completeQuest', { id: none.id });
  const skill = (id) => g.state.skills.find((s) => s.id === id);
  assert.equal(skill('programming').xp, p.xpReward);
  assert.equal(skill('fitness').xp, f.xpReward);
  assert.equal(skill('learning').xp, 0);
});

test('skill level-ups emit events and milestones', () => {
  const g = newGame();
  const q = g.quest({ difficulty: 5, estimatedMinutes: 180 }); // 104 XP; skill curve L1->2 = 60
  const events = g.do('completeQuest', { id: q.id });
  assert.ok(events.some((e) => e.type === 'skillLevelUp' && e.skillId === 'programming' && e.to === 2));
  assert.ok(events.some((e) => e.type === 'milestone' && e.level === 2));
});

test('custom skills can be created, renamed and disabled; disabled skills reject new quests', () => {
  const g = newGame();
  g.do('createSkill', { name: 'Cooking', icon: '🍳' });
  const cooking = g.state.skills.find((s) => s.name === 'Cooking');
  assert.ok(cooking.custom);
  assert.throws(() => g.do('createSkill', { name: 'cooking' }), /already exists/);
  g.do('updateSkill', { id: cooking.id, name: 'Culinary Arts' });
  assert.equal(g.state.skills.find((s) => s.id === cooking.id).name, 'Culinary Arts');
  const q = g.quest({ title: 'Cook dinner', skillId: cooking.id });
  g.do('updateSkill', { id: cooking.id, enabled: false });
  assert.throws(() => g.quest({ title: 'Bake', skillId: cooking.id }), /disabled/);
  g.do('completeQuest', { id: q.id }); // existing quests still finish and keep their XP
  assert.equal(g.state.skills.find((s) => s.id === cooking.id).xp, q.xpReward);
});

test('cannot disable every skill', () => {
  const g = newGame();
  const ids = g.state.skills.map((s) => s.id);
  for (const id of ids.slice(1)) g.do('updateSkill', { id, enabled: false });
  assert.throws(() => g.do('updateSkill', { id: ids[0], enabled: false }), /at least one/);
});

function makeBoss(g, extra = {}) {
  g.do('createBoss', {
    title: 'Build a Python project', skillId: 'programming', difficulty: 2,
    stages: [{ title: 'Learn concepts' }, { title: 'Exercises' }, { title: 'Final: ship it', objective: 'Runs end to end' }],
    ...extra,
  });
  return g.state.bosses.at(-1);
}

test('boss stages must be cleared in order, once, and defeat awards a bonus', () => {
  const g = newGame();
  const boss = makeBoss(g);
  const [s1, s2, s3] = boss.stages;
  assert.equal(s1.status, 'active');
  assert.equal(s2.status, 'locked');
  assert.throws(() => g.do('clearStage', { bossId: boss.id, stageId: s2.id }), /previous stage/);
  g.do('clearStage', { bossId: boss.id, stageId: s1.id });
  assert.throws(() => g.do('clearStage', { bossId: boss.id, stageId: s1.id }), /already cleared/);
  g.do('clearStage', { bossId: boss.id, stageId: s2.id });
  const events = g.do('clearStage', { bossId: boss.id, stageId: s3.id });
  assert.ok(events.some((e) => e.type === 'bossDefeated'));
  const b = g.state.bosses[0];
  assert.equal(b.status, 'defeated');
  const xp = g.state.ledger.filter((e) => ['stage', 'boss'].includes(e.sourceType)).reduce((n, e) => n + e.amount, 0);
  assert.equal(xp, 3 * 50 + b.xpReward);
  assert.throws(() => g.do('clearStage', { bossId: boss.id, stageId: s3.id }), /defeated/);
});

test('a boss stage with linked quests cannot be cleared until they are completed', () => {
  const g = newGame();
  const boss = makeBoss(g);
  const stage = boss.stages[0];
  const q = g.quest({ title: 'Read the tutorial', bossId: boss.id, stageId: stage.id });
  assert.throws(() => g.do('clearStage', { bossId: boss.id, stageId: stage.id }), /Read the tutorial/);
  g.do('completeQuest', { id: q.id });
  g.do('clearStage', { bossId: boss.id, stageId: stage.id });
  assert.equal(g.state.bosses[0].stages[1].status, 'active');
});

test('boss validation: 2–10 stages and retreat/resume', () => {
  const g = newGame();
  assert.throws(() => makeBoss(g, { stages: [{ title: 'Only one' }] }), /2–10 stages/);
  const boss = makeBoss(g);
  g.do('setBossStatus', { id: boss.id, status: 'abandoned' });
  assert.throws(() => g.do('clearStage', { bossId: boss.id, stageId: boss.stages[0].id }), /abandoned/);
  g.do('setBossStatus', { id: boss.id, status: 'active' });
  g.do('clearStage', { bossId: boss.id, stageId: boss.stages[0].id });
});

test('achievements unlock once with their reward, and unlock in the same action', () => {
  const g = newGame();
  const q = g.quest({ difficulty: 1 });
  const events = g.do('completeQuest', { id: q.id });
  assert.ok(events.some((e) => e.type === 'achievement' && e.id === 'first_quest'));
  assert.equal(g.state.achievements.filter((a) => a.id === 'first_quest').length, 1);
  const q2 = g.quest({ title: 'Another' });
  g.do('completeQuest', { id: q2.id });
  assert.equal(g.state.achievements.filter((a) => a.id === 'first_quest').length, 1);
  assert.equal(g.state.ledger.filter((e) => e.sourceType === 'achievement' && e.sourceId === 'first_quest').length, 1);
});

test('seven quests, first boss, learning milestone, project and personal best unlock from real activity', () => {
  const g = newGame();
  const has = (id) => g.state.achievements.some((a) => a.id === id);
  // day 1: two quests
  for (let i = 0; i < 2; i++) g.do('completeQuest', { id: g.quest({ title: `D1-${i}` }).id }, T0);
  // day 2: three quests (beats best of 2 -> personal best)
  for (let i = 0; i < 3; i++) g.do('completeQuest', { id: g.quest({ title: `D2-${i}`, skillId: 'learning' }).id }, T0 + DAY);
  assert.ok(has('personal_best'));
  assert.ok(!has('seven_quests'));
  for (let i = 0; i < 2; i++) g.do('completeQuest', { id: g.quest({ title: `L-${i}`, skillId: 'learning' }).id }, T0 + 2 * DAY);
  assert.ok(has('seven_quests'));
  assert.ok(has('learning_milestone'));
  assert.ok(!has('project_completed'));
  g.do('completeQuest', { id: g.quest({ title: 'Big project', type: 'longterm' }).id }, T0 + 2 * DAY);
  assert.ok(has('project_completed'));
  const boss = makeBoss(g);
  for (const st of boss.stages) g.do('clearStage', { bossId: boss.id, stageId: st.id }, T0 + 3 * DAY);
  assert.ok(has('first_boss'));
  assert.ok(has('first_skill_level'));
});

test('custom achievements unlock but grant no XP', () => {
  const g = newGame();
  g.do('addCustomAchievement', { name: 'Two down', metric: 'questsCompleted', threshold: 2 });
  assert.throws(() => g.do('addCustomAchievement', { name: 'x', metric: 'bogus', threshold: 1 }), /metric/);
  g.do('completeQuest', { id: g.quest({ title: 'one' }).id });
  g.do('completeQuest', { id: g.quest({ title: 'two' }).id });
  const custom = g.state.customAchievements[0];
  const unlocked = g.state.achievements.find((a) => a.id === custom.id);
  assert.ok(unlocked);
  assert.equal(unlocked.xp, 0);
});

test('lifetime XP equals the ledger sum and level is consistent after many actions', () => {
  const g = newGame();
  for (let i = 0; i < 10; i++) g.do('completeQuest', { id: g.quest({ title: `q${i}`, difficulty: (i % 5) + 1 }).id }, T0 + i * DAY);
  const sum = g.state.ledger.reduce((n, e) => n + e.amount, 0);
  assert.equal(g.state.profile.lifetimeXp, sum);
  assert.ok(g.state.ledger.every((e) => e.amount >= 0));
  assert.equal(g.state.ledger.at(-1).levelAfter, levelInfo(sum, g.state.settings.curve).level);
});

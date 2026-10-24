import { test } from 'node:test';
import assert from 'node:assert/strict';
import { apply } from '../src/core/engine.js';
import { newGame, T0, HOUR, DAY } from './helpers.js';

test('completing a quest awards XP exactly once and records it in the ledger', () => {
  const g = newGame();
  const q = g.quest();
  g.do('completeQuest', { id: q.id });
  const questEntries = g.state.ledger.filter((e) => e.sourceType === 'quest');
  assert.equal(questEntries.length, 1);
  assert.equal(questEntries[0].amount, q.xpReward);
  assert.equal(g.state.completions.length, 1);
  assert.throws(() => g.do('completeQuest', { id: q.id }), /already completed/);
  assert.equal(g.state.ledger.filter((e) => e.sourceType === 'quest').length, 1);
});

test('apply() never mutates the input state, even when the action throws', () => {
  const g = newGame();
  const q = g.quest();
  const before = JSON.stringify(g.state);
  apply(g.state, 'completeQuest', { id: q.id }, T0);
  assert.equal(JSON.stringify(g.state), before);
  assert.throws(() => apply(g.state, 'completeQuest', { id: 'nope' }, T0), /not found/);
  assert.equal(JSON.stringify(g.state), before);
});

test('level up happens when lifetime XP crosses the threshold', () => {
  const g = newGame();
  const q = g.quest({ difficulty: 5, estimatedMinutes: 180 }); // 80 + 24 = 104 XP
  const events = g.do('completeQuest', { id: q.id });
  assert.ok(events.some((e) => e.type === 'levelUp' && e.from === 1 && e.to === 2));
});

test('invalid transitions are rejected', () => {
  const g = newGame();
  const q = g.quest();
  g.do('abandonQuest', { id: q.id });
  assert.throws(() => g.do('completeQuest', { id: q.id }), /abandoned/);
  assert.throws(() => g.do('editQuest', { id: q.id, title: 'x' }), /Only active/);
  assert.throws(() => g.do('postponeQuest', { id: q.id }), /Only active/);
  g.do('reactivateQuest', { id: q.id });
  g.do('completeQuest', { id: q.id });
  assert.throws(() => g.do('abandonQuest', { id: q.id }), /Only active/);
  assert.throws(() => g.do('reactivateQuest', { id: q.id }), /Only abandoned or expired/);
});

test('editing recalculates XP and ignores attempts to change protected fields', () => {
  const g = newGame();
  const q = g.quest({ difficulty: 1 });
  g.do('editQuest', { id: q.id, title: 'Harder now', difficulty: 4, status: 'completed', xpReward: 9999, createdAt: 0 });
  const edited = g.state.quests.find((x) => x.id === q.id);
  assert.equal(edited.title, 'Harder now');
  assert.equal(edited.status, 'active');
  assert.equal(edited.createdAt, T0);
  assert.equal(edited.xpReward, 55 + 4);
  assert.equal(g.state.ledger.filter((e) => e.sourceType === 'quest').length, 0);
});

test('quest validation rejects bad input', () => {
  const g = newGame();
  assert.throws(() => g.quest({ title: '   ' }), /Title is required/);
  assert.throws(() => g.quest({ title: 'x'.repeat(81) }), /at most 80/);
  assert.throws(() => g.quest({ difficulty: 0 }), /Difficulty/);
  assert.throws(() => g.quest({ difficulty: 2.5 }), /Difficulty/);
  assert.throws(() => g.quest({ estimatedMinutes: 2 }), /minutes/);
  assert.throws(() => g.quest({ type: 'hourly' }), /type/);
  assert.throws(() => g.quest({ skillId: 'nope' }), /Skill not found/);
  assert.throws(() => g.quest({ steps: Array(13).fill('s') }), /steps/);
  assert.equal(g.state.quests.length, 0);
});

test('multi-step quests need every step done; prerequisites must be completed first', () => {
  const g = newGame();
  const first = g.quest({ title: 'Set up project' });
  const q = g.quest({ title: 'Build feature', steps: ['Design', 'Code'], prerequisites: [first.id] });
  assert.throws(() => g.do('completeQuest', { id: q.id }), /prerequisite/);
  g.do('completeQuest', { id: first.id });
  assert.throws(() => g.do('completeQuest', { id: q.id }), /2 step/);
  const steps = g.state.quests.find((x) => x.id === q.id).steps;
  g.do('toggleStep', { questId: q.id, stepId: steps[0].id });
  g.do('toggleStep', { questId: q.id, stepId: steps[1].id });
  g.do('completeQuest', { id: q.id });
  assert.equal(g.state.quests.find((x) => x.id === q.id).status, 'completed');
});

test('prerequisite cycles are rejected', () => {
  const g = newGame();
  const a = g.quest({ title: 'A' });
  const b = g.quest({ title: 'B', prerequisites: [a.id] });
  assert.throws(() => g.do('editQuest', { id: a.id, prerequisites: [b.id] }), /cycle/);
  assert.throws(() => g.do('editQuest', { id: a.id, prerequisites: [a.id] }), /itself/);
});

test('postpone moves the due date without penalty and is limited', () => {
  const g = newGame();
  const q = g.quest({ type: 'daily' });
  const due = q.dueAt;
  g.do('postponeQuest', { id: q.id, days: 1 });
  assert.ok(g.state.quests[0].dueAt > due);
  for (let i = 0; i < 4; i++) g.do('postponeQuest', { id: q.id });
  assert.throws(() => g.do('postponeQuest', { id: q.id }), /too often/);
  assert.equal(g.state.profile.lifetimeXp, 0);
});

test('daily XP taper limits farming but still records completions', () => {
  const g = newGame();
  const xp = [];
  for (let i = 0; i < 13; i++) {
    const q = g.quest({ title: `Q${i}`, difficulty: 1, estimatedMinutes: 5 });
    g.do('completeQuest', { id: q.id }, T0 + i * 60000);
    xp.push(g.state.completions.at(-1).xp);
  }
  assert.deepEqual(xp, [10, 10, 10, 10, 10, 10, 10, 10, 5, 5, 5, 5, 0]);
  assert.equal(g.state.completions.length, 13);
  // next day resets the taper
  const q = g.quest({ title: 'Tomorrow', difficulty: 1, estimatedMinutes: 5 });
  g.do('completeQuest', { id: q.id }, T0 + DAY);
  assert.equal(g.state.completions.at(-1).xp, 10);
});

test('rollover expires missed daily quests without removing XP and respawns recurring ones once', () => {
  const g = newGame();
  const done = g.quest({ title: 'Done one', difficulty: 1 });
  g.do('completeQuest', { id: done.id });
  const xpBefore = g.state.profile.lifetimeXp;
  const daily = g.quest({ title: 'Stretch', type: 'daily', repeats: true });
  g.quest({ title: 'One-off', type: 'daily' });
  const tomorrow = T0 + DAY;
  g.do('rollover', null, tomorrow);
  g.do('rollover', null, tomorrow + HOUR); // idempotent
  const stretches = g.state.quests.filter((q) => q.title === 'Stretch');
  assert.equal(stretches.length, 2);
  assert.equal(stretches[0].status, 'expired');
  assert.equal(stretches[1].status, 'active');
  assert.equal(stretches[1].seriesId, daily.id);
  assert.ok(stretches[1].dueAt > tomorrow);
  assert.equal(g.state.quests.find((q) => q.title === 'One-off').status, 'expired');
  assert.equal(g.state.profile.lifetimeXp, xpBefore);
  assert.throws(() => g.do('reactivateQuest', { id: daily.id }, tomorrow), /newer instance/);
});

test('custom quests with a passed due date stay active (overdue, not punished)', () => {
  const g = newGame();
  g.quest({ title: 'Essay', dueAt: T0 });
  g.do('rollover', null, T0 + 3 * DAY);
  assert.equal(g.state.quests[0].status, 'active');
});

test('accepting drafts is all-or-nothing', () => {
  const g = newGame();
  const good = { title: 'Good quest', difficulty: 2, estimatedMinutes: 20 };
  assert.throws(() => g.do('acceptDrafts', { drafts: [good, { title: '' }], source: 'ai' }));
  assert.equal(g.state.quests.length, 0);
  g.do('acceptDrafts', { drafts: [good], source: 'ai' });
  assert.equal(g.state.quests[0].source, 'ai');
});

test('actions require a profile', async () => {
  const { createInitialState } = await import('../src/core/engine.js');
  const s = createInitialState(T0);
  assert.throws(() => apply(s, 'createQuest', { title: 'x y z' }, T0), /character/);
});

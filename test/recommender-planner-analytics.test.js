import { test } from 'node:test';
import assert from 'node:assert/strict';
import { recommend, analyzePerformance } from '../src/core/recommender.js';
import { validateDraft, localPlan } from '../src/core/planner.js';
import { planGoal } from '../src/ai/provider.js';
import { buildStats, streaks } from '../src/core/analytics.js';
import { newGame, T0, DAY } from './helpers.js';

test('recommendations explain themselves and respect the chosen mode', () => {
  const g = newGame();
  const { suggestions, target } = recommend(g.state, T0);
  assert.equal(suggestions.length, 3);
  assert.equal(target, 2.5);
  for (const s of suggestions) assert.ok(s.reasons.length >= 2 && s.reasons.every((r) => typeof r === 'string' && r.length));
  assert.equal(suggestions[0].draft.skillId, 'programming'); // focus skill first
  g.do('updateSettings', { difficultyMode: 'relaxed' });
  assert.equal(recommend(g.state, T0).target, 1.5);
});

test('consistent success raises difficulty; struggling lowers it', () => {
  const win = newGame();
  for (let i = 0; i < 6; i++) win.do('completeQuest', { id: win.quest({ title: `w${i}`, difficulty: 3 }).id }, T0 + i * 3600000);
  const up = recommend(win.state, T0 + DAY / 2);
  assert.ok(up.target > 2.5, `target ${up.target}`);
  assert.match(up.suggestions[0].reasons.join(' '), /step harder/);

  const lose = newGame();
  for (let i = 0; i < 4; i++) lose.quest({ title: `l${i}`, type: 'daily' });
  lose.do('rollover', null, T0 + DAY);
  const perf = analyzePerformance(lose.state, T0 + DAY);
  assert.equal(perf.missed, 4);
  const down = recommend(lose.state, T0 + DAY);
  assert.ok(down.target < 2.5);
  assert.match(down.suggestions[0].reasons.join(' '), /smaller, achievable step/);
});

test('a full day yields the shortest options and says so', () => {
  const g = newGame();
  g.quest({ title: 'Long one', type: 'daily', estimatedMinutes: 120 });
  const r = recommend(g.state, T0);
  assert.equal(r.available, 0);
  assert.match(r.suggestions[0].reasons.join(' '), /already full/);
});

test('validateDraft rejects invalid and unhealthy quests', () => {
  const g = newGame();
  assert.equal(validateDraft({ title: 'Read a chapter', difficulty: 2, estimatedMinutes: 30 }, g.state).ok, true);
  assert.equal(validateDraft({ title: 'Code all-nighter', difficulty: 5, estimatedMinutes: 300 }, g.state).ok, false);
  assert.equal(validateDraft({ title: 'Run until you collapse', difficulty: 5, estimatedMinutes: 60 }, g.state).ok, false);
  assert.equal(validateDraft({ title: 'Ok', difficulty: 2, estimatedMinutes: 30 }, g.state).ok, false);
  assert.equal(validateDraft({ title: 'Valid title', difficulty: 9, estimatedMinutes: 30 }, g.state).ok, false);
  assert.equal(validateDraft({ title: 'Valid title', difficulty: 2, estimatedMinutes: 9999 }, g.state).ok, false);
  assert.equal(validateDraft(null, g.state).ok, false);
});

test('local planner produces a staged plan matching the goal type', () => {
  const g = newGame();
  const plan = localPlan('Build a functional Python project', g.state);
  assert.equal(plan.stages.length, 5);
  assert.match(plan.stages[4].title, /Final boss/);
  assert.equal(plan.quests[0].skillId, 'programming');
  assert.ok(plan.quests.every((q) => validateDraft(q, g.state).ok));
  assert.equal(localPlan('Run a 5k', g.state).quests[0].skillId, 'fitness');
  assert.equal(localPlan('x', g.state).ok, false);
});

test('planGoal falls back to local rules when AI fails, and validates AI output', async () => {
  const g = newGame();
  g.do('updateSettings', { ai: { provider: 'anthropic', model: 'claude-opus-5-5', timeoutMs: 10000 } });

  const noKey = await planGoal('Learn Spanish', g.state, {});
  assert.equal(noKey.source, 'local');
  assert.match(noKey.warning, /No API key/);

  const failing = await planGoal('Learn Spanish', g.state, { apiKey: 'k', fetchPlan: async () => { throw new Error('AI rate limit reached.'); } });
  assert.equal(failing.source, 'local');
  assert.match(failing.warning, /rate limit/);

  const ai = await planGoal('Learn Spanish', g.state, {
    apiKey: 'k',
    fetchPlan: async () => ({
      explanation: 'ok',
      stages: [{ title: 'Basics', objective: 'Learn greetings' }, { title: 'Final', objective: 'Hold a chat' }],
      quests: [
        { title: 'Learn 20 greetings', description: '', criteria: 'Say them aloud', difficulty: 1, estimatedMinutes: 20, stageIndex: 0 },
        { title: 'Study all-nighter', description: '', criteria: '', difficulty: 5, estimatedMinutes: 400, stageIndex: 1 },
        { title: 'Bad', difficulty: 'hard', estimatedMinutes: -1 },
      ],
    }),
  });
  assert.equal(ai.source, 'ai');
  assert.deepEqual(ai.quests.map((q) => q.ok), [true, false, false]);
});

test('stats reflect only stored data, with empty state when there is none', () => {
  const g = newGame();
  const empty = buildStats(g.state, T0);
  assert.equal(empty.hasData, false);
  assert.equal(empty.resolution.rate, null);
  assert.equal(empty.xpByDay.length, 30);
  assert.ok(empty.xpByDay.every((d) => d.xp === 0));

  const q = g.quest({ skillId: 'fitness' });
  g.do('completeQuest', { id: q.id });
  g.quest({ title: 'Planned only' });
  const s = buildStats(g.state, T0);
  assert.equal(s.totals.completed, 1);
  assert.equal(s.totals.activeQuests, 1);
  assert.equal(s.categories[0].id, 'fitness');
  assert.equal(s.xpByDay.at(-1).xp, g.state.profile.lifetimeXp);
  assert.equal(s.weekly.at(-1).quests, 1);
});

test('streaks tolerate one rest day and never go negative', () => {
  const g = newGame();
  const at = (d) => g.do('completeQuest', { id: g.quest({ title: `s${d}` }).id }, T0 + d * DAY);
  [0, 1, 3, 4].forEach(at); // day 2 is a rest day
  assert.deepEqual(streaks(g.state, T0 + 4 * DAY), { current: 4, best: 4 });
  assert.equal(streaks(g.state, T0 + 10 * DAY).current, 0);
  assert.equal(streaks(g.state, T0 + 10 * DAY).best, 4); // best is kept forever
});

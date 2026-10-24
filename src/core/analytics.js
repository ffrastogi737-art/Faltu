// Statistics derived only from stored records. Nothing here is estimated or invented.

import { levelInfo } from './progression.js';
import { dayKey, daysBetween, addDays, weekKey } from './time.js';

/** Streak counts active days; a single rest day between active days does not break it. */
export function streaks(state, now) {
  const days = [...new Set(state.completions.map((c) => dayKey(c.at)))].sort();
  if (!days.length) return { current: 0, best: 0 };
  let best = 1; let run = 1;
  for (let i = 1; i < days.length; i++) {
    run = daysBetween(days[i - 1], days[i]) <= 2 ? run + 1 : 1;
    best = Math.max(best, run);
  }
  const current = daysBetween(days[days.length - 1], dayKey(now)) <= 2 ? run : 0;
  return { current, best };
}

export function buildStats(state, now) {
  const sumBy = (rows, keyFn, valFn) => rows.reduce((m, r) => m.set(keyFn(r), (m.get(keyFn(r)) || 0) + valFn(r)), new Map());
  const xpPerDay = sumBy(state.ledger, (e) => dayKey(e.at), (e) => e.amount);
  const questsPerDay = sumBy(state.completions, (c) => dayKey(c.at), () => 1);

  const xpByDay = [];
  for (let i = 29; i >= 0; i--) {
    const key = dayKey(addDays(now, -i));
    xpByDay.push({ key, xp: xpPerDay.get(key) || 0 });
  }

  const weekly = [];
  for (let i = 7; i >= 0; i--) {
    const key = weekKey(addDays(now, -7 * i));
    const rows = state.completions.filter((c) => weekKey(c.at) === key);
    weekly.push({ key, quests: rows.length, xp: rows.reduce((n, c) => n + c.xp, 0) });
  }

  const count = (status) => state.quests.filter((q) => q.status === status).length;
  const completed = state.completions.length;
  const missed = count('expired');
  const abandoned = count('abandoned');
  const active = state.quests.filter((q) => q.status === 'active');

  const byCategory = sumBy(state.completions, (c) => c.skillId || 'none', () => 1);
  const skillName = (id) => state.skills.find((s) => s.id === id)?.name || 'Uncategorised';
  const categories = [...byCategory.entries()]
    .map(([id, n]) => ({ id, name: skillName(id), color: state.skills.find((s) => s.id === id)?.color || '#888', count: n }))
    .sort((a, b) => b.count - a.count);

  const best = (map) => [...map.entries()].reduce((a, [key, v]) => (v > a.value ? { key, value: v } : a), { key: null, value: 0 });
  const st = streaks(state, now);

  return {
    hasData: completed > 0 || state.ledger.length > 0,
    totals: {
      completed,
      lifetimeXp: state.profile?.lifetimeXp ?? 0,
      activeQuests: active.length,
      plannedMinutes: active.reduce((n, q) => n + q.estimatedMinutes, 0),
      completedMinutes: state.completions.reduce((n, c) => n + c.minutes, 0),
    },
    resolution: { completed, missed, abandoned, rate: completed + missed + abandoned ? completed / (completed + missed + abandoned) : null },
    xpByDay,
    weekly,
    categories,
    skills: state.skills.filter((s) => s.enabled || s.xp > 0).map((s) => ({ ...s, ...levelInfo(s.xp, state.settings.skillCurve) })),
    bosses: state.bosses.map((b) => ({
      id: b.id, title: b.title, status: b.status, total: b.stages.length, cleared: b.stages.filter((s) => s.status === 'cleared').length,
    })),
    goals: state.goals.map((g) => {
      const linked = state.quests.filter((q) => q.goalId === g.id && q.status !== 'abandoned');
      return { id: g.id, title: g.title, status: g.status, done: linked.filter((q) => q.status === 'completed').length, total: linked.length };
    }),
    records: {
      bestDayXp: best(xpPerDay),
      bestDayQuests: best(questsPerDay),
      longestStreak: st.best,
      currentStreak: st.current,
      level: levelInfo(state.profile?.lifetimeXp ?? 0, state.settings.curve).level,
      biggestQuest: state.completions.reduce((a, c) => (c.xp > (a?.xp ?? -1) ? c : a), null),
    },
  };
}

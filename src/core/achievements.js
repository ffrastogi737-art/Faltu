import { DEFAULT_ACHIEVEMENTS } from './config.js';
import { levelInfo } from './progression.js';
import { dayKey } from './time.js';

export function completionsByDay(state) {
  const days = new Map();
  for (const c of state.completions) {
    const k = dayKey(c.at);
    days.set(k, (days.get(k) || 0) + 1);
  }
  return days;
}

export function computeMetrics(state) {
  const skillQuests = {};
  let longtermCompleted = 0;
  for (const c of state.completions) {
    if (c.skillId) skillQuests[c.skillId] = (skillQuests[c.skillId] || 0) + 1;
    if (c.questType === 'longterm') longtermCompleted++;
  }
  const days = completionsByDay(state);
  let best = 0;
  let personalBests = 0;
  for (const k of [...days.keys()].sort()) {
    const n = days.get(k);
    if (n > best && best >= 2) personalBests++;
    best = Math.max(best, n);
  }
  return {
    questsCompleted: state.completions.length,
    bossesDefeated: state.bosses.filter((b) => b.status === 'defeated').length,
    stagesCleared: state.bosses.reduce((n, b) => n + b.stages.filter((s) => s.status === 'cleared').length, 0),
    skillLevelUps: state.skills.reduce((n, s) => n + levelInfo(s.xp, state.settings.skillCurve).level - 1, 0),
    level: levelInfo(state.profile?.lifetimeXp ?? 0, state.settings.curve).level,
    activeDays: days.size,
    longtermCompleted,
    personalBests,
    skillQuests,
  };
}

export function allAchievementDefs(state) {
  return [...DEFAULT_ACHIEVEMENTS, ...state.customAchievements];
}

export function metricValue(metrics, def) {
  return def.metric === 'skillQuests' ? (metrics.skillQuests[def.skillId] || 0) : (metrics[def.metric] || 0);
}

/** Returns defs that are newly satisfied and not yet unlocked. */
export function pendingUnlocks(state) {
  const unlocked = new Set(state.achievements.map((a) => a.id));
  const metrics = computeMetrics(state);
  return allAchievementDefs(state).filter((d) => !unlocked.has(d.id) && metricValue(metrics, d) >= d.threshold);
}

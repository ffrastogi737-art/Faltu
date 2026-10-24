// Transparent, rule-based quest recommendations. Every suggestion carries human-readable reasons.

import { DIFFICULTY } from './config.js';
import { levelInfo, questXp } from './progression.js';
import { templatesFor } from './templates.js';
import { dayKey, daysBetween, endOfDay } from './time.js';

const WINDOW_DAYS = 14;
const MODE_BASE = { relaxed: 1.5, balanced: 2.5, challenging: 3.5 };
const MODE_RANGE = { relaxed: [1, 3], balanced: [1, 4], challenging: [2, 5] };

function lastAction(q) { return q.history?.[q.history.length - 1]?.at ?? q.createdAt; }

export function analyzePerformance(state, now) {
  const since = now - WINDOW_DAYS * 86400000;
  let completed = 0; let missed = 0; let abandoned = 0; let diffSum = 0;
  for (const q of state.quests) {
    if (q.status === 'completed' && q.completedAt >= since) { completed++; diffSum += q.difficulty; }
    else if (q.status === 'expired' && lastAction(q) >= since) missed++;
    else if (q.status === 'abandoned' && lastAction(q) >= since) abandoned++;
  }
  const resolved = completed + missed + abandoned;
  const today = dayKey(now);
  const plannedToday = state.quests
    .filter((q) => q.status === 'active' && (q.type === 'daily' || (q.dueAt && q.dueAt <= endOfDay(now))))
    .reduce((n, q) => n + q.estimatedMinutes, 0);
  const last = state.completions.reduce((m, c) => Math.max(m, c.at), 0);
  return {
    completed, missed, abandoned, resolved,
    rate: resolved >= 3 ? completed / resolved : null,
    avgDifficulty: completed ? diffSum / completed : null,
    plannedToday,
    daysSinceActive: last ? daysBetween(dayKey(last), today) : null,
  };
}

export function targetDifficulty(state, perf) {
  const mode = state.settings.difficultyMode;
  const [lo, hi] = MODE_RANGE[mode];
  let target = MODE_BASE[mode];
  const reasons = [];
  if (perf.rate === null) {
    reasons.push(`Not much recent history yet, so starting at your ${mode} setting.`);
  } else if (perf.rate >= 0.8 && perf.resolved >= 5) {
    target = Math.max(target, perf.avgDifficulty ?? target) + 0.5;
    reasons.push(`You finished ${Math.round(perf.rate * 100)}% of recent quests, so this one is a step harder.`);
  } else if (perf.rate < 0.5) {
    target -= 1;
    reasons.push(`Recent quests were tough (${Math.round(perf.rate * 100)}% finished), so this is a smaller, achievable step.`);
  } else {
    reasons.push(`Your recent completion rate (${Math.round(perf.rate * 100)}%) is steady, so difficulty stays similar.`);
  }
  if (perf.daysSinceActive !== null && perf.daysSinceActive >= 3) {
    target -= 0.5;
    reasons.push(`Welcome back after ${perf.daysSinceActive} days. Easing in gently, with no penalty for the break.`);
  }
  return { target: Math.min(hi, Math.max(lo, target)), reasons };
}

function skillPriority(state, skill, now) {
  const reasons = [];
  let score = 0;
  if (state.profile?.focusSkillIds?.includes(skill.id)) { score += 3; reasons.push(`${skill.name} is one of your focus skills.`); }
  const goal = state.goals.find((g) => g.status === 'active' && g.skillId === skill.id);
  if (goal) { score += 2; reasons.push(`Supports your goal “${goal.title}”.`); }
  const last = state.completions.filter((c) => c.skillId === skill.id).reduce((m, c) => Math.max(m, c.at), 0);
  if (!last) { score += 1; reasons.push(`You have not trained ${skill.name} yet.`); }
  else {
    const idle = daysBetween(dayKey(last), dayKey(now));
    score += Math.min(idle, 14) / 7;
    if (idle >= 4) reasons.push(`${skill.name} has rested for ${idle} days.`);
  }
  score += 1 / levelInfo(skill.xp, state.settings.skillCurve).level;
  return { score, reasons };
}

export function recommend(state, now, { count = 3 } = {}) {
  const perf = analyzePerformance(state, now);
  const { target, reasons: diffReasons } = targetDifficulty(state, perf);
  const available = Math.max(0, state.settings.dailyMinutes - perf.plannedToday);
  const activeTitles = new Set(state.quests.filter((q) => q.status === 'active').map((q) => q.title.toLowerCase()));

  const ranked = state.skills
    .filter((s) => s.enabled)
    .map((s) => ({ skill: s, ...skillPriority(state, s, now) }))
    .sort((a, b) => b.score - a.score || a.skill.name.localeCompare(b.skill.name));

  const suggestions = [];
  for (const { skill, reasons } of ranked) {
    if (suggestions.length >= count) break;
    const options = templatesFor(skill).filter((t) => !activeTitles.has(t.t.toLowerCase()));
    if (!options.length) continue;
    const fits = options.filter((t) => t.m <= Math.max(available, 10));
    const pool = fits.length ? fits : [options.reduce((a, b) => (a.m <= b.m ? a : b))];
    const tpl = pool.reduce((a, b) => (Math.abs(b.d - target) < Math.abs(a.d - target) ? b : a));
    const timeReason = available >= tpl.m
      ? `Fits in the ${available} min you have left today.`
      : `Your day is already full (${perf.plannedToday} min planned), so this is the shortest option. Finishing current quests first is fine too.`;
    const draft = {
      title: tpl.t, description: '', criteria: tpl.c, skillId: skill.id,
      difficulty: tpl.d, estimatedMinutes: tpl.m, type: 'daily',
    };
    suggestions.push({
      draft,
      xp: questXp(draft),
      reasons: [...reasons.slice(0, 2), `${DIFFICULTY[tpl.d].label} difficulty. ${diffReasons[0]}`, ...diffReasons.slice(1), timeReason],
    });
  }
  return { suggestions, perf, target, available };
}

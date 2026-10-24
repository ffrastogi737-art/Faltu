// Career / learning plan model: hours, cost and dates from the user's own estimates.

import { requireValid, round2, SimError } from './validate.js';

export const CAREER_FIELDS = [
  { key: 'currentLevel', label: 'Current skill level (self-rated 0–10)', unit: 'level', min: 0, max: 10 },
  { key: 'targetLevel', label: 'Target skill level (0–10)', unit: 'level', min: 0, max: 10 },
  { key: 'hoursToTarget', label: 'Your estimate of total hours needed', unit: 'hours', min: 1, max: 100000 },
  { key: 'hoursPerWeek', label: 'Planned hours per week', unit: 'hours', min: 0.5, max: 112 },
  { key: 'consistencyPct', label: 'Share of planned hours you expect to do', unit: 'pct', min: 1, max: 100, required: false, default: 100 },
  { key: 'completedHours', label: 'Hours already completed', unit: 'hours', min: 0, max: 100000, required: false },
  { key: 'trainingCost', label: 'One-time training cost', unit: 'money', min: 0, max: 1e10, required: false },
  { key: 'monthlyCost', label: 'Monthly cost (subscriptions, tools)', unit: 'money', min: 0, max: 1e9, required: false },
];

export const CAREER_EXAMPLE = {
  currentLevel: 2, targetLevel: 6, hoursToTarget: 200, hoursPerWeek: 8, consistencyPct: 80,
  completedHours: 0, trainingCost: 3000, monthlyCost: 500,
};

const WEEKS_PER_MONTH = 52 / 12;
const DAY = 86400000;

function validateMilestones(list, hoursToTarget) {
  if (!Array.isArray(list)) return [];
  return list.map((m, i) => {
    const hours = Number(m.hours);
    if (!Number.isFinite(hours) || hours <= 0 || hours > hoursToTarget) throw new SimError(`Milestone #${i + 1} needs hours between 0 and ${hoursToTarget}`);
    return { name: String(m.name || `Milestone ${i + 1}`).slice(0, 60), hours };
  }).sort((a, b) => a.hours - b.hours);
}

/** startDate: ms timestamp of the plan start (needed for calendar dates). */
export function simulateCareer(rawValues, milestonesRaw = [], startDate) {
  const v = requireValid(CAREER_FIELDS, rawValues);
  if (!Number.isFinite(startDate)) throw new SimError('Start date is required');
  if (v.targetLevel <= v.currentLevel) throw new SimError('Target level must be higher than the current level');
  const milestones = validateMilestones(milestonesRaw, v.hoursToTarget);
  const effectiveWeekly = v.hoursPerWeek * (v.consistencyPct / 100);
  const remaining = Math.max(0, v.hoursToTarget - v.completedHours);
  const weeks = remaining / effectiveWeekly;
  const months = weeks / WEEKS_PER_MONTH;
  const billedMonths = Math.ceil(months);
  const totalCost = v.trainingCost + v.monthlyCost * billedMonths;
  const finish = startDate + Math.ceil(weeks * 7) * DAY;
  const dated = milestones.map((m) => {
    const left = Math.max(0, m.hours - v.completedHours);
    return { ...m, done: m.hours <= v.completedHours, date: startDate + Math.ceil((left / effectiveWeekly) * 7) * DAY };
  });
  const timeline = [];
  for (let w = 1; w <= Math.ceil(weeks) && w <= 520; w++) timeline.push({ week: w, hours: Math.min(v.hoursToTarget, v.completedHours + w * effectiveWeekly) });

  return {
    inputs: v,
    milestones: dated,
    timeline,
    summary: {
      remainingHours: remaining,
      effectiveWeeklyHours: effectiveWeekly,
      weeksToTarget: weeks,
      monthsToTarget: months,
      finishDate: finish,
      totalCost,
      costPerHour: v.hoursToTarget > 0 ? totalCost / v.hoursToTarget : null,
      progressPct: Math.min(100, (v.completedHours / v.hoursToTarget) * 100),
    },
    steps: [
      { label: 'Effective hours per week', formula: 'planned hours × consistency', values: `${v.hoursPerWeek} × ${v.consistencyPct}%`, result: round2(effectiveWeekly) },
      { label: 'Remaining hours', formula: 'estimated total − completed', values: `${v.hoursToTarget} − ${v.completedHours}`, result: round2(remaining) },
      { label: 'Weeks to target', formula: 'remaining ÷ effective weekly hours', values: `${round2(remaining)} ÷ ${round2(effectiveWeekly)}`, result: round2(weeks) },
      { label: 'Total cost', formula: 'one-time cost + monthly cost × months (rounded up)', values: `${v.trainingCost} + ${v.monthlyCost} × ${billedMonths}`, result: round2(totalCost) },
    ],
    warnings: v.hoursPerWeek > 40 ? ['More than 40 hours a week of study on top of other commitments is hard to sustain. Consider rest.'] : [],
    limitations: [
      'Total hours needed is your own estimate; real learning time varies widely by person and resource.',
      'Reaching a skill level does not guarantee a job, salary or promotion.',
      'Weekly hours are assumed constant; holidays and life events are not modelled.',
    ],
  };
}

export const CAREER_METRICS = {
  weeksToTarget: 'Weeks to target',
  totalCost: 'Total cost',
  effectiveWeeklyHours: 'Effective hours / week',
  costPerHour: 'Cost per learning hour',
};

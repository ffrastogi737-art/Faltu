// Local rule-based goal planner (the always-available fallback for AI) plus validation
// that every generated quest must pass before the user can accept it.

import { LIMITS, QUEST_TYPES } from './config.js';
import { questXp } from './progression.js';

// Reject anything that rewards harm. Applies to AI output and is a cheap check on local output too.
const UNSAFE = /\b(all[- ]?nighter|no sleep|skip(ping)? (sleep|meals?)|sleep less|without sleep|stay awake|starv|fast(ing)? for \d+ days|until (you )?(collapse|exhaust|pass out)|ignore (pain|injur)|gambl|bet(ting)? |casino|lottery|steroid|purge)/i;

export function validateDraft(raw, state) {
  const errors = [];
  if (!raw || typeof raw !== 'object') return { ok: false, errors: ['Not an object'] };
  const str = (v) => (typeof v === 'string' ? v.trim() : '');
  const title = str(raw.title);
  const description = str(raw.description);
  const criteria = str(raw.criteria);
  if (title.length < 3 || title.length > LIMITS.title) errors.push('Title must be 3–80 characters');
  if (description.length > LIMITS.text || criteria.length > LIMITS.text) errors.push('Text too long');
  const difficulty = Number(raw.difficulty);
  if (!Number.isInteger(difficulty) || difficulty < 1 || difficulty > 5) errors.push('Difficulty must be 1–5');
  const estimatedMinutes = Number(raw.estimatedMinutes);
  if (!Number.isInteger(estimatedMinutes) || estimatedMinutes < LIMITS.minutes.min || estimatedMinutes > LIMITS.minutes.max) {
    errors.push(`Duration must be ${LIMITS.minutes.min}–${LIMITS.minutes.max} minutes`);
  }
  const type = QUEST_TYPES.includes(raw.type) ? raw.type : 'custom';
  const steps = Array.isArray(raw.steps) ? raw.steps.map(str).filter(Boolean).slice(0, LIMITS.steps) : [];
  if (steps.some((s) => s.length > 120)) errors.push('Step too long');
  if (UNSAFE.test(`${title} ${description} ${criteria} ${steps.join(' ')}`)) errors.push('Unsafe or unhealthy activity');
  const skill = state.skills.find((s) => s.id === raw.skillId && s.enabled);
  if (errors.length) return { ok: false, errors };
  const draft = {
    title, description, criteria, difficulty, estimatedMinutes, type, steps,
    skillId: skill?.id ?? null, goalId: raw.goalId ?? null,
  };
  return { ok: true, draft: { ...draft, xp: questXp(draft) }, errors: [] };
}

const ARCHETYPES = [
  {
    id: 'project', skill: 'programming',
    match: /\b(build|create|make|develop|ship|launch|code|program|app|project|website|game|python|javascript|api|tool)\b/i,
    stages: (g) => [
      ['Learn the required concepts', `List and study the concepts needed for “${g}”.`],
      ['Complete small exercises', 'Practise each concept with a tiny exercise.'],
      ['Build individual components', 'Implement each part on its own and check it works.'],
      ['Integrate the components', 'Connect the parts and fix what breaks.'],
      ['Final boss: finish and verify', 'The project runs end to end and you have tested it.'],
    ],
  },
  {
    id: 'learn', skill: 'learning',
    match: /\b(learn|study|understand|master|course|language|exam|read|certif)/i,
    stages: (g) => [
      ['Map the territory', `Find good resources for “${g}” and outline the topics.`],
      ['Core fundamentals', 'Study the fundamentals in short focused sessions.'],
      ['Deliberate practice', 'Do practice problems or exercises on weak spots.'],
      ['Apply it', 'Use the knowledge on a small real task.'],
      ['Final boss: prove it', 'Pass a test, teach it, or explain it without notes.'],
    ],
  },
  {
    id: 'fitness', skill: 'fitness',
    match: /\b(run|marathon|5k|10k|fit|fitness|strength|muscle|weight|exercise|swim|yoga|cycle|push-?ups?|health)/i,
    stages: (g) => [
      ['Baseline', `Measure where you are today for “${g}”, gently.`],
      ['Build the routine', 'Three easy sessions per week with rest days between.'],
      ['Progress gradually', 'Increase load by about 10% per week at most.'],
      ['Consolidate', 'A full week following the plan with good sleep.'],
      ['Final boss: the target', 'Attempt the goal on a rested day. Stop if anything hurts.'],
    ],
  },
  {
    id: 'finance', skill: 'finance',
    match: /\b(save|saving|budget|invest|debt|money|emergency fund|financ|retire)/i,
    stages: (g) => [
      ['Know your numbers', `Track income and spending related to “${g}”.`],
      ['Make a plan', 'Write a budget with a clear monthly target.'],
      ['Automate', 'Set up automatic transfers or reminders.'],
      ['Review and adjust', 'Review a full month and adjust the plan.'],
      ['Final boss: target reached', 'Hit the target amount or milestone.'],
    ],
  },
  {
    id: 'creative', skill: 'creativity',
    match: /\b(write|novel|story|draw|paint|music|song|design|photo|film|video|art|blog)/i,
    stages: (g) => [
      ['Gather inspiration', `Collect references and ideas for “${g}”.`],
      ['Rough draft', 'Make a quick, imperfect first version.'],
      ['Develop', 'Improve the strongest parts of the draft.'],
      ['Polish', 'Refine details and get feedback.'],
      ['Final boss: release', 'Finish and share or publish the work.'],
    ],
  },
];

const GENERIC = {
  id: 'generic', skill: 'discipline',
  stages: (g) => [
    ['Define success', `Write what “${g}” looks like when it is done.`],
    ['First small step', 'Do the smallest action that moves it forward.'],
    ['Build momentum', 'Repeat useful actions over a week.'],
    ['Remove obstacles', 'Identify and fix what slows you down.'],
    ['Final boss: done', 'Complete the goal and check it against your definition.'],
  ],
};

const RAMP = [
  { d: 1, m: 20 }, { d: 2, m: 30 }, { d: 3, m: 45 }, { d: 3, m: 60 }, { d: 4, m: 90 },
];

/** Deterministic plan from keyword rules. No network, no model; clearly labelled as such in the UI. */
export function localPlan(goalText, state, { skillId } = {}) {
  const goal = String(goalText || '').trim().slice(0, 80);
  if (goal.length < 3) return { ok: false, error: 'Describe the goal in a few words' };
  const arch = ARCHETYPES.find((a) => a.match.test(goal)) || GENERIC;
  const chosen = state.skills.find((s) => s.id === skillId && s.enabled)
    || state.skills.find((s) => s.id === arch.skill && s.enabled) || null;
  const stages = arch.stages(goal).map(([title, objective]) => ({ title, objective }));
  const quests = stages.map((st, i) => ({
    title: st.title.replace(/^Final boss: /, ''),
    description: st.objective,
    criteria: st.objective,
    difficulty: RAMP[i].d,
    estimatedMinutes: RAMP[i].m,
    type: i === stages.length - 1 ? 'longterm' : 'custom',
    skillId: chosen?.id ?? null,
    stageIndex: i,
  }));
  return {
    ok: true,
    source: 'local',
    explanation: `Local planner matched the “${arch.id}” pattern and split the goal into ${stages.length} stages with gradually rising difficulty.`,
    stages,
    quests,
  };
}

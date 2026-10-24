// Centralized business logic. Every action mutates a *draft* state and returns events.
// The store clones state before calling and only commits the draft after a durable write,
// so a thrown GameError leaves persisted data untouched.

import {
  SCHEMA_VERSION, DEFAULT_SKILLS, DEFAULT_SETTINGS, QUEST_TYPES, DIFFICULTY_MODES,
  LIMITS, ACHIEVEMENT_METRICS, SKILL_MILESTONES,
} from './config.js';
import { levelInfo, questXp, stageXp, bossXp, taperMultiplier, validateCurve } from './progression.js';
import { pendingUnlocks } from './achievements.js';
import { dayKey, endOfDay, endOfWeek, addDays } from './time.js';
import { fail, uid, cleanText, cleanLongText, intInRange } from './util.js';

export function createInitialState(now) {
  return {
    schemaVersion: SCHEMA_VERSION,
    createdAt: now,
    profile: null,
    skills: DEFAULT_SKILLS.map((s) => ({ ...s, xp: 0, enabled: true, custom: false, createdAt: now })),
    goals: [],
    quests: [],
    completions: [],
    ledger: [],
    achievements: [],
    customAchievements: [],
    bosses: [],
    settings: structuredClone(DEFAULT_SETTINGS),
    meta: {},
  };
}

// ---------- lookups ----------

const findQuest = (s, id) => s.quests.find((q) => q.id === id) || fail('Quest not found');
const findSkill = (s, id) => s.skills.find((k) => k.id === id) || fail('Skill not found');
const findBoss = (s, id) => s.bosses.find((b) => b.id === id) || fail('Boss battle not found');
const findGoal = (s, id) => s.goals.find((g) => g.id === id) || fail('Goal not found');
const requireProfile = (s) => s.profile || fail('Create a character first');

function optionalSkill(s, id, { forNew }) {
  if (!id) return null;
  const skill = findSkill(s, id);
  if (forNew && !skill.enabled) fail(`Skill "${skill.name}" is disabled`);
  return skill.id;
}

const optionalGoal = (s, id) => (id ? findGoal(s, id).id : null);

// ---------- XP ----------

function awardXp(s, { amount, source, skillId, now, events, note = '' }) {
  if (!Number.isInteger(amount) || amount < 0) fail(`Invalid XP amount: ${amount}`);
  if (s.ledger.some((e) => e.sourceType === source.type && e.sourceId === source.id)) {
    fail('XP for this event was already awarded');
  }
  const profile = requireProfile(s);
  const before = levelInfo(profile.lifetimeXp, s.settings.curve).level;
  profile.lifetimeXp += amount;
  const after = levelInfo(profile.lifetimeXp, s.settings.curve).level;

  let skillBefore = null;
  let skillAfter = null;
  const skill = skillId ? s.skills.find((k) => k.id === skillId) : null;
  if (skill) {
    skillBefore = levelInfo(skill.xp, s.settings.skillCurve).level;
    skill.xp += amount;
    skillAfter = levelInfo(skill.xp, s.settings.skillCurve).level;
  }

  s.ledger.push({
    id: uid('x_'), at: now, amount, sourceType: source.type, sourceId: source.id,
    skillId: skill?.id ?? null, totalAfter: profile.lifetimeXp, levelAfter: after, note,
  });
  if (amount > 0) events.push({ type: 'xp', amount, label: source.label || '', skillId: skill?.id ?? null });
  if (after > before) events.push({ type: 'levelUp', from: before, to: after });
  if (skill && skillAfter > skillBefore) {
    events.push({ type: 'skillLevelUp', skillId: skill.id, name: skill.name, from: skillBefore, to: skillAfter });
    for (const m of SKILL_MILESTONES) {
      if (skillBefore < m && skillAfter >= m) events.push({ type: 'milestone', skillId: skill.id, name: skill.name, level: m });
    }
  }
}

/** Runs after every action. Each achievement can only unlock once (guarded by id and by the ledger). */
export function checkAchievements(s, now, events) {
  if (!s.profile) return;
  for (let pass = 0; pass < 5; pass++) {
    const pending = pendingUnlocks(s);
    if (!pending.length) return;
    for (const def of pending) {
      const xp = def.custom ? 0 : def.xp;
      s.achievements.push({ id: def.id, unlockedAt: now, xp });
      awardXp(s, { amount: xp, source: { type: 'achievement', id: def.id, label: def.name }, skillId: null, now, events });
      events.push({ type: 'achievement', id: def.id, name: def.name, icon: def.icon, description: def.description });
    }
  }
}

// ---------- profile & settings ----------

export function createProfile(s, input, now) {
  if (s.profile) fail('A character already exists');
  const name = cleanText(input.name, 'Name', { max: 40 });
  const avatar = cleanText(input.avatar || '🧙', 'Avatar', { max: 8 });
  const focus = Array.isArray(input.focusSkillIds) ? input.focusSkillIds : [];
  focus.forEach((id) => findSkill(s, id));
  s.profile = { name, avatar, createdAt: now, lifetimeXp: 0, focusSkillIds: [...new Set(focus)].slice(0, 4) };
  if (input.difficultyMode || input.dailyMinutes) {
    updateSettings(s, { difficultyMode: input.difficultyMode ?? s.settings.difficultyMode, dailyMinutes: input.dailyMinutes ?? s.settings.dailyMinutes });
  }
  return [{ type: 'info', message: `Welcome, ${name}. Your adventure begins.` }];
}

export function updateProfile(s, input) {
  const p = requireProfile(s);
  if (input.name !== undefined) p.name = cleanText(input.name, 'Name', { max: 40 });
  if (input.avatar !== undefined) p.avatar = cleanText(input.avatar, 'Avatar', { max: 8 });
  if (input.focusSkillIds !== undefined) {
    input.focusSkillIds.forEach((id) => findSkill(s, id));
    p.focusSkillIds = [...new Set(input.focusSkillIds)].slice(0, 4);
  }
  return [];
}

export function updateSettings(s, input) {
  const next = structuredClone(s.settings);
  if (input.difficultyMode !== undefined) {
    if (!DIFFICULTY_MODES.includes(input.difficultyMode)) fail('Unknown difficulty mode');
    next.difficultyMode = input.difficultyMode;
  }
  if (input.dailyMinutes !== undefined) next.dailyMinutes = intInRange(input.dailyMinutes, 'Daily minutes', 10, 600);
  if (input.curve !== undefined) next.curve = validateCurve({ base: Number(input.curve.base), exponent: Number(input.curve.exponent) });
  if (input.notifications !== undefined) {
    const { enabled, time } = input.notifications;
    if (typeof enabled !== 'boolean' || !/^([01]\d|2[0-3]):[0-5]\d$/.test(time)) fail('Invalid notification settings');
    next.notifications = { enabled, time };
  }
  if (input.ai !== undefined) {
    const { provider, model, timeoutMs } = input.ai;
    if (!['local', 'anthropic'].includes(provider)) fail('Unknown AI provider');
    next.ai = { provider, model: cleanText(model, 'Model', { max: 60 }), timeoutMs: intInRange(timeoutMs, 'Timeout', 5000, 120000) };
  }
  if (input.reduceMotion !== undefined) next.reduceMotion = Boolean(input.reduceMotion);
  s.settings = next;
  return [];
}

// ---------- skills ----------

function uniqueSkillName(s, name, exceptId) {
  if (s.skills.some((k) => k.id !== exceptId && k.name.toLowerCase() === name.toLowerCase())) fail('A skill with that name already exists');
}

export function createSkill(s, input, now) {
  if (s.skills.length >= 30) fail('Skill limit reached (30)');
  const name = cleanText(input.name, 'Skill name', { max: 40 });
  uniqueSkillName(s, name);
  const skill = {
    id: uid('sk_'), name, icon: cleanText(input.icon || '◆', 'Icon', { max: 4 }),
    color: /^#[0-9a-f]{6}$/i.test(input.color) ? input.color : '#8ab4ff',
    xp: 0, enabled: true, custom: true, createdAt: now,
  };
  s.skills.push(skill);
  return [{ type: 'info', message: `Skill "${name}" added to your tree.` }];
}

export function updateSkill(s, input) {
  const skill = findSkill(s, input.id);
  if (input.name !== undefined) {
    const name = cleanText(input.name, 'Skill name', { max: 40 });
    uniqueSkillName(s, name, skill.id);
    skill.name = name;
  }
  if (input.icon !== undefined) skill.icon = cleanText(input.icon, 'Icon', { max: 4 });
  if (input.color !== undefined && /^#[0-9a-f]{6}$/i.test(input.color)) skill.color = input.color;
  if (input.enabled !== undefined) {
    if (!input.enabled && s.skills.filter((k) => k.enabled).length <= 1) fail('Keep at least one skill enabled');
    skill.enabled = Boolean(input.enabled);
  }
  return [];
}

// ---------- goals ----------

export function createGoal(s, input, now) {
  requireProfile(s);
  const goal = {
    id: uid('g_'),
    title: cleanText(input.title, 'Goal'),
    description: cleanLongText(input.description, 'Description'),
    skillId: optionalSkill(s, input.skillId, { forNew: true }),
    status: 'active',
    createdAt: now,
  };
  s.goals.push(goal);
  return [{ type: 'info', message: 'Goal created.', goalId: goal.id }];
}

export function updateGoal(s, input) {
  const goal = findGoal(s, input.id);
  if (input.title !== undefined) goal.title = cleanText(input.title, 'Goal');
  if (input.description !== undefined) goal.description = cleanLongText(input.description, 'Description');
  if (input.skillId !== undefined) goal.skillId = optionalSkill(s, input.skillId, { forNew: false });
  if (input.status !== undefined) {
    if (!['active', 'achieved', 'archived'].includes(input.status)) fail('Invalid goal status');
    goal.status = input.status;
  }
  return [];
}

// ---------- quests ----------

function periodEnd(type, from) {
  if (type === 'daily') return endOfDay(from);
  if (type === 'weekly') return endOfWeek(from);
  return null;
}

function validatePrereqs(s, ids, selfId) {
  if (!Array.isArray(ids)) return [];
  const unique = [...new Set(ids)];
  for (const id of unique) {
    if (id === selfId) fail('A quest cannot require itself');
    findQuest(s, id);
  }
  // Reject cycles: walking prerequisites from any listed quest must never reach selfId.
  if (selfId) {
    const seen = new Set();
    const stack = [...unique];
    while (stack.length) {
      const id = stack.pop();
      if (id === selfId) fail('Prerequisites would create a cycle');
      if (seen.has(id)) continue;
      seen.add(id);
      stack.push(...(s.quests.find((q) => q.id === id)?.prerequisites || []));
    }
  }
  return unique;
}

function normalizeQuestFields(s, input, now, existing) {
  const merged = { ...existing, ...input };
  const type = merged.type || 'custom';
  if (!QUEST_TYPES.includes(type)) fail('Invalid quest type');
  const difficulty = intInRange(merged.difficulty ?? 2, 'Difficulty', 1, 5);
  const estimatedMinutes = intInRange(merged.estimatedMinutes ?? 30, 'Estimated minutes', LIMITS.minutes.min, LIMITS.minutes.max);
  const rawSteps = Array.isArray(merged.steps) ? merged.steps : [];
  if (rawSteps.length > LIMITS.steps) fail(`At most ${LIMITS.steps} steps`);
  const steps = rawSteps.map((st) => {
    const title = cleanText(typeof st === 'string' ? st : st.title, 'Step', { max: 120 });
    const prev = existing?.steps?.find((p) => (st.id && p.id === st.id) || p.title === title);
    return { id: prev?.id || uid('st_'), title, done: prev?.done || false };
  });
  let bossId = merged.bossId || null;
  let stageId = merged.stageId || null;
  if (bossId) {
    const boss = findBoss(s, bossId);
    if (!boss.stages.some((st) => st.id === stageId)) fail('Boss stage not found');
  } else stageId = null;

  let dueAt = merged.dueAt ?? null;
  if (type === 'daily' || type === 'weekly') {
    if (!existing || existing.type !== type) dueAt = periodEnd(type, now);
  } else if (dueAt !== null) {
    dueAt = Number(dueAt);
    if (!Number.isFinite(dueAt)) fail('Invalid due date');
    dueAt = endOfDay(dueAt);
  }

  const fields = {
    title: cleanText(merged.title, 'Title', { max: LIMITS.title }),
    description: cleanLongText(merged.description, 'Description', LIMITS.text),
    criteria: cleanLongText(merged.criteria, 'Completion criteria', LIMITS.text),
    type,
    difficulty,
    estimatedMinutes,
    skillId: optionalSkill(s, merged.skillId, { forNew: !existing || merged.skillId !== existing.skillId }),
    goalId: optionalGoal(s, merged.goalId),
    repeats: (type === 'daily' || type === 'weekly') && Boolean(merged.repeats),
    steps,
    prerequisites: validatePrereqs(s, merged.prerequisites, existing?.id),
    dueAt,
    bossId,
    stageId,
  };
  fields.xpReward = questXp(fields);
  return fields;
}

export function createQuest(s, input, now) {
  requireProfile(s);
  if (s.quests.filter((q) => q.status === 'active').length >= 100) fail('Too many active quests (100). Finish or abandon some first.');
  const quest = {
    id: uid('q_'),
    ...normalizeQuestFields(s, input, now, null),
    source: ['manual', 'recommendation', 'planner', 'ai', 'recurring'].includes(input.source) ? input.source : 'manual',
    status: 'active',
    createdAt: now,
    completedAt: null,
    postponeCount: 0,
    seriesId: input.seriesId || null,
    history: [{ at: now, action: 'created' }],
  };
  if (quest.repeats && !quest.seriesId) quest.seriesId = quest.id;
  s.quests.push(quest);
  return [{ type: 'questCreated', id: quest.id, title: quest.title }];
}

export function editQuest(s, input, now) {
  const quest = findQuest(s, input.id);
  if (quest.status !== 'active') fail('Only active quests can be edited');
  const { id, status, completedAt, createdAt, source, history, ...editable } = input; // immutable fields are ignored
  Object.assign(quest, normalizeQuestFields(s, editable, now, quest));
  quest.history.push({ at: now, action: 'edited' });
  return [];
}

export function toggleStep(s, { questId, stepId }, now) {
  const quest = findQuest(s, questId);
  if (quest.status !== 'active') fail('Quest is not active');
  const step = quest.steps.find((st) => st.id === stepId) || fail('Step not found');
  step.done = !step.done;
  quest.history.push({ at: now, action: step.done ? `step done: ${step.title}` : `step undone: ${step.title}` });
  return [];
}

export function postponeQuest(s, { id, days = 1 }, now) {
  const quest = findQuest(s, id);
  if (quest.status !== 'active') fail('Only active quests can be postponed');
  if (quest.postponeCount >= LIMITS.postpones) fail('This quest has been postponed too often. Consider making it smaller or abandoning it.');
  const n = intInRange(days, 'Days', 1, 14);
  quest.dueAt = endOfDay(addDays(Math.max(now, quest.dueAt ?? now), n));
  quest.postponeCount++;
  quest.history.push({ at: now, action: `postponed ${n}d` });
  return [{ type: 'info', message: 'Quest postponed. No penalty.' }];
}

export function abandonQuest(s, { id }, now) {
  const quest = findQuest(s, id);
  if (quest.status !== 'active') fail('Only active quests can be abandoned');
  quest.status = 'abandoned';
  quest.history.push({ at: now, action: 'abandoned' });
  return [{ type: 'info', message: 'Quest abandoned. Your progress is untouched.' }];
}

export function reactivateQuest(s, { id }, now) {
  const quest = findQuest(s, id);
  if (!['abandoned', 'expired'].includes(quest.status)) fail('Only abandoned or expired quests can be restored');
  if (quest.repeats && quest.spawnedNext) fail('This recurring quest already has a newer instance');
  quest.status = 'active';
  if (quest.type === 'daily' || quest.type === 'weekly') quest.dueAt = periodEnd(quest.type, now);
  quest.history.push({ at: now, action: 'restored' });
  return [];
}

export function completeQuest(s, { id }, now) {
  requireProfile(s);
  const quest = findQuest(s, id);
  if (quest.status === 'completed') fail('Quest already completed');
  if (quest.status !== 'active') fail(`Cannot complete a quest that is ${quest.status}`);
  const blocking = quest.prerequisites.map((pid) => s.quests.find((q) => q.id === pid)).filter((q) => q && q.status !== 'completed');
  if (blocking.length) fail(`Complete prerequisite first: ${blocking.map((q) => q.title).join(', ')}`);
  const openSteps = quest.steps.filter((st) => !st.done);
  if (openSteps.length) fail(`${openSteps.length} step(s) still open`);

  const today = dayKey(now);
  const doneToday = s.completions.filter((c) => dayKey(c.at) === today).length;
  const mult = taperMultiplier(doneToday);
  const amount = Math.round(quest.xpReward * mult);
  const events = [];

  quest.status = 'completed';
  quest.completedAt = now;
  quest.history.push({ at: now, action: 'completed' });
  s.completions.push({
    id: uid('c_'), questId: quest.id, at: now, xp: amount, baseXp: quest.xpReward,
    skillId: quest.skillId, questType: quest.type, difficulty: quest.difficulty, minutes: quest.estimatedMinutes,
  });
  const note = mult === 1 ? '' : mult === 0 ? 'daily XP taper: rest is part of progress' : 'daily XP taper: half XP';
  awardXp(s, { amount, source: { type: 'quest', id: quest.id, label: quest.title }, skillId: quest.skillId, now, events, note });
  events.unshift({ type: 'questCompleted', id: quest.id, title: quest.title, xp: amount, tapered: mult < 1 });
  return events;
}

// ---------- boss battles ----------

export function createBoss(s, input, now) {
  requireProfile(s);
  const difficulty = intInRange(input.difficulty ?? 3, 'Difficulty', 1, 5);
  const stagesIn = Array.isArray(input.stages) ? input.stages.filter((st) => (st.title || '').trim()) : [];
  if (stagesIn.length < LIMITS.stages.min || stagesIn.length > LIMITS.stages.max) {
    fail(`A boss battle needs ${LIMITS.stages.min}–${LIMITS.stages.max} stages`);
  }
  const stages = stagesIn.map((st, i) => ({
    id: uid('bs_'),
    title: cleanText(st.title, `Stage ${i + 1} title`),
    objective: cleanLongText(st.objective, `Stage ${i + 1} requirement`),
    status: i === 0 ? 'active' : 'locked',
    xp: stageXp(difficulty),
    clearedAt: null,
    note: '',
  }));
  const boss = {
    id: uid('b_'),
    title: cleanText(input.title, 'Boss title'),
    description: cleanLongText(input.description, 'Description'),
    skillId: optionalSkill(s, input.skillId, { forNew: true }),
    goalId: optionalGoal(s, input.goalId),
    difficulty,
    stages,
    xpReward: bossXp(difficulty, stages.length),
    status: 'active',
    createdAt: now,
    defeatedAt: null,
    history: [{ at: now, action: 'created' }],
  };
  s.bosses.push(boss);
  return [{ type: 'info', message: `Boss "${boss.title}" has appeared.`, bossId: boss.id }];
}

export function clearStage(s, { bossId, stageId, note = '' }, now) {
  const boss = findBoss(s, bossId);
  if (boss.status !== 'active') fail(`Boss battle is ${boss.status}`);
  const idx = boss.stages.findIndex((st) => st.id === stageId);
  if (idx < 0) fail('Stage not found');
  const stage = boss.stages[idx];
  if (stage.status === 'cleared') fail('Stage already cleared');
  if (stage.status !== 'active') fail('Clear the previous stage first');
  const linked = s.quests.filter((q) => q.bossId === bossId && q.stageId === stageId && q.status !== 'abandoned');
  const open = linked.filter((q) => q.status !== 'completed');
  if (open.length) fail(`Finish this stage's quests first: ${open.map((q) => q.title).join(', ')}`);

  const events = [];
  stage.status = 'cleared';
  stage.clearedAt = now;
  stage.note = cleanLongText(note, 'Note', 300);
  boss.history.push({ at: now, action: `cleared stage ${idx + 1}` });
  awardXp(s, { amount: stage.xp, source: { type: 'stage', id: stage.id, label: `${boss.title}: ${stage.title}` }, skillId: boss.skillId, now, events });
  events.unshift({ type: 'stageCleared', bossId, title: stage.title });

  const next = boss.stages[idx + 1];
  if (next) {
    next.status = 'active';
  } else {
    boss.status = 'defeated';
    boss.defeatedAt = now;
    boss.history.push({ at: now, action: 'defeated' });
    awardXp(s, { amount: boss.xpReward, source: { type: 'boss', id: boss.id, label: `Defeated ${boss.title}` }, skillId: boss.skillId, now, events });
    events.push({ type: 'bossDefeated', bossId, title: boss.title });
  }
  return events;
}

export function setBossStatus(s, { id, status }, now) {
  const boss = findBoss(s, id);
  if (status === 'abandoned' && boss.status === 'active') boss.status = 'abandoned';
  else if (status === 'active' && boss.status === 'abandoned') boss.status = 'active';
  else fail(`Cannot change boss from ${boss.status} to ${status}`);
  boss.history.push({ at: now, action: status === 'active' ? 'resumed' : 'retreated' });
  return [];
}

// ---------- achievements ----------

export function addCustomAchievement(s, input) {
  if (!ACHIEVEMENT_METRICS[input.metric]) fail('Unknown achievement metric');
  if (input.metric === 'skillQuests') findSkill(s, input.skillId);
  if (s.customAchievements.length >= 50) fail('Custom achievement limit reached');
  s.customAchievements.push({
    id: uid('ca_'),
    name: cleanText(input.name, 'Achievement name', { max: 50 }),
    description: cleanLongText(input.description, 'Description', 200) || `${ACHIEVEMENT_METRICS[input.metric]} ≥ ${input.threshold}`,
    icon: cleanText(input.icon || '★', 'Icon', { max: 4 }),
    metric: input.metric,
    skillId: input.metric === 'skillQuests' ? input.skillId : undefined,
    threshold: intInRange(input.threshold, 'Threshold', 1, 100000),
    xp: 0, // custom badges award no XP, otherwise they would be a free XP faucet
    custom: true,
  });
  return [];
}

// ---------- time passing ----------

/** Idempotent. Expires missed daily/weekly quests (no penalty) and spawns the next instance of recurring ones. */
export function rollover(s, _input, now) {
  const events = [];
  let expired = 0;
  const spawn = [];
  for (const q of s.quests) {
    const timed = q.type === 'daily' || q.type === 'weekly';
    if (!timed || !q.dueAt || now <= q.dueAt) continue;
    if (q.status === 'active') {
      q.status = 'expired';
      q.history.push({ at: now, action: 'expired (no penalty)' });
      expired++;
    }
    if (q.repeats && !q.spawnedNext && q.status !== 'abandoned') {
      q.spawnedNext = true;
      spawn.push(q);
    }
  }
  for (const q of spawn) {
    if (s.quests.filter((x) => x.status === 'active').length >= 100) break;
    const { id, status, createdAt, completedAt, history, spawnedNext, postponeCount, dueAt, xpReward, ...template } = q;
    createQuest(s, { ...template, steps: q.steps.map((st) => st.title), prerequisites: [], source: 'recurring' }, now);
  }
  if (expired) events.push({ type: 'info', message: `${expired} quest(s) expired. No XP lost. Try a smaller step today.` });
  s.meta.lastRollover = now;
  return events;
}

// ---------- imports from planner / AI ----------

/** Adds user-approved drafts atomically: if any draft is invalid, none are added. */
export function acceptDrafts(s, { drafts, source }, now) {
  if (!Array.isArray(drafts) || !drafts.length) fail('Nothing selected');
  if (drafts.length > 20) fail('At most 20 quests at once');
  const events = [];
  for (const d of drafts) events.push(...createQuest(s, { ...d, source }, now));
  return [{ type: 'info', message: `${drafts.length} quest(s) added to your board.` }, ...events];
}

export const ACTIONS = {
  createProfile, updateProfile, updateSettings, createSkill, updateSkill, createGoal, updateGoal,
  createQuest, editQuest, toggleStep, postponeQuest, abandonQuest, reactivateQuest, completeQuest,
  createBoss, clearStage, setBossStatus, addCustomAchievement, rollover, acceptDrafts,
};

/** Pure entry point: returns a new state and events, or throws without touching the input. */
export function apply(state, action, payload, now) {
  const fn = ACTIONS[action];
  if (!fn) fail(`Unknown action: ${action}`);
  const draft = structuredClone(state);
  const events = fn(draft, payload ?? {}, now) || [];
  if (action !== 'rollover') rollover(draft, null, now);
  checkAchievements(draft, now, events);
  return { state: draft, events };
}

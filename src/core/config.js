// Static game rules and defaults. Everything here is plain data so it can be tuned in one place.

export const SCHEMA_VERSION = 2;

export const DIFFICULTY = {
  1: { label: 'Trivial', xp: 10 },
  2: { label: 'Easy', xp: 20 },
  3: { label: 'Normal', xp: 35 },
  4: { label: 'Hard', xp: 55 },
  5: { label: 'Epic', xp: 80 },
};

export const QUEST_TYPES = ['daily', 'weekly', 'custom', 'longterm'];
export const RECURRENCE = ['none', 'daily', 'weekly'];
export const DIFFICULTY_MODES = ['relaxed', 'balanced', 'challenging'];

// Anti-farming: per local day, the first N completions earn full XP, the next M earn half, the rest earn none.
// Quests still count as completed; only the XP tapers off. Rest is part of progress.
export const DAILY_XP_TAPER = { full: 8, half: 4 };

export const LIMITS = {
  title: 80,
  text: 500,
  minutes: { min: 5, max: 480 },
  steps: 12,
  stages: { min: 2, max: 10 },
  postpones: 5,
};

export const DEFAULT_SKILLS = [
  { id: 'programming', name: 'Programming', icon: '⌨', color: '#5b8cff' },
  { id: 'fitness', name: 'Physical Fitness', icon: '⚡', color: '#ff6b6b' },
  { id: 'learning', name: 'Learning', icon: '📖', color: '#ffd166' },
  { id: 'creativity', name: 'Creativity', icon: '✦', color: '#c77dff' },
  { id: 'communication', name: 'Communication', icon: '☍', color: '#4cc9f0' },
  { id: 'finance', name: 'Financial Literacy', icon: '◈', color: '#06d6a0' },
  { id: 'problem', name: 'Problem Solving', icon: '⧉', color: '#f78c6b' },
  { id: 'discipline', name: 'Personal Discipline', icon: '⛨', color: '#a3b1c6' },
];

export const SKILL_MILESTONES = [2, 5, 10, 15, 20];

// metric names are computed in achievements.js -> computeMetrics
export const ACHIEVEMENT_METRICS = {
  questsCompleted: 'Quests completed',
  bossesDefeated: 'Bosses defeated',
  stagesCleared: 'Boss stages cleared',
  skillLevelUps: 'Skill level-ups (total)',
  level: 'Character level',
  activeDays: 'Active days (total, not consecutive)',
  longtermCompleted: 'Long-term objectives completed',
  personalBests: 'Personal-best days',
  skillQuests: 'Quests completed in one skill',
};

export const DEFAULT_ACHIEVEMENTS = [
  { id: 'first_quest', name: 'First Quest Completed', description: 'Complete your first quest.', icon: '🗡', metric: 'questsCompleted', threshold: 1, xp: 15 },
  { id: 'seven_quests', name: 'Seven Quests Completed', description: 'Complete seven quests.', icon: '⚔', metric: 'questsCompleted', threshold: 7, xp: 30 },
  { id: 'first_skill_level', name: 'First Skill Level-Up', description: 'Raise any skill to level 2.', icon: '⬆', metric: 'skillLevelUps', threshold: 1, xp: 20 },
  { id: 'first_boss', name: 'First Boss Defeated', description: 'Clear every stage of a boss battle.', icon: '👑', metric: 'bossesDefeated', threshold: 1, xp: 50 },
  { id: 'learning_milestone', name: 'Learning Milestone', description: 'Complete five Learning quests.', icon: '🎓', metric: 'skillQuests', skillId: 'learning', threshold: 5, xp: 30 },
  { id: 'project_completed', name: 'Project Completed', description: 'Complete a long-term objective.', icon: '🏗', metric: 'longtermCompleted', threshold: 1, xp: 40 },
  { id: 'personal_best', name: 'Personal Best', description: 'Beat your previous best day (at least 2 quests).', icon: '🏆', metric: 'personalBests', threshold: 1, xp: 25 },
  { id: 'consistent_7', name: 'Steady Hands', description: 'Be active on 7 different days. Gaps never reset this.', icon: '🕯', metric: 'activeDays', threshold: 7, xp: 30 },
  { id: 'level_5', name: 'Rising Hero', description: 'Reach character level 5.', icon: '✪', metric: 'level', threshold: 5, xp: 40 },
];

export const DEFAULT_SETTINGS = {
  difficultyMode: 'balanced',
  dailyMinutes: 45,
  curve: { base: 100, exponent: 1.5 },
  skillCurve: { base: 60, exponent: 1.4 },
  notifications: { enabled: false, time: '19:00' },
  ai: { provider: 'local', model: 'claude-opus-5-5', timeoutMs: 30000 },
  reduceMotion: false,
};

import { SCHEMA_VERSION, DEFAULT_SETTINGS } from './config.js';
import { GameError } from './util.js';

// Each migration upgrades from version N to N+1. Never edit a shipped migration; add a new one.
export const MIGRATIONS = {
  // v1 -> v2: custom achievements, quest audit history/postpone count, AI + motion settings.
  1: (s) => {
    s.customAchievements = s.customAchievements || [];
    for (const q of s.quests) {
      q.history = q.history || [{ at: q.createdAt, action: 'created' }];
      q.postponeCount = q.postponeCount || 0;
      q.repeats = Boolean(q.repeats);
    }
    s.settings = { ...structuredClone(DEFAULT_SETTINGS), ...s.settings };
    s.meta = s.meta || {};
    return s;
  },
};

const ARRAYS = ['skills', 'goals', 'quests', 'completions', 'ledger', 'achievements', 'bosses'];

export function assertShape(s) {
  if (!s || typeof s !== 'object') throw new GameError('Save data is not an object');
  if (!Number.isInteger(s.schemaVersion) || s.schemaVersion < 1) throw new GameError('Save data has no valid schema version');
  if (s.schemaVersion > SCHEMA_VERSION) throw new GameError('Save data is from a newer app version. Update the app first.');
  for (const k of ARRAYS) if (!Array.isArray(s[k])) throw new GameError(`Save data is missing "${k}"`);
  if (s.profile !== null && (typeof s.profile !== 'object' || !Number.isFinite(s.profile.lifetimeXp) || s.profile.lifetimeXp < 0)) {
    throw new GameError('Save data has an invalid profile');
  }
}

export function migrate(input) {
  assertShape(input);
  const s = structuredClone(input);
  while (s.schemaVersion < SCHEMA_VERSION) {
    const step = MIGRATIONS[s.schemaVersion];
    if (!step) throw new GameError(`No migration from schema v${s.schemaVersion}`);
    step(s);
    s.schemaVersion++;
  }
  return s;
}

/**
 * The XP ledger is the audit source of truth. Totals are rebuilt from it so a corrupted
 * cached total can never grant or remove XP. Returns a list of corrections made.
 */
export function reconcile(s) {
  const fixes = [];
  const seen = new Set();
  const ledger = [];
  for (const e of s.ledger) {
    const key = `${e.sourceType}:${e.sourceId}`;
    if (seen.has(key) || !Number.isInteger(e.amount) || e.amount < 0) { fixes.push(`dropped invalid ledger entry ${key}`); continue; }
    seen.add(key);
    ledger.push(e);
  }
  s.ledger = ledger;
  if (s.profile) {
    const total = ledger.reduce((n, e) => n + e.amount, 0);
    if (s.profile.lifetimeXp !== total) { fixes.push(`lifetime XP ${s.profile.lifetimeXp} -> ${total}`); s.profile.lifetimeXp = total; }
  }
  for (const skill of s.skills) {
    const xp = ledger.filter((e) => e.skillId === skill.id).reduce((n, e) => n + e.amount, 0);
    if (skill.xp !== xp) { fixes.push(`${skill.name} XP ${skill.xp} -> ${xp}`); skill.xp = xp; }
  }
  return fixes;
}

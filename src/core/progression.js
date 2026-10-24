import { DIFFICULTY, DAILY_XP_TAPER } from './config.js';

const MAX_LEVEL = 999;

export function validateCurve(curve) {
  const ok = curve && Number.isFinite(curve.base) && Number.isFinite(curve.exponent)
    && curve.base >= 10 && curve.base <= 10000 && curve.exponent >= 1 && curve.exponent <= 3;
  if (!ok) throw new RangeError('XP curve needs base 10–10000 and exponent 1–3');
  return curve;
}

/** XP required to advance from `level` to `level + 1`. */
export function xpToNext(level, curve) {
  return Math.round(curve.base * Math.pow(level, curve.exponent));
}

/** Level is always derived from total XP, so it can never drift out of sync with the ledger. */
export function levelInfo(totalXp, curve) {
  if (!Number.isFinite(totalXp) || totalXp < 0) throw new RangeError(`Invalid XP total: ${totalXp}`);
  let level = 1;
  let remaining = Math.floor(totalXp);
  while (level < MAX_LEVEL && remaining >= xpToNext(level, curve)) {
    remaining -= xpToNext(level, curve);
    level++;
  }
  const needed = xpToNext(level, curve);
  return { level, currentXp: remaining, needed, toNext: needed - remaining, progress: remaining / needed };
}

/** Base reward for a quest: difficulty + capped time bonus + small bonus for real multi-step structure. */
export function questXp({ difficulty, estimatedMinutes, type, steps = [] }) {
  const d = DIFFICULTY[difficulty];
  if (!d) throw new RangeError(`Invalid difficulty: ${difficulty}`);
  const timeBonus = Math.round(Math.min(estimatedMinutes || 0, 180) / 15) * 2;
  const stepBonus = Math.min(steps.length, 5) * 3;
  const mult = type === 'longterm' ? 2 : 1;
  return (d.xp + timeBonus + stepBonus) * mult;
}

export function stageXp(difficulty) { return 25 * difficulty; }
export function bossXp(difficulty, stageCount) { return 60 * difficulty + 10 * stageCount; }

/** Multiplier for the nth completion of a day (0-based index). */
export function taperMultiplier(index) {
  if (index < DAILY_XP_TAPER.full) return 1;
  if (index < DAILY_XP_TAPER.full + DAILY_XP_TAPER.half) return 0.5;
  return 0;
}

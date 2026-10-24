import { test } from 'node:test';
import assert from 'node:assert/strict';
import { xpToNext, levelInfo, questXp, taperMultiplier, validateCurve } from '../src/core/progression.js';

const curve = { base: 100, exponent: 1.5 };

test('xpToNext follows base * level^exponent', () => {
  assert.equal(xpToNext(1, curve), 100);
  assert.equal(xpToNext(2, curve), 283);
  assert.equal(xpToNext(4, curve), 800);
});

test('levelInfo derives level and remaining XP at exact boundaries', () => {
  assert.deepEqual(levelInfo(0, curve), { level: 1, currentXp: 0, needed: 100, toNext: 100, progress: 0 });
  assert.equal(levelInfo(99, curve).level, 1);
  assert.equal(levelInfo(100, curve).level, 2);
  assert.equal(levelInfo(100, curve).currentXp, 0);
  assert.equal(levelInfo(383, curve).level, 3);
  assert.equal(levelInfo(382, curve).toNext, 1);
});

test('levelInfo rejects negative and non-numeric XP', () => {
  assert.throws(() => levelInfo(-1, curve), RangeError);
  assert.throws(() => levelInfo(NaN, curve), RangeError);
  assert.throws(() => levelInfo(Infinity, curve), RangeError);
});

test('levelInfo is capped and terminates for huge totals', () => {
  assert.equal(levelInfo(1e15, curve).level, 999);
});

test('curve validation rejects unsafe configs', () => {
  assert.throws(() => validateCurve({ base: 0, exponent: 1.5 }));
  assert.throws(() => validateCurve({ base: 100, exponent: 0.5 }));
  assert.doesNotThrow(() => validateCurve({ base: 50, exponent: 2 }));
});

test('questXp rewards difficulty, capped time and structure', () => {
  assert.equal(questXp({ difficulty: 1, estimatedMinutes: 0 }), 10);
  assert.equal(questXp({ difficulty: 3, estimatedMinutes: 30 }), 39);
  assert.equal(questXp({ difficulty: 3, estimatedMinutes: 480 }), questXp({ difficulty: 3, estimatedMinutes: 180 }));
  assert.equal(questXp({ difficulty: 2, estimatedMinutes: 30, type: 'longterm' }), 48);
  assert.equal(questXp({ difficulty: 2, estimatedMinutes: 30, steps: [1, 2, 3, 4, 5, 6, 7] }), 24 + 15);
  assert.throws(() => questXp({ difficulty: 6, estimatedMinutes: 30 }));
});

test('daily taper: 8 full, 4 half, then none', () => {
  assert.equal(taperMultiplier(0), 1);
  assert.equal(taperMultiplier(7), 1);
  assert.equal(taperMultiplier(8), 0.5);
  assert.equal(taperMultiplier(11), 0.5);
  assert.equal(taperMultiplier(12), 0);
});

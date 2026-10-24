import { test } from 'node:test';
import assert from 'node:assert/strict';
import { runMonteCarlo, mulberry32, sample, percentile, validateDistribution } from '../src/engine/montecarlo.js';
import { simulateBusiness } from '../src/engine/business.js';

const sum = ({ a, b }) => a + b;

test('same seed reproduces identical results; another seed differs', () => {
  const cfg = { trials: 2000, seed: 42, baseValues: { a: 0, b: 5 }, distributions: { a: { type: 'uniform', min: 0, max: 10 } }, evaluate: sum };
  const r1 = runMonteCarlo(cfg);
  const r2 = runMonteCarlo(cfg);
  assert.deepEqual(r1, r2);
  assert.notEqual(runMonteCarlo({ ...cfg, seed: 43 }).mean, r1.mean);
});

test('uniform and triangular samples stay in bounds with correct means', () => {
  const rand = mulberry32(7);
  const n = 20000;
  let su = 0; let st = 0;
  for (let i = 0; i < n; i++) {
    const u = sample({ type: 'uniform', min: 2, max: 4 }, rand);
    const t = sample({ type: 'triangular', min: 0, mode: 3, max: 6 }, rand);
    assert.ok(u >= 2 && u < 4);
    assert.ok(t >= 0 && t <= 6);
    su += u; st += t;
  }
  assert.ok(Math.abs(su / n - 3) < 0.03); // uniform mean (2+4)/2
  assert.ok(Math.abs(st / n - 3) < 0.05); // triangular mean (0+3+6)/3
});

test('normal samples: mean, sd and clamping', () => {
  const rand = mulberry32(1);
  const xs = Array.from({ length: 20000 }, () => sample({ type: 'normal', mean: 10, sd: 2 }, rand));
  const mean = xs.reduce((s, x) => s + x, 0) / xs.length;
  const sd = Math.sqrt(xs.reduce((s, x) => s + (x - mean) ** 2, 0) / xs.length);
  assert.ok(Math.abs(mean - 10) < 0.06);
  assert.ok(Math.abs(sd - 2) < 0.06);
  const clamped = Array.from({ length: 2000 }, () => sample({ type: 'normal', mean: 0, sd: 5, min: -1, max: 1 }, rand));
  assert.ok(clamped.every((x) => x >= -1 && x <= 1));
});

test('percentiles use linear interpolation', () => {
  assert.equal(percentile([1, 2, 3, 4, 5], 0.5), 3);
  assert.equal(percentile([0, 10], 0.25), 2.5);
  assert.equal(percentile([], 0.5), null);
});

test('fixed-only uncertainty collapses to a single outcome', () => {
  const r = runMonteCarlo({ trials: 100, seed: 1, baseValues: { a: 0, b: 1 }, distributions: { a: { type: 'fixed', value: 4 } }, evaluate: sum });
  assert.equal(r.sd, 0);
  assert.equal(r.p5, 5);
  assert.equal(r.p95, 5);
  assert.equal(r.correlations[0].r, null); // no variation: correlation undefined, not invented
});

test('invalid distributions and limits are rejected', () => {
  assert.throws(() => validateDistribution({ type: 'uniform', min: 5, max: 5 }), /min < max/);
  assert.throws(() => validateDistribution({ type: 'triangular', min: 0, mode: 9, max: 5 }), /most likely/);
  assert.throws(() => validateDistribution({ type: 'normal', mean: 0, sd: -1 }), /deviation/);
  assert.throws(() => validateDistribution({ type: 'beta' }), /unknown/);
  const cfg = { seed: 1, baseValues: { a: 0, b: 0 }, distributions: { a: { type: 'fixed', value: 1 } }, evaluate: sum };
  assert.throws(() => runMonteCarlo({ ...cfg, trials: 50 }), /100 to 20000/);
  assert.throws(() => runMonteCarlo({ ...cfg, trials: 100000 }), /100 to 20000/);
  assert.throws(() => runMonteCarlo({ ...cfg, trials: 100, seed: -1 }), /Seed/);
  assert.throws(() => runMonteCarlo({ ...cfg, trials: 100, distributions: {} }), /at least one/);
});

test('business Monte Carlo: share of trials with negative cash and driver correlation', () => {
  const base = { startingCash: 20000, initialInvestment: 0, price: 500, unitsPerMonth: 40, variableCost: 200, fixedMonthly: 8000, marketingMonthly: 0, growthPct: 0, months: 6, taxPct: 0 };
  const r = runMonteCarlo({
    trials: 3000, seed: 99, baseValues: base,
    distributions: { unitsPerMonth: { type: 'triangular', min: 0, mode: 30, max: 60 } },
    evaluate: (v) => simulateBusiness(v).summary.finalCash,
  });
  // final cash = 20000 + 6 × (300u − 8000) < 0  ⇔  u < 15.56; P(u<15.56) under tri(0,30,60) = 15.56²/(60×30) ≈ 0.1345
  assert.ok(Math.abs(r.shareBelowThreshold - 0.1345) < 0.02, `share ${r.shareBelowThreshold}`);
  assert.ok(r.correlations[0].r > 0.99); // final cash is linear in units
  assert.ok(r.p5 < r.p50 && r.p50 < r.p95);
  assert.equal(r.histogram.reduce((s, b) => s + b.count, 0), r.valid);
});

test('trials with invalid sampled inputs are dropped and counted, not silently used', () => {
  const r = runMonteCarlo({
    trials: 1000, seed: 3, baseValues: { startingCash: 0, initialInvestment: 0, price: 10, unitsPerMonth: 1, variableCost: 0, fixedMonthly: 0, months: 1 },
    distributions: { price: { type: 'uniform', min: -2, max: 10 } }, // negative prices are invalid inputs
    evaluate: (v) => simulateBusiness(v).summary.finalCash,
  });
  assert.ok(r.invalid > 100 && r.invalid < 250); // ≈ 2/12 of trials
  assert.equal(r.valid + r.invalid, 1000);
  assert.ok(r.min >= 0);
});

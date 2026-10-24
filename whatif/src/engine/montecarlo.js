// Seeded Monte Carlo over user-defined input distributions. Same seed + inputs => same results.

import { SimError } from './validate.js';

export const MAX_TRIALS = 20000;

/** mulberry32: small, fast, well-distributed 32-bit PRNG. */
export function mulberry32(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function validateDistribution(d, label = 'input') {
  const num = (x) => Number.isFinite(x);
  switch (d?.type) {
    case 'fixed': if (!num(d.value)) throw new SimError(`${label}: fixed value must be a number`); break;
    case 'uniform': if (!num(d.min) || !num(d.max) || d.min >= d.max) throw new SimError(`${label}: uniform needs min < max`); break;
    case 'triangular':
      if (![d.min, d.mode, d.max].every(num) || !(d.min <= d.mode && d.mode <= d.max) || d.min >= d.max) throw new SimError(`${label}: triangular needs min ≤ most likely ≤ max and min < max`);
      break;
    case 'normal':
      if (!num(d.mean) || !num(d.sd) || d.sd < 0) throw new SimError(`${label}: normal needs a mean and a standard deviation ≥ 0`);
      if (num(d.min) && num(d.max) && d.min >= d.max) throw new SimError(`${label}: normal bounds need min < max`);
      break;
    default: throw new SimError(`${label}: unknown distribution`);
  }
  return d;
}

export function sample(d, rand) {
  switch (d.type) {
    case 'fixed': return d.value;
    case 'uniform': return d.min + (d.max - d.min) * rand();
    case 'triangular': {
      const u = rand();
      const c = (d.mode - d.min) / (d.max - d.min);
      return u < c ? d.min + Math.sqrt(u * (d.max - d.min) * (d.mode - d.min)) : d.max - Math.sqrt((1 - u) * (d.max - d.min) * (d.max - d.mode));
    }
    case 'normal': {
      // Box–Muller; values outside optional bounds are clamped (documented in the UI).
      const u1 = Math.max(rand(), 1e-12);
      const z = Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * rand());
      let x = d.mean + d.sd * z;
      if (Number.isFinite(d.min)) x = Math.max(d.min, x);
      if (Number.isFinite(d.max)) x = Math.min(d.max, x);
      return x;
    }
    default: throw new SimError('unknown distribution');
  }
}

export function percentile(sorted, p) {
  if (!sorted.length) return null;
  const idx = (sorted.length - 1) * p;
  const lo = Math.floor(idx);
  const hi = Math.ceil(idx);
  return sorted[lo] + (sorted[hi] - sorted[lo]) * (idx - lo);
}

function pearson(xs, ys) {
  const n = xs.length;
  const mx = xs.reduce((s, x) => s + x, 0) / n;
  const my = ys.reduce((s, y) => s + y, 0) / n;
  let sxy = 0; let sxx = 0; let syy = 0;
  for (let i = 0; i < n; i++) { const dx = xs[i] - mx; const dy = ys[i] - my; sxy += dx * dy; sxx += dx * dx; syy += dy * dy; }
  return sxx === 0 || syy === 0 ? null : sxy / Math.sqrt(sxx * syy);
}

/**
 * evaluate(values) -> number (the metric) or throws for an invalid trial (counted, not fatal).
 * distributions: { inputKey: dist }. baseValues: the deterministic inputs for keys without a distribution.
 */
export function runMonteCarlo({ trials, seed, distributions, baseValues, evaluate, threshold = 0 }) {
  if (!Number.isInteger(trials) || trials < 100 || trials > MAX_TRIALS) throw new SimError(`Trials must be a whole number from 100 to ${MAX_TRIALS}`);
  if (!Number.isInteger(seed) || seed < 0 || seed > 0xffffffff) throw new SimError('Seed must be a whole number from 0 to 4294967295');
  const keys = Object.keys(distributions || {});
  if (!keys.length) throw new SimError('Give at least one input a probability distribution');
  keys.forEach((k) => validateDistribution(distributions[k], k));
  const rand = mulberry32(seed);
  const samples = Object.fromEntries(keys.map((k) => [k, []]));
  const results = [];
  let invalid = 0;
  for (let t = 0; t < trials; t++) {
    const values = { ...baseValues };
    const drawn = {};
    for (const k of keys) drawn[k] = values[k] = sample(distributions[k], rand);
    let r;
    try { r = evaluate(values); } catch { invalid++; continue; }
    if (!Number.isFinite(r)) { invalid++; continue; }
    results.push(r);
    for (const k of keys) samples[k].push(drawn[k]);
  }
  if (results.length < trials / 2) throw new SimError(`${invalid} of ${trials} trials produced invalid inputs. Narrow the distributions.`);
  const order = results.map((_, i) => i).sort((a, b) => results[a] - results[b]);
  const sorted = order.map((i) => results[i]);
  const n = sorted.length;
  const mean = sorted.reduce((s, x) => s + x, 0) / n;
  const sd = Math.sqrt(sorted.reduce((s, x) => s + (x - mean) ** 2, 0) / n);
  const bins = 20;
  const lo = sorted[0];
  const hi = sorted[n - 1];
  const width = (hi - lo) / bins || 1;
  const histogram = Array.from({ length: bins }, (_, b) => ({ from: lo + b * width, to: lo + (b + 1) * width, count: 0 }));
  for (const x of sorted) histogram[Math.min(bins - 1, Math.floor((x - lo) / width))].count++;
  return {
    trials, seed, valid: n, invalid,
    mean, sd, min: lo, max: hi,
    p5: percentile(sorted, 0.05), p25: percentile(sorted, 0.25), p50: percentile(sorted, 0.5), p75: percentile(sorted, 0.75), p95: percentile(sorted, 0.95),
    shareBelowThreshold: sorted.filter((x) => x < threshold).length / n,
    threshold,
    histogram,
    correlations: keys.map((k) => ({ key: k, r: pearson(samples[k], results) })).sort((a, b) => Math.abs(b.r ?? 0) - Math.abs(a.r ?? 0)),
  };
}

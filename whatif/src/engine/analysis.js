// Comparison, sensitivity and what-if modifications. Works for any simulator via a metric function.

import { pctChange, SimError } from './validate.js';

/** rows: original vs modified for each metric; percentage only where it is meaningful. */
export function compareSummaries(base, next, metrics) {
  return Object.entries(metrics).map(([key, label]) => {
    const a = base?.[key] ?? null;
    const b = next?.[key] ?? null;
    const both = typeof a === 'number' && typeof b === 'number';
    return { key, label, base: a, next: b, diff: both ? b - a : null, pct: both ? pctChange(a, b) : { value: null, reason: 'not available in both' } };
  });
}

/**
 * One-at-a-time sensitivity: move each input by ±pct and record the metric.
 * run(values) -> number. Inputs equal to zero are skipped (a % change of zero is zero).
 */
export function sensitivity(values, keys, run, pct = 20) {
  if (!(pct > 0 && pct <= 100)) throw new SimError('Sensitivity change must be between 0 and 100%');
  const base = run(values);
  const rows = [];
  const skipped = [];
  for (const k of keys) {
    const x = Number(values[k]);
    if (!Number.isFinite(x) || x === 0) { skipped.push(k); continue; }
    const lowVals = { ...values, [k]: x * (1 - pct / 100) };
    const highVals = { ...values, [k]: x * (1 + pct / 100) };
    let low; let high;
    try { low = run(lowVals); high = run(highVals); } catch { skipped.push(k); continue; }
    rows.push({ key: k, low, high, swing: Math.abs(high - low) });
  }
  rows.sort((a, b) => b.swing - a.swing);
  return { base, pct, rows, skipped };
}

export const CHANGE_OPS = {
  pct: 'Change by %',
  add: 'Add',
  mul: 'Multiply by',
  set: 'Set to',
};

/** Applies what-if changes to a plain values object. Never mutates the input. */
export function applyChanges(values, changes) {
  const out = { ...values };
  for (const c of changes || []) {
    if (!(c.key in out)) throw new SimError(`Unknown input “${c.key}”`);
    const amount = Number(c.amount);
    if (!Number.isFinite(amount)) throw new SimError(`Change for ${c.key} needs a number`);
    const cur = Number(out[c.key]);
    if (!Number.isFinite(cur) && c.op !== 'set') throw new SimError(`${c.key} has no value to change`);
    switch (c.op) {
      case 'pct': out[c.key] = cur * (1 + amount / 100); break;
      case 'add': out[c.key] = cur + amount; break;
      case 'mul': out[c.key] = cur * amount; break;
      case 'set': out[c.key] = amount; break;
      default: throw new SimError(`Unknown change type “${c.op}”`);
    }
  }
  return out;
}

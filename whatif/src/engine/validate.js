// Field specs + validation shared by every simulator. Engines only ever see validated numbers.

export class SimError extends Error {
  constructor(message, details = []) { super(message); this.name = 'SimError'; this.details = details; }
}

/**
 * fields: [{ key, label, min, max, integer, required, unit }]
 * values: { key: number|null|undefined }
 * Returns { ok, values (numbers), errors: [{key, message}], missing: [key] }.
 */
export function validateFields(fields, values) {
  const errors = [];
  const missing = [];
  const out = {};
  for (const f of fields) {
    const raw = values?.[f.key];
    if (raw === null || raw === undefined || raw === '') {
      if (f.required !== false) missing.push(f.key);
      else out[f.key] = f.default ?? 0;
      continue;
    }
    const n = typeof raw === 'number' ? raw : Number(String(raw).replace(/[,_\s]/g, ''));
    if (!Number.isFinite(n)) { errors.push({ key: f.key, message: `${f.label} must be a number` }); continue; }
    if (f.integer && !Number.isInteger(n)) { errors.push({ key: f.key, message: `${f.label} must be a whole number` }); continue; }
    if (f.min !== undefined && n < f.min) { errors.push({ key: f.key, message: `${f.label} must be at least ${f.min}` }); continue; }
    if (f.max !== undefined && n > f.max) { errors.push({ key: f.key, message: `${f.label} must be at most ${f.max}` }); continue; }
    out[f.key] = n;
  }
  return { ok: !errors.length && !missing.length, values: out, errors, missing };
}

export function requireValid(fields, values) {
  const r = validateFields(fields, values);
  if (r.missing.length) {
    const labels = r.missing.map((k) => fields.find((f) => f.key === k).label);
    throw new SimError(`Missing inputs: ${labels.join(', ')}`, r.missing.map((key) => ({ key, message: 'missing' })));
  }
  if (r.errors.length) throw new SimError(r.errors.map((e) => e.message).join('; '), r.errors);
  return r.values;
}

/** Round to cents/paise for display-stable outputs without hiding real precision in calculations. */
export const round2 = (x) => Math.round((x + Number.EPSILON) * 100) / 100;

/**
 * Percentage change that refuses to produce misleading numbers.
 * Returns { value: number|null, reason }.
 */
export function pctChange(base, next) {
  if (!Number.isFinite(base) || !Number.isFinite(next)) return { value: null, reason: 'not a number' };
  if (base === 0) return { value: null, reason: 'baseline is zero' };
  if (base < 0 || next < 0) return { value: null, reason: 'negative values make % change misleading' };
  return { value: ((next - base) / base) * 100, reason: '' };
}

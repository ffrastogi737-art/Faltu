// The only shape AI (or the rule parser) may hand to the app. Everything is validated before use;
// unknown values stay null and are reported as missing rather than guessed.

import { BUSINESS_FIELDS } from '../engine/business.js';
import { CAREER_FIELDS } from '../engine/career.js';
import { newScenario } from '../engine/scenario.js';

export const DRAFT_TYPES = ['business', 'career', 'custom'];
export const FIELD_SETS = { business: BUSINESS_FIELDS, career: CAREER_FIELDS };
const ALL_KEYS = [...new Set([...BUSINESS_FIELDS, ...CAREER_FIELDS].map((f) => f.key))];

/** JSON schema used to constrain local model output (grammar-based sampling). */
export const DRAFT_JSON_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['scenario_type', 'title', 'currency', 'values', 'assumptions'],
  properties: {
    scenario_type: { type: 'string', enum: DRAFT_TYPES },
    title: { type: 'string' },
    currency: { type: ['string', 'null'] },
    values: {
      type: 'object',
      additionalProperties: false,
      properties: Object.fromEntries(ALL_KEYS.map((k) => [k, { type: ['number', 'null'] }])),
    },
    assumptions: { type: 'array', items: { type: 'string' } },
  },
};

/**
 * Returns { ok, draft, errors, rejected } where draft = {scenario_type, title, currency, values, missing_inputs, assumptions}.
 * Out-of-range numbers are dropped to null (and listed in `rejected`) instead of being trusted.
 */
export function validateDraft(raw) {
  const errors = [];
  let obj = raw;
  if (typeof raw === 'string') {
    try { obj = JSON.parse(raw); } catch { return { ok: false, errors: ['Output is not valid JSON'], rejected: [] }; }
  }
  if (!obj || typeof obj !== 'object' || Array.isArray(obj)) return { ok: false, errors: ['Output is not an object'], rejected: [] };
  if (!DRAFT_TYPES.includes(obj.scenario_type)) return { ok: false, errors: [`Unknown scenario_type “${obj.scenario_type}”`], rejected: [] };
  const type = obj.scenario_type;
  const title = typeof obj.title === 'string' && obj.title.trim() ? obj.title.trim().slice(0, 80) : 'Untitled scenario';
  const currency = typeof obj.currency === 'string' && /^[A-Z]{3}$/.test(obj.currency) ? obj.currency : null;
  const fields = FIELD_SETS[type] || [];
  const values = {};
  const rejected = [];
  const rawValues = obj.values && typeof obj.values === 'object' ? obj.values : {};
  for (const f of fields) {
    const x = rawValues[f.key];
    if (x === null || x === undefined) { values[f.key] = null; continue; }
    const bad = typeof x !== 'number' || !Number.isFinite(x) || (f.min !== undefined && x < f.min) || (f.max !== undefined && x > f.max) || (f.integer && !Number.isInteger(x));
    if (bad) { rejected.push(`${f.label}: ${JSON.stringify(x)}`); values[f.key] = null; } else values[f.key] = x;
  }
  for (const k of Object.keys(rawValues)) {
    if (!fields.some((f) => f.key === k) && rawValues[k] !== null) rejected.push(`${k} (not used by a ${type} scenario)`);
  }
  const assumptions = Array.isArray(obj.assumptions) ? obj.assumptions.filter((a) => typeof a === 'string' && a.trim()).map((a) => a.trim().slice(0, 200)).slice(0, 10) : [];
  // Missing inputs are recomputed here; the model's own list is never trusted.
  const missing_inputs = fields.filter((f) => f.required !== false && values[f.key] === null).map((f) => f.key);
  return { ok: !errors.length, draft: { scenario_type: type, title, currency, values, missing_inputs, assumptions }, errors, rejected };
}

/**
 * Turns a validated draft into a scenario. `source` marks provenance:
 * 'fact' for numbers read straight from the user's own words, 'ai' for model output (needs confirmation).
 */
export function draftToScenario(draft, { id, now, source }) {
  const s = newScenario(draft.scenario_type, { id, name: draft.title, now });
  if (draft.scenario_type === 'custom') {
    s.notes = draft.assumptions.join('\n');
    return s;
  }
  for (const [k, v] of Object.entries(draft.values)) {
    if (v !== null && s.inputs[k]) s.inputs[k] = { value: v, source };
  }
  s.notes = draft.assumptions.length ? `Assumptions noted while interpreting:\n- ${draft.assumptions.join('\n- ')}` : '';
  return s;
}

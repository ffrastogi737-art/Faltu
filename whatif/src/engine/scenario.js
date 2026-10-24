// One adapter per scenario type so comparison, lab, sensitivity and Monte Carlo work for all of them.
// Scenario inputs carry provenance: { value, source: 'fact' | 'assumption' | 'example' | 'ai' }.

import { BUSINESS_FIELDS, BUSINESS_EXAMPLE, BUSINESS_METRICS, simulateBusiness, businessCases, DEFAULT_SPREAD } from './business.js';
import { CAREER_FIELDS, CAREER_EXAMPLE, CAREER_METRICS, simulateCareer } from './career.js';
import { CUSTOM_EXAMPLE, simulateCustom } from './custom.js';
import { SimError } from './validate.js';

export const SOURCES = {
  fact: 'Your fact',
  assumption: 'Your assumption',
  example: 'Example value (edit me)',
  ai: 'AI suggestion (confirm)',
};

const plain = (inputs) => Object.fromEntries(Object.entries(inputs || {}).map(([k, x]) => [k, x?.value ?? null]));

export const TYPES = {
  business: {
    label: 'Business',
    fields: BUSINESS_FIELDS,
    metrics: BUSINESS_METRICS,
    headline: 'finalCash',
    values: (s) => plain(s.inputs),
    run: (s, values = plain(s.inputs)) => simulateBusiness(values, s.otherCosts),
    sensitivityKeys: ['unitsPerMonth', 'price', 'variableCost', 'fixedMonthly', 'marketingMonthly', 'growthPct', 'initialInvestment'],
  },
  career: {
    label: 'Career & learning',
    fields: CAREER_FIELDS,
    metrics: CAREER_METRICS,
    headline: 'weeksToTarget',
    values: (s) => plain(s.inputs),
    run: (s, values = plain(s.inputs)) => simulateCareer(values, s.milestones, s.startDate),
    sensitivityKeys: ['hoursToTarget', 'hoursPerWeek', 'consistencyPct', 'trainingCost', 'monthlyCost'],
  },
  custom: {
    label: 'Custom what-if',
    fields: null, // defined by the user's variables
    get metrics() { return null; },
    headline: null,
    values: (s) => Object.fromEntries(s.model.variables.map((v) => [v.key, v.value ?? null])),
    run: (s, values) => simulateCustom({
      variables: s.model.variables.map((v) => ({ ...v, value: values ? values[v.key] : v.value })),
      outputs: s.model.outputs,
    }),
    sensitivityKeys: null,
  },
};

export function metricsFor(s) {
  if (s.type !== 'custom') return TYPES[s.type].metrics;
  return Object.fromEntries(s.model.outputs.map((o) => [o.key, o.label || o.key]));
}

export function headlineFor(s) {
  return s.type === 'custom' ? s.model.outputs[0]?.key : TYPES[s.type].headline;
}

export function fieldsFor(s) {
  if (s.type !== 'custom') return TYPES[s.type].fields;
  return s.model.variables.map((v) => ({ key: v.key, label: v.label || v.key, unit: v.unit || 'number' }));
}

export function sensitivityKeysFor(s) {
  return s.type === 'custom' ? s.model.variables.map((v) => v.key) : TYPES[s.type].sensitivityKeys;
}

/** Inputs that still block a run: missing values and unconfirmed AI suggestions. */
export function readiness(s) {
  const fields = fieldsFor(s);
  const entries = s.type === 'custom'
    ? s.model.variables.map((v) => [v.key, { value: v.value, source: v.source }])
    : Object.entries(s.inputs);
  const byKey = Object.fromEntries(entries);
  const missing = fields.filter((f) => f.required !== false && (byKey[f.key]?.value === null || byKey[f.key]?.value === undefined || byKey[f.key]?.value === '')).map((f) => f.key);
  const unconfirmed = entries.filter(([, x]) => x?.source === 'ai').map(([k]) => k);
  const examples = entries.filter(([, x]) => x?.source === 'example').map(([k]) => k);
  return { missing, unconfirmed, examples, ready: !missing.length && !unconfirmed.length };
}

export function runScenario(s, values) {
  const r = readiness(s);
  if (!values && r.unconfirmed.length) throw new SimError(`Confirm or edit the AI-suggested values first: ${r.unconfirmed.join(', ')}`);
  return TYPES[s.type].run(s, values);
}

export function casesFor(s) {
  if (s.type !== 'business') return null;
  return businessCases(TYPES.business.values(s), s.otherCosts, s.spread || DEFAULT_SPREAD);
}

/** Blank scenario of a type, optionally filled with labelled example values. */
export function newScenario(type, { id, name, now, withExamples = false }) {
  const base = { id, name, type, createdAt: now, updatedAt: now, notes: '', parentId: null };
  const fill = (fields, example) => Object.fromEntries(fields.map((f) => [f.key, withExamples
    ? { value: example[f.key] ?? f.default ?? null, source: 'example' }
    : { value: f.required === false ? (f.default ?? 0) : null, source: f.required === false ? 'assumption' : 'fact' }]));
  if (type === 'business') return { ...base, inputs: fill(BUSINESS_FIELDS, BUSINESS_EXAMPLE), otherCosts: [], spread: structuredClone(DEFAULT_SPREAD) };
  if (type === 'career') return { ...base, inputs: fill(CAREER_FIELDS, CAREER_EXAMPLE), milestones: withExamples ? [{ name: 'First small project', hours: 60 }, { name: 'Portfolio piece', hours: 150 }] : [], startDate: now };
  if (type === 'custom') {
    const model = withExamples ? structuredClone(CUSTOM_EXAMPLE) : { variables: [{ key: 'x', label: 'Value', value: null, unit: 'number' }], outputs: [{ key: 'result', label: 'Result', formula: 'x', unit: 'number' }] };
    model.variables.forEach((v) => { v.source = withExamples ? 'example' : 'fact'; });
    return { ...base, model };
  }
  throw new SimError('Unknown scenario type');
}

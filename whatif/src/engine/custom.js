// General what-if model: user-defined variables and formula outputs, evaluated in order.

import { parse, evaluate, identifiers, substitute, FUNCTIONS, IDENT } from './expr.js';
import { SimError, round2 } from './validate.js';

export const CUSTOM_EXAMPLE = {
  variables: [
    { key: 'income', label: 'Monthly income', value: 40000, unit: 'money' },
    { key: 'rent', label: 'Rent', value: 12000, unit: 'money' },
    { key: 'food', label: 'Food & bills', value: 9000, unit: 'money' },
    { key: 'goal', label: 'Savings goal', value: 150000, unit: 'money' },
  ],
  outputs: [
    { key: 'savings', label: 'Monthly savings', formula: 'income - rent - food', unit: 'money' },
    { key: 'months_to_goal', label: 'Months to reach goal', formula: 'ceil(goal / savings)', unit: 'months' },
  ],
};

export function validateCustomModel(model) {
  const vars = Array.isArray(model?.variables) ? model.variables : [];
  const outs = Array.isArray(model?.outputs) ? model.outputs : [];
  if (!outs.length) throw new SimError('Add at least one output formula');
  if (vars.length > 40 || outs.length > 40) throw new SimError('At most 40 variables and 40 outputs');
  const seen = new Set();
  const missing = [];
  const scopeKeys = new Set();
  for (const v of vars) {
    if (!IDENT.test(v.key || '') || FUNCTIONS[v.key]) throw new SimError(`“${v.key}” is not a valid variable name (letters, digits, _; not a function name)`);
    if (seen.has(v.key)) throw new SimError(`Duplicate name “${v.key}”`);
    seen.add(v.key);
    if (v.value === null || v.value === undefined || v.value === '') missing.push(v.key);
    else if (!Number.isFinite(Number(v.value))) throw new SimError(`${v.label || v.key} must be a number`);
    scopeKeys.add(v.key);
  }
  const compiled = outs.map((o) => {
    if (!IDENT.test(o.key || '') || FUNCTIONS[o.key]) throw new SimError(`“${o.key}” is not a valid output name`);
    if (seen.has(o.key)) throw new SimError(`Duplicate name “${o.key}”`);
    seen.add(o.key);
    const ast = parse(o.formula);
    for (const id of identifiers(ast)) {
      if (!scopeKeys.has(id)) throw new SimError(`Output “${o.label || o.key}” uses “${id}”, which is not defined above it`);
    }
    scopeKeys.add(o.key);
    return { ...o, ast };
  });
  if (missing.length) throw new SimError(`Missing inputs: ${missing.join(', ')}`, missing.map((key) => ({ key, message: 'missing' })));
  return { vars, compiled };
}

export function simulateCustom(model) {
  const { vars, compiled } = validateCustomModel(model);
  const scope = Object.fromEntries(vars.map((v) => [v.key, Number(v.value)]));
  const steps = [];
  const outputs = {};
  for (const o of compiled) {
    const shown = substitute(o.formula, scope);
    const value = evaluate(o.ast, scope);
    if (!Number.isFinite(value)) throw new SimError(`Output “${o.label || o.key}” is not a finite number`);
    scope[o.key] = value;
    outputs[o.key] = value;
    steps.push({ label: o.label || o.key, formula: o.formula, values: shown, result: round2(value) });
  }
  return {
    inputs: Object.fromEntries(vars.map((v) => [v.key, Number(v.value)])),
    summary: outputs,
    steps,
    warnings: [],
    limitations: ['Results follow exactly the formulas you wrote; the app does not check that they model reality.'],
  };
}

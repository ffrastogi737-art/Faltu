// Deterministic, template-based explanation of a calculated result. Works with no AI model,
// and doubles as the fact sheet a local model is allowed to talk about.

import { metricsFor, readiness, fieldsFor, unitFor, SOURCES } from '../engine/scenario.js';

export function factSheet(scenario, result, sens, fmt) {
  const metrics = metricsFor(scenario);
  const fields = fieldsFor(scenario);
  const label = (k) => fields.find((f) => f.key === k)?.label || k;
  const lines = [];
  lines.push(`Scenario: ${scenario.name} (${scenario.type}).`);
  lines.push('Calculated results (from the deterministic engine):');
  for (const [k, l] of Object.entries(metrics)) {
    const v = result.summary[k];
    lines.push(`- ${l}: ${v === null || v === undefined ? 'not applicable' : fmt(unitFor(scenario, k), v)}`);
  }
  if (sens?.rows?.length) {
    lines.push(`Biggest drivers when each input moves ±${sens.pct}%:`);
    for (const r of sens.rows.slice(0, 3)) lines.push(`- ${label(r.key)}: result ranges ${fmt(null, r.low)} to ${fmt(null, r.high)}`);
  }
  const r = readiness(scenario);
  if (r.examples.length) lines.push(`Inputs still using example values: ${r.examples.map(label).join(', ')}.`);
  for (const w of result.warnings) lines.push(`Warning: ${w}`);
  return lines.join('\n');
}

/** Short plain-language summary built only from computed numbers. */
export function explainResult(scenario, result, sens, fmt) {
  const s = result.summary;
  const parts = [];
  if (scenario.type === 'business') {
    parts.push(`Over ${result.inputs.months} months, total revenue comes to ${fmt('money', s.totalRevenue)} and net profit to ${fmt('money', s.totalNetProfit)}.`);
    parts.push(s.cashRunsOutMonth ? `Cash drops below zero in month ${s.cashRunsOutMonth}, so you would need more funding before then.` : `Cash stays positive throughout, ending at ${fmt('money', s.finalCash)} (lowest point ${fmt('money', s.minCash)} in month ${s.minCashMonth}).`);
    parts.push(s.breakEvenUnits === null ? 'There is no break-even point because each sale does not cover its own variable cost.' : `You need about ${Math.ceil(s.breakEvenUnits)} sales a month (${fmt('money', s.breakEvenRevenue)} revenue) to cover monthly fixed costs.`);
  } else if (scenario.type === 'career') {
    parts.push(`At ${s.effectiveWeeklyHours.toFixed(1)} effective hours a week, the remaining ${Math.round(s.remainingHours)} hours take about ${Math.ceil(s.weeksToTarget)} weeks (finishing around ${new Date(s.finishDate).toLocaleDateString()}).`);
    parts.push(`Estimated total cost: ${fmt('money', s.totalCost)}.`);
  } else {
    for (const o of scenario.model.outputs) parts.push(`${o.label || o.key} = ${fmt(o.unit, s[o.key])}.`);
  }
  if (sens?.rows?.length) {
    const fields = fieldsFor(scenario);
    const top = sens.rows[0];
    parts.push(`The result is most sensitive to ${fields.find((f) => f.key === top.key)?.label || top.key}.`);
  }
  parts.push('These numbers follow from your inputs and assumptions; they are not a prediction of what will happen.');
  return parts.join(' ');
}

export { SOURCES };

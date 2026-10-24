// Expected values are worked out by hand in the comments, not copied from the code's output.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { simulateBusiness, businessCases } from '../src/engine/business.js';
import { simulateCareer } from '../src/engine/career.js';
import { simulateCustom, CUSTOM_EXAMPLE } from '../src/engine/custom.js';
import { parse, evaluate } from '../src/engine/expr.js';
import { pctChange, validateFields } from '../src/engine/validate.js';
import { compareSummaries, sensitivity, applyChanges } from '../src/engine/analysis.js';
import { evaluateTree, validateTree } from '../src/engine/tree.js';
import { readiness, runScenario, newScenario } from '../src/engine/scenario.js';

const close = (a, b, eps = 1e-6) => assert.ok(Math.abs(a - b) <= eps, `${a} ≉ ${b}`);

// 50k cash, 15k investment, 40 units × ₹500, ₹200 variable, ₹6k fixed + ₹2k marketing
const base = { startingCash: 50000, initialInvestment: 15000, price: 500, unitsPerMonth: 40, variableCost: 200, fixedMonthly: 6000, marketingMonthly: 2000, growthPct: 0, months: 3, taxPct: 0, launchMonth: 1, paymentDelayMonths: 0 };

test('business: revenue, costs, profit and cash by hand', () => {
  const r = simulateBusiness(base);
  // revenue 40×500 = 20000; variable 40×200 = 8000; fixed 8000; profit 4000/month
  assert.deepEqual(r.months.map((m) => m.revenue), [20000, 20000, 20000]);
  assert.deepEqual(r.months.map((m) => m.operatingProfit), [4000, 4000, 4000]);
  // cash: 50000 − 15000 = 35000, then +4000 per month
  assert.deepEqual(r.months.map((m) => m.cashBalance), [39000, 43000, 47000]);
  assert.equal(r.summary.totalNetProfit, 12000);
  assert.equal(r.summary.finalCash, 47000);
  assert.equal(r.summary.paybackMonth, null); // 12000 < 15000 investment within 3 months
  close(r.summary.roiPct, -20); // (12000 − 15000) / 15000
});

test('business: break-even units and revenue', () => {
  const r = simulateBusiness(base);
  close(r.summary.breakEvenUnits, 8000 / 300); // fixed / (price − variable) = 26.667
  close(r.summary.breakEvenRevenue, (8000 / 300) * 500); // 13333.33
  const loss = simulateBusiness({ ...base, price: 200 });
  assert.equal(loss.summary.breakEvenUnits, null); // zero margin: no break-even
  assert.ok(loss.warnings.some((w) => /price ≤ variable cost/.test(w)));
});

test('business: growth compounds monthly', () => {
  const r = simulateBusiness({ ...base, growthPct: 10, months: 2 });
  close(r.months[1].units, 44); // 40 × 1.1
  close(r.months[1].operatingProfit, 44 * 300 - 8000); // 5200
});

test('business: tax only after carried-forward losses are used up', () => {
  // units 5,10,20 (doubling) × ₹100, no variable cost, ₹1000 fixed → profit −500, 0, +1000
  const r = simulateBusiness({ startingCash: 0, initialInvestment: 0, price: 100, unitsPerMonth: 5, variableCost: 0, fixedMonthly: 1000, growthPct: 100, months: 3, taxPct: 25 });
  assert.deepEqual(r.months.map((m) => m.operatingProfit), [-500, 0, 1000]);
  assert.deepEqual(r.months.map((m) => m.tax), [0, 0, 125]); // 25% of (1000 − 500 carried loss)
  assert.equal(r.summary.totalNetProfit, 375);
});

test('business: delayed customer payments shift cash, not profit', () => {
  const r = simulateBusiness({ ...base, paymentDelayMonths: 1 });
  assert.deepEqual(r.months.map((m) => m.cashIn), [0, 20000, 20000]);
  assert.deepEqual(r.months.map((m) => m.cashBalance), [19000, 23000, 27000]); // 35000 − 16000, +4000, +4000
  assert.equal(r.summary.totalNetProfit, 12000);
  assert.equal(r.summary.minCash, 19000);
  assert.equal(r.summary.minCashMonth, 1);
});

test('business: delayed launch keeps fixed costs running', () => {
  const r = simulateBusiness({ ...base, launchMonth: 2 });
  assert.deepEqual(r.months.map((m) => m.cashBalance), [27000, 31000, 35000]);
});

test('business: runway when cash runs out', () => {
  const r = simulateBusiness({ ...base, startingCash: 10000, initialInvestment: 0, unitsPerMonth: 0 });
  // −8000 per month: 2000 after month 1, −6000 after month 2
  assert.equal(r.summary.runwayMonths, 1);
  assert.equal(r.summary.cashRunsOutMonth, 2);
});

test('business: other costs (monthly and one-time)', () => {
  const r = simulateBusiness(base, [{ name: 'Software', amount: 500, frequency: 'monthly' }, { name: 'Stall fee', amount: 3000, frequency: 'once', month: 2 }]);
  assert.deepEqual(r.months.map((m) => m.fixedCosts), [8500, 11500, 8500]);
  close(r.summary.breakEvenUnits, 8500 / 300);
});

test('business: validation rejects missing and invalid inputs', () => {
  assert.throws(() => simulateBusiness({ ...base, price: null }), /Missing inputs: Price per sale/);
  assert.throws(() => simulateBusiness({ ...base, price: -1 }), /at least 0/);
  assert.throws(() => simulateBusiness({ ...base, months: 2.5 }), /whole number/);
  assert.throws(() => simulateBusiness({ ...base, unitsPerMonth: 'lots' }), /must be a number/);
  assert.throws(() => simulateBusiness({ ...base, months: 121 }), /at most 120/);
  assert.throws(() => simulateBusiness(base, [{ amount: -5, frequency: 'monthly' }]), /non-negative/);
});

test('business: deterministic and best/worst bracket the expected case', () => {
  assert.deepEqual(simulateBusiness(base), simulateBusiness(base));
  const c = businessCases(base, []);
  assert.ok(c.worst.summary.finalCash < c.expected.summary.finalCash);
  assert.ok(c.best.summary.finalCash > c.expected.summary.finalCash);
});

test('career: hours, weeks, cost and date by hand', () => {
  const start = Date.UTC(2026, 0, 1);
  const r = simulateCareer({ currentLevel: 2, targetLevel: 6, hoursToTarget: 200, hoursPerWeek: 8, consistencyPct: 80, completedHours: 0, trainingCost: 3000, monthlyCost: 500 }, [{ name: 'Project', hours: 64 }], start);
  close(r.summary.effectiveWeeklyHours, 6.4); // 8 × 80%
  close(r.summary.weeksToTarget, 31.25); // 200 / 6.4
  close(r.summary.monthsToTarget, 31.25 / (52 / 12)); // 7.21 → billed 8 months
  assert.equal(r.summary.totalCost, 7000); // 3000 + 500 × 8
  assert.equal(r.summary.finishDate, start + 219 * 86400000); // ceil(31.25 × 7) = 219 days
  assert.equal(r.milestones[0].date, start + 70 * 86400000); // 64 / 6.4 = 10 weeks
  assert.throws(() => simulateCareer({ currentLevel: 5, targetLevel: 5, hoursToTarget: 10, hoursPerWeek: 1 }, [], start), /higher than the current/);
  assert.throws(() => simulateCareer({ currentLevel: 1, targetLevel: 5, hoursToTarget: 10, hoursPerWeek: 1 }, [{ hours: 50 }], start), /Milestone/);
});

test('expressions: precedence, functions and safety', () => {
  const ev = (s, scope = {}) => evaluate(parse(s), scope);
  assert.equal(ev('2+3*4^2'), 50);
  assert.equal(ev('-2^2'), -4);
  assert.equal(ev('2^3^2'), 512);
  assert.equal(ev('(1+2)*3'), 9);
  assert.equal(ev('max(1, x, 3) + min(4,2)', { x: 7 }), 9);
  assert.equal(ev('ceil(7/2)'), 4);
  assert.throws(() => ev('1/0'), /Division by zero/);
  assert.throws(() => ev('y + 1'), /Unknown variable/);
  assert.throws(() => ev('alert(1)'), /Unknown function/);
  assert.throws(() => ev('constructor'), /Unknown variable/);
  assert.throws(() => ev('2 +'), /ends unexpectedly/);
  assert.throws(() => ev('2 ; 3'), /Unexpected character/);
  assert.throws(() => ev('max()'), /argument/);
});

test('custom model: outputs evaluate in order', () => {
  const r = simulateCustom(CUSTOM_EXAMPLE);
  assert.equal(r.summary.savings, 19000); // 40000 − 12000 − 9000
  assert.equal(r.summary.months_to_goal, 8); // ceil(150000 / 19000) = ceil(7.89)
  assert.equal(r.steps[0].values, '40000 - 12000 - 9000');
  assert.throws(() => simulateCustom({ variables: [{ key: 'a', value: 1 }], outputs: [{ key: 'b', formula: 'a + c' }] }), /not defined above/);
  assert.throws(() => simulateCustom({ variables: [{ key: 'a', value: 1 }, { key: 'a', value: 2 }], outputs: [{ key: 'b', formula: 'a' }] }), /Duplicate/);
  assert.throws(() => simulateCustom({ variables: [{ key: 'a', value: null }], outputs: [{ key: 'b', formula: 'a' }] }), /Missing inputs: a/);
  assert.throws(() => simulateCustom({ variables: [{ key: '1bad', value: 1 }], outputs: [{ key: 'b', formula: '1' }] }), /not a valid variable name/);
});

test('percentage change refuses misleading values', () => {
  close(pctChange(200, 250).value, 25);
  close(pctChange(200, 100).value, -50);
  assert.equal(pctChange(0, 10).value, null);
  assert.match(pctChange(0, 10).reason, /zero/);
  assert.equal(pctChange(-100, 50).value, null);
  assert.equal(pctChange(100, -50).value, null);
});

test('comparison rows: absolute and % differences', () => {
  const rows = compareSummaries({ finalCash: 1000, minCash: 0 }, { finalCash: 1500, minCash: -200 }, { finalCash: 'Cash', minCash: 'Min' });
  assert.equal(rows[0].diff, 500);
  close(rows[0].pct.value, 50);
  assert.equal(rows[1].diff, -200);
  assert.equal(rows[1].pct.value, null);
});

test('what-if changes apply without mutating the baseline', () => {
  const v = { budget: 1000, hours: 10 };
  const out = applyChanges(v, [{ key: 'budget', op: 'pct', amount: 20 }, { key: 'hours', op: 'mul', amount: 0.5 }]);
  assert.deepEqual(out, { budget: 1200, hours: 5 });
  assert.deepEqual(v, { budget: 1000, hours: 10 });
  assert.throws(() => applyChanges(v, [{ key: 'nope', op: 'add', amount: 1 }]), /Unknown input/);
  assert.throws(() => applyChanges(v, [{ key: 'budget', op: 'pow', amount: 1 }]), /Unknown change/);
});

test('sensitivity ranks drivers by swing', () => {
  const run = (vals) => simulateBusiness(vals).summary.totalNetProfit;
  const s = sensitivity(base, ['unitsPerMonth', 'price', 'growthPct'], run, 20);
  // price ±20%: margin 400 or 200 → (16000−8000)×3 = 24000 vs 0 → swing 24000
  // units ±20%: 48 or 32 → (14400−8000)×3 = 19200 vs (9600−8000)×3 = 4800 → swing 14400
  assert.deepEqual(s.rows.map((r) => r.key), ['price', 'unitsPerMonth']);
  close(s.rows[0].swing, 24000);
  close(s.rows[1].swing, 14400);
  assert.deepEqual(s.skipped, ['growthPct']); // zero baseline cannot be scaled by %
});

test('decision tree expected values', () => {
  const tree = {
    id: 'root', type: 'decision', label: 'Start business?', children: [
      { id: 'yes', type: 'chance', label: 'Start', children: [
        { id: 'good', type: 'outcome', label: 'Demand ok', p: 0.6, value: 100 },
        { id: 'bad', type: 'outcome', label: 'Demand weak', p: 0.4, value: -50 },
      ] },
      { id: 'no', type: 'outcome', label: 'Keep job', value: 30 },
    ],
  };
  const r = evaluateTree(tree);
  close(r.children[0].ev, 40); // 0.6×100 + 0.4×(−50)
  assert.equal(r.ev, 40);
  assert.equal(r.bestId, 'yes');
  const bad = structuredClone(tree);
  bad.children[0].children[1].p = 0.3;
  assert.throws(() => validateTree(bad), /add up to 90.0%/);
  const linked = structuredClone(tree);
  linked.children[1] = { id: 'no', type: 'outcome', label: 'Linked', link: { scenarioId: 's1', metric: 'finalCash' } };
  assert.equal(evaluateTree(linked, () => 55).bestId, 'no');
});

test('scenario readiness blocks missing values and unconfirmed AI suggestions', () => {
  const s = newScenario('business', { id: 's', name: 'x', now: 0, withExamples: true });
  assert.equal(readiness(s).ready, true);
  assert.ok(readiness(s).examples.length > 0);
  s.inputs.price = { value: 900, source: 'ai' };
  assert.deepEqual(readiness(s).unconfirmed, ['price']);
  assert.throws(() => runScenario(s), /Confirm or edit the AI-suggested values/);
  s.inputs.price.source = 'fact';
  s.inputs.unitsPerMonth.value = null;
  assert.deepEqual(readiness(s).missing, ['unitsPerMonth']);
  assert.throws(() => runScenario(s), /Missing inputs/);
});

test('field validation reports missing vs invalid separately', () => {
  const r = validateFields([{ key: 'a', label: 'A', min: 0 }, { key: 'b', label: 'B' }, { key: 'c', label: 'C', required: false, default: 3 }], { a: -1 });
  assert.deepEqual(r.missing, ['b']);
  assert.equal(r.errors[0].key, 'a');
  assert.equal(r.values.c, 3);
});

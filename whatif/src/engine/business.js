// Deterministic monthly business model. Pure functions: same inputs -> same outputs.

import { requireValid, round2, SimError } from './validate.js';

export const BUSINESS_FIELDS = [
  { key: 'startingCash', label: 'Starting cash', unit: 'money', min: 0, max: 1e12 },
  { key: 'initialInvestment', label: 'Initial investment (one-time, month 0)', unit: 'money', min: 0, max: 1e12 },
  { key: 'price', label: 'Price per sale', unit: 'money', min: 0, max: 1e9 },
  { key: 'unitsPerMonth', label: 'Sales in first selling month (units)', unit: 'count', min: 0, max: 1e9 },
  { key: 'variableCost', label: 'Variable cost per sale', unit: 'money', min: 0, max: 1e9 },
  { key: 'fixedMonthly', label: 'Fixed costs per month', unit: 'money', min: 0, max: 1e12 },
  { key: 'marketingMonthly', label: 'Marketing per month', unit: 'money', min: 0, max: 1e12, required: false },
  { key: 'growthPct', label: 'Monthly sales growth', unit: 'pct', min: -100, max: 1000, required: false },
  { key: 'months', label: 'Simulation duration', unit: 'months', min: 1, max: 120, integer: true },
  { key: 'taxPct', label: 'Tax rate on profit', unit: 'pct', min: 0, max: 100, required: false },
  { key: 'launchMonth', label: 'First month with sales', unit: 'months', min: 1, max: 120, integer: true, required: false, default: 1 },
  { key: 'paymentDelayMonths', label: 'Customer payment delay', unit: 'months', min: 0, max: 12, integer: true, required: false },
];

/** Clearly-labelled editable example values (never presented as market data). */
export const BUSINESS_EXAMPLE = {
  startingCash: 50000, initialInvestment: 15000, price: 500, unitsPerMonth: 40, variableCost: 200,
  fixedMonthly: 6000, marketingMonthly: 2000, growthPct: 5, months: 12, taxPct: 0, launchMonth: 1, paymentDelayMonths: 0,
};

function validateOtherCosts(list) {
  if (!Array.isArray(list)) return [];
  return list.map((c, i) => {
    const amount = Number(c.amount);
    const month = c.month === undefined ? 1 : Number(c.month);
    if (!Number.isFinite(amount) || amount < 0) throw new SimError(`Other cost #${i + 1} needs a non-negative amount`);
    if (!['monthly', 'once'].includes(c.frequency)) throw new SimError(`Other cost #${i + 1} needs a frequency`);
    if (c.frequency === 'once' && (!Number.isInteger(month) || month < 1)) throw new SimError(`Other cost #${i + 1} needs a month ≥ 1`);
    return { name: String(c.name || `Cost ${i + 1}`).slice(0, 60), amount, frequency: c.frequency, month };
  });
}

export function simulateBusiness(rawValues, otherCostsRaw = []) {
  const v = requireValid(BUSINESS_FIELDS, rawValues);
  const other = validateOtherCosts(otherCostsRaw);
  const g = v.growthPct / 100;
  const tax = v.taxPct / 100;
  const margin = v.price - v.variableCost;
  const monthlyOther = other.filter((c) => c.frequency === 'monthly').reduce((s, c) => s + c.amount, 0);
  const fixedTotal = v.fixedMonthly + v.marketingMonthly + monthlyOther;

  const months = [];
  let cash = v.startingCash - v.initialInvestment;
  let lossCarry = 0;
  let cumProfit = 0;
  let cumRevenue = 0;
  const revenueByMonth = [];
  for (let m = 1; m <= v.months; m++) {
    const selling = m >= v.launchMonth;
    const units = selling ? v.unitsPerMonth * Math.pow(1 + g, m - v.launchMonth) : 0;
    const revenue = units * v.price;
    const variableCosts = units * v.variableCost;
    const once = other.filter((c) => c.frequency === 'once' && c.month === m).reduce((s, c) => s + c.amount, 0);
    const fixedCosts = fixedTotal + once;
    const grossProfit = revenue - variableCosts;
    const operatingProfit = grossProfit - fixedCosts;
    // Tax only on profit that exceeds previously carried-forward losses.
    let taxable = 0;
    if (operatingProfit < 0) lossCarry += -operatingProfit;
    else { taxable = Math.max(0, operatingProfit - lossCarry); lossCarry = Math.max(0, lossCarry - operatingProfit); }
    const taxPaid = taxable * tax;
    const netProfit = operatingProfit - taxPaid;
    revenueByMonth.push(revenue);
    const cashIn = m - v.paymentDelayMonths >= 1 ? revenueByMonth[m - v.paymentDelayMonths - 1] : 0;
    const cashOut = variableCosts + fixedCosts + taxPaid;
    const netCashFlow = cashIn - cashOut;
    cash += netCashFlow;
    cumProfit += netProfit;
    cumRevenue += revenue;
    months.push({
      month: m, units, revenue, variableCosts, fixedCosts, grossProfit, operatingProfit, tax: taxPaid, netProfit,
      cashIn, cashOut, netCashFlow, cashBalance: cash, cumulativeProfit: cumProfit,
    });
  }

  const breakEvenUnits = margin > 0 ? fixedTotal / margin : null;
  const firstNegative = months.find((r) => r.cashBalance < 0);
  const minCash = months.reduce((a, r) => (r.cashBalance < a.cashBalance ? r : a), months[0]);
  const payback = months.find((r) => r.cumulativeProfit - v.initialInvestment >= 0);
  const totals = (k) => months.reduce((s, r) => s + r[k], 0);
  const summary = {
    totalRevenue: cumRevenue,
    totalVariableCosts: totals('variableCosts'),
    totalFixedCosts: totals('fixedCosts'),
    totalTax: totals('tax'),
    totalOperatingProfit: totals('operatingProfit'),
    totalNetProfit: cumProfit,
    finalCash: cash,
    cashAfterInvestment: v.startingCash - v.initialInvestment,
    contributionMargin: margin,
    breakEvenUnits,
    breakEvenRevenue: breakEvenUnits === null ? null : breakEvenUnits * v.price,
    runwayMonths: firstNegative ? firstNegative.month - 1 : null, // null = cash never negative within horizon
    cashRunsOutMonth: firstNegative ? firstNegative.month : null,
    minCash: minCash.cashBalance,
    minCashMonth: minCash.month,
    paybackMonth: payback ? payback.month : null,
    roiPct: v.initialInvestment > 0 ? ((cumProfit - v.initialInvestment) / v.initialInvestment) * 100 : null,
  };

  const warnings = [];
  if (margin <= 0) warnings.push('Each sale costs at least as much as it earns (price ≤ variable cost), so selling more increases losses.');
  if (v.initialInvestment > v.startingCash) warnings.push('The initial investment is larger than starting cash: the balance is negative before the first month.');
  if (firstNegative) warnings.push(`Cash falls below zero in month ${firstNegative.month}. You would need extra funding before then.`);

  const steps = [
    { label: 'Cash after initial investment', formula: 'starting cash − initial investment', values: `${v.startingCash} − ${v.initialInvestment}`, result: round2(v.startingCash - v.initialInvestment) },
    { label: 'Units in month m', formula: 'units₁ × (1 + growth)^(m − launch month), 0 before launch', values: `${v.unitsPerMonth} × (1 + ${v.growthPct}%)^(m − ${v.launchMonth})`, result: null },
    { label: 'Revenue', formula: 'units × price', values: `units × ${v.price}`, result: round2(summary.totalRevenue) },
    { label: 'Contribution margin per sale', formula: 'price − variable cost', values: `${v.price} − ${v.variableCost}`, result: round2(margin) },
    { label: 'Fixed costs per month', formula: 'fixed + marketing + other monthly costs', values: `${v.fixedMonthly} + ${v.marketingMonthly} + ${monthlyOther}`, result: round2(fixedTotal) },
    { label: 'Operating profit', formula: 'revenue − variable costs − fixed costs', values: 'per month, summed', result: round2(summary.totalOperatingProfit) },
    { label: 'Tax', formula: 'tax rate × (profit − losses carried forward), never negative', values: `${v.taxPct}%`, result: round2(summary.totalTax) },
    { label: 'Cash in', formula: `revenue received ${v.paymentDelayMonths} month(s) after the sale`, values: '', result: null },
    { label: 'Cash balance', formula: 'previous balance + cash in − (variable + fixed costs + tax)', values: '', result: round2(cash) },
    { label: 'Break-even sales per month', formula: 'monthly fixed costs ÷ contribution margin', values: margin > 0 ? `${round2(fixedTotal)} ÷ ${round2(margin)}` : 'margin ≤ 0: no break-even', result: breakEvenUnits === null ? null : round2(breakEvenUnits) },
    { label: 'Break-even revenue per month', formula: 'break-even units × price', values: '', result: summary.breakEvenRevenue === null ? null : round2(summary.breakEvenRevenue) },
  ];

  return {
    inputs: v, otherCosts: other, months, summary, steps, warnings,
    limitations: [
      'Sales volume, growth and costs are your assumptions, not market data or a forecast.',
      'Accounting profit excludes the initial investment; cash includes it.',
      'Costs are paid in the month incurred; only customer payments can be delayed.',
      'Tax is a flat rate on profit after carried-forward losses. Real tax rules are more complex.',
      'No inflation, financing costs, inventory build-up or seasonality are modelled.',
    ],
  };
}

export const BUSINESS_METRICS = {
  finalCash: 'Cash at end',
  totalNetProfit: 'Net profit (total)',
  totalRevenue: 'Revenue (total)',
  minCash: 'Lowest cash balance',
  breakEvenUnits: 'Break-even units / month',
};

/** Best / expected / worst cases from user-editable spread assumptions (percent changes). */
export const DEFAULT_SPREAD = {
  best: { unitsPerMonth: 20, price: 0, variableCost: -5, fixedMonthly: 0, growthPct: 2 },
  worst: { unitsPerMonth: -30, price: 0, variableCost: 10, fixedMonthly: 10, growthPct: -3 },
};

export function applySpread(values, spread) {
  const out = { ...values };
  for (const [k, pct] of Object.entries(spread)) {
    if (out[k] === null || out[k] === undefined) continue;
    // growthPct shifts by percentage points; everything else scales by percent.
    out[k] = k === 'growthPct' ? Number(out[k]) + pct : Number(out[k]) * (1 + pct / 100);
  }
  return out;
}

export function businessCases(values, otherCosts, spread = DEFAULT_SPREAD) {
  return {
    worst: simulateBusiness(applySpread(values, spread.worst), otherCosts),
    expected: simulateBusiness(values, otherCosts),
    best: simulateBusiness(applySpread(values, spread.best), otherCosts),
  };
}

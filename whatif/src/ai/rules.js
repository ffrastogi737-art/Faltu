// Rule-based interpreter: the always-available fallback when no local model is loaded.
// It only extracts numbers the user actually wrote; everything else stays null.

const SCALE = { k: 1e3, thousand: 1e3, lakh: 1e5, lakhs: 1e5, lac: 1e5, lacs: 1e5, l: 1e5, crore: 1e7, crores: 1e7, cr: 1e7, m: 1e6, mn: 1e6, million: 1e6 };
const CURRENCY = [[/₹|\brs\.?|\binr\b|rupees?/i, 'INR'], [/\$|\busd\b|dollars?/i, 'USD'], [/€|\beur\b|euros?/i, 'EUR'], [/£|\bgbp\b|pounds?/i, 'GBP']];

// number with optional thousands separators/decimals and an optional scale word
const NUM = /(?:₹|rs\.?\s*|inr\s*|\$|€|£)?\s*(\d{1,3}(?:,\d{2,3})+|\d+(?:\.\d+)?)\s*(k|thousand|lakhs?|lacs?|l|crores?|cr|mn|m|million)?\b/gi;

export function parseAmount(text) {
  const m = new RegExp(NUM.source, 'i').exec(text);
  if (!m) return null;
  return Number(m[1].replace(/,/g, '')) * (m[2] ? SCALE[m[2].toLowerCase()] : 1);
}

/** All numbers with the text right before them (where the meaning usually is). */
export function numbersWithContext(text) {
  const out = [];
  const re = new RegExp(NUM.source, 'gi');
  let m;
  while ((m = re.exec(text))) {
    const before = text.slice(Math.max(0, m.index - 48), m.index).toLowerCase();
    const after = text.slice(m.index + m[0].length, m.index + m[0].length + 32).toLowerCase();
    const value = Number(m[1].replace(/,/g, '')) * (m[2] ? SCALE[m[2].toLowerCase()] : 1);
    out.push({ value, before, after, raw: m[0].trim(), money: /₹|rs|inr|\$|€|£/i.test(m[0]) || /rupee|dollar|budget|cost|price|rent|salary|investment|cash/.test(before.slice(-24)) });
  }
  return out;
}

const has = (s, re) => re.test(s);

export function detectType(text) {
  const t = text.toLowerCase();
  if (has(t, /\b(learn|learning|course|skill|career|job|study|studying|certification|bootcamp|become a|switch to)\b/)) return 'career';
  if (has(t, /\b(business|start ?up|shop|store|sell|selling|product|customers?|cafe|restaurant|online business|brand|orders?)\b/)) return 'business';
  return 'custom';
}

function durationMonths(t) {
  const m = /(\d+(?:\.\d+)?)\s*(months?|mos?|years?|yrs?)\b/i.exec(t);
  if (!m) return null;
  const n = Number(m[1]) * (/^y/i.test(m[2]) ? 12 : 1);
  return Number.isInteger(n) && n >= 1 && n <= 120 ? n : null;
}

/** Returns a raw draft object (to be passed through validateDraft). */
export function interpretRules(text) {
  const t = String(text || '').slice(0, 2000);
  const type = detectType(t);
  const currency = CURRENCY.find(([re]) => re.test(t))?.[1] ?? null;
  const values = {};
  const assumptions = [];
  const nums = numbersWithContext(t);
  const used = new Set();
  const take = (pred) => {
    const i = nums.findIndex((n, idx) => !used.has(idx) && pred(n));
    if (i < 0) return null;
    used.add(i);
    return nums[i].value;
  };
  const pctAfter = (n) => /^\s*(%|percent)/.test(n.after);

  if (type === 'business') {
    values.growthPct = take((n) => pctAfter(n) && /grow|increase|growth/.test(n.before + n.after));
    values.taxPct = take((n) => pctAfter(n) && /tax|gst/.test(n.before + n.after));
    values.months = durationMonths(t);
    if (values.months !== null) { const i = nums.findIndex((n) => /^\s*(months?|years?|yrs?|mos?)\b/.test(n.after)); if (i >= 0) used.add(i); }
    values.price = take((n) => /(price|sell(?:ing)? (?:it |them |each )?(?:at|for)|charge|per (?:item|unit|piece|sale|order))/.test(n.before.slice(-30)) || /^\s*(each|per (item|unit|piece|sale|order))/.test(n.after));
    values.variableCost = take((n) => /(cost(s)? (?:me |to make |per)|making cost|material|per unit cost|variable)/.test(n.before.slice(-30)));
    values.marketingMonthly = take((n) => /(marketing|ads?|advertis)/.test(n.before.slice(-30)));
    values.fixedMonthly = take((n) => /(rent|salary|salaries|fixed|expenses|overheads?|bills)/.test(n.before.slice(-30)) && !/^\s*(once|one[- ]time)/.test(n.after));
    values.initialInvestment = take((n) => /(invest|equipment|setup|set up|one[- ]time|upfront|spend)/.test(n.before.slice(-30)));
    values.unitsPerMonth = take((n) => /^\s*(customers?|sales|orders|units|items|pieces|clients)\b/.test(n.after));
    values.startingCash = take((n) => n.money || /(have|saved|savings|capital|budget)/.test(n.before.slice(-20)));
    if (values.startingCash !== null && values.initialInvestment === null) assumptions.push('Treated the first amount as cash you have available, not as money already spent.');
  } else if (type === 'career') {
    values.hoursPerWeek = take((n) => /^\s*(hours?|hrs?|h)\s*(a|per|each|\/)\s*(week|wk)/.test(n.after));
    values.hoursToTarget = take((n) => /^\s*(hours?|hrs?)\b/.test(n.after));
    values.trainingCost = take((n) => (n.money || /course|bootcamp|fee/.test(n.before)) && !/(month|monthly)/.test(n.after.slice(0, 12)));
    values.monthlyCost = take((n) => n.money && /^\s*(a|per|\/)\s*month|monthly/.test(n.after));
  }
  for (const k of Object.keys(values)) if (values[k] === null) delete values[k];
  const title = t.replace(/\s+/g, ' ').trim().replace(/^what if\s+/i, 'What if ').slice(0, 70) || 'New scenario';
  return { scenario_type: type, title, currency, values, assumptions };
}

/** Plain-language suggestions for experiments, derived from a sensitivity ranking. */
export function suggestExperiments(sens, labels) {
  return (sens?.rows || []).slice(0, 3).map((r) => ({
    key: r.key,
    text: `What if ${labels[r.key] || r.key} changes by ±${sens.pct}%? It moves the result between ${Math.round(r.low).toLocaleString()} and ${Math.round(r.high).toLocaleString()}.`,
  }));
}

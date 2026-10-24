import { html } from '../html.js';
import { icon, notice, fmtValue, money, num, date, kpi, SOURCE_SHORT, SOURCE_STYLE, TYPE_ICON, lineChart, barChart, tornado, histogram, closeBtn } from './common.js';
import { TYPES, fieldsFor, metricsFor, readiness, runScenario, casesFor, sensitivityKeysFor, SOURCES, unitFor } from '../../engine/scenario.js';
import { sensitivity } from '../../engine/analysis.js';
import { explainResult } from '../../ai/explain.js';
import { suggestExperiments } from '../../ai/rules.js';
import { CHANGE_OPS } from '../../engine/analysis.js';

const UNIT_HINT = { money: '', pct: '%', months: 'months', hours: 'h', count: 'units', level: '/10' };

function sourceSelect(key, source) {
  return html`<select class="src ${SOURCE_STYLE[source]}" data-src="${key}" aria-label="Where this value comes from">
    ${Object.entries(SOURCES).map(([k, l]) => html`<option value="${k}" ${k === source ? html`selected` : ''} ${k === 'ai' && source !== 'ai' ? html`disabled` : ''}>${l}</option>`)}
  </select>`;
}

function inputRow(f, entry, error) {
  const v = entry?.value;
  return html`<div class="field ${error ? 'has-err' : ''} ${entry?.source === 'ai' ? 'is-ai' : ''}" data-row="${f.key}">
    <label for="in-${f.key}">${f.label}${f.required === false ? html` <i>optional</i>` : ''}</label>
    <div class="field-row">
      <div class="num-in"><input id="in-${f.key}" type="number" inputmode="decimal" step="any" data-field="${f.key}" value="${v ?? ''}" placeholder="${f.required === false ? `default ${f.default ?? 0}` : 'required'}">${UNIT_HINT[f.unit] ? html`<span>${UNIT_HINT[f.unit]}</span>` : ''}</div>
      ${sourceSelect(f.key, entry?.source || 'fact')}
      ${entry?.source === 'ai' ? html`<button class="btn sm" data-action="confirm-input" data-key="${f.key}">${icon('check', 14)} Confirm</button>` : ''}
    </div>
    <div class="field-err" data-err-for="${f.key}">${error || ''}</div>
  </div>`;
}

// ---------- editor ----------

export function editor(state, s, ui) {
  const r = readiness(s);
  const fields = fieldsFor(s);
  return html`
    <div class="page-head">
      <div><div class="kicker">${icon(TYPE_ICON[s.type], 14)} ${TYPES[s.type].label} simulator</div><h1>${s.name}</h1></div>
      <div class="row">
        <button class="iconbtn" data-action="rename" data-id="${s.id}" aria-label="Rename">${icon('edit')}</button>
        <button class="iconbtn" data-action="duplicate" data-id="${s.id}" aria-label="Duplicate">${icon('copy')}</button>
        <button class="iconbtn" data-action="delete-scenario" data-id="${s.id}" aria-label="Delete">${icon('trash')}</button>
      </div>
    </div>
    <div id="readiness">${readinessBlock(s, r)}</div>
    <div id="live">${liveSummary(s)}</div>

    <section class="card">
      <h2 class="h2">${s.type === 'custom' ? 'Variables' : 'Inputs'}</h2>
      <p class="small muted">Mark each value as your <b>fact</b> or your <b>assumption</b>. Example values are placeholders; replace them with your own numbers.</p>
      ${s.type === 'custom' ? customEditor(s) : fields.map((f) => inputRow(f, s.inputs[f.key]))}
    </section>
    ${s.type === 'business' ? businessExtras(s) : ''}
    ${s.type === 'career' ? careerExtras(s) : ''}
    <section class="card">
      <h2 class="h2">Notes</h2>
      <textarea class="f-input" data-notes rows="3" maxlength="2000" placeholder="Context, sources for your numbers, open questions…">${s.notes}</textarea>
    </section>
    <div class="sticky-cta"><a class="btn primary block lg" href="#/r/${s.id}">${icon('play')} See full results</a></div>`;
}

export function readinessBlock(s, r = readiness(s)) {
  const label = (k) => fieldsFor(s).find((f) => f.key === k)?.label || k;
  return html`
    ${r.unconfirmed.length ? html`<div class="notice ai">${icon('sparkle', 16)}<div><b>${r.unconfirmed.length} AI-suggested value(s) need your confirmation:</b> ${r.unconfirmed.map(label).join(', ')}. <button class="btn sm" data-action="confirm-all" data-id="${s.id}">Confirm all as my assumptions</button></div></div>` : ''}
    ${r.missing.length ? notice('warn', `Missing: ${r.missing.map(label).join(', ')}. Enter a value, or use a labelled example.`) : ''}
    ${r.missing.length && s.type !== 'custom' ? html`<button class="btn sm ghost" data-action="fill-examples" data-id="${s.id}">Fill missing with example values</button>` : ''}
    ${r.examples.length ? notice('info', `${r.examples.length} input(s) still use example values. Results based on them are illustrations only.`) : ''}`;
}

export function liveSummary(s) {
  const r = readiness(s);
  if (!r.ready) return '';
  try {
    const res = runScenario(s);
    const m = metricsFor(s);
    return html`<div class="kpis">${Object.entries(m).slice(0, 4).map(([k, l]) => kpi(l, fmtValue(unitFor(s, k), res.summary[k]), '', typeof res.summary[k] === 'number' && res.summary[k] < 0 ? 'neg' : ''))}</div>`;
  } catch (e) {
    return notice('warn', e.message);
  }
}

function businessExtras(s) {
  return html`
    <section class="card">
      <h2 class="h2">Other costs</h2>
      ${s.otherCosts.length ? s.otherCosts.map((c, i) => html`<div class="list-row">
        <input class="f-input" data-oc="${i}" data-ock="name" value="${c.name}" maxlength="60" aria-label="Cost name">
        <input class="f-input w-num" type="number" step="any" data-oc="${i}" data-ock="amount" value="${c.amount}" aria-label="Amount">
        <select class="f-input w-sel" data-oc="${i}" data-ock="frequency"><option value="monthly" ${c.frequency === 'monthly' ? html`selected` : ''}>monthly</option><option value="once" ${c.frequency === 'once' ? html`selected` : ''}>one-time</option></select>
        ${c.frequency === 'once' ? html`<input class="f-input w-xs" type="number" min="1" data-oc="${i}" data-ock="month" value="${c.month}" aria-label="Month">` : ''}
        <button class="iconbtn" data-action="del-oc" data-i="${i}" aria-label="Remove cost">${icon('x')}</button></div>`) : html`<p class="small muted">None. Add licences, software, rent deposits…</p>`}
      <button class="btn sm" data-action="add-oc">${icon('plus', 14)} Add cost</button>
    </section>
    <section class="card">
      <h2 class="h2">Best / worst case spread</h2>
      <p class="small muted">Your own assumptions for how much better or worse things could go (% change; growth in percentage points). These are not probabilities.</p>
      <table class="table compact"><thead><tr><th>Input</th><th>Worst</th><th>Best</th></tr></thead><tbody>
        ${['unitsPerMonth', 'price', 'variableCost', 'fixedMonthly', 'growthPct'].map((k) => html`<tr><td>${fieldsFor(s).find((f) => f.key === k).label}</td>
          ${['worst', 'best'].map((c) => html`<td><input class="f-input w-num" type="number" step="any" data-spread="${c}" data-sk="${k}" value="${s.spread[c][k]}"></td>`)}</tr>`)}
      </tbody></table>
    </section>`;
}

function careerExtras(s) {
  const toDate = (t) => new Date(t).toISOString().slice(0, 10);
  return html`
    <section class="card">
      <h2 class="h2">Plan</h2>
      <label class="f">Start date<input class="f-input" type="date" data-start value="${toDate(s.startDate)}"></label>
      <div class="row wrap"><input class="f-input w-num" type="number" min="0.25" step="0.25" id="log-hours" placeholder="hours" aria-label="Hours studied"><button class="btn sm" data-action="log-hours">${icon('plus', 14)} Log study hours</button></div>
      ${(s.log || []).length ? html`<details class="details"><summary>${s.log.length} logged session(s)</summary>${s.log.slice().reverse().map((l) => html`<div class="list-row"><span class="grow">${date(l.at)}</span><b>${num(l.hours)} h</b></div>`)}</details>` : ''}
    </section>
    <section class="card">
      <h2 class="h2">Milestones</h2>
      ${s.milestones.map((m, i) => html`<div class="list-row">
        <input class="f-input" data-ms="${i}" data-msk="name" value="${m.name}" maxlength="60" aria-label="Milestone">
        <input class="f-input w-num" type="number" min="1" data-ms="${i}" data-msk="hours" value="${m.hours}" aria-label="At hours"><span class="small muted">h</span>
        <button class="iconbtn" data-action="del-ms" data-i="${i}" aria-label="Remove milestone">${icon('x')}</button></div>`)}
      <button class="btn sm" data-action="add-ms">${icon('plus', 14)} Add milestone</button>
    </section>`;
}

function customEditor(s) {
  return html`
    ${s.model.variables.map((v, i) => html`<div class="field ${v.source === 'ai' ? 'is-ai' : ''}">
      <div class="list-row">
        <input class="f-input w-key mono" data-var="${i}" data-vk="key" value="${v.key}" aria-label="Variable name" maxlength="40">
        <input class="f-input" data-var="${i}" data-vk="label" value="${v.label}" aria-label="Label" maxlength="60">
        <button class="iconbtn" data-action="del-var" data-i="${i}" aria-label="Remove variable">${icon('x')}</button>
      </div>
      <div class="field-row"><div class="num-in"><input type="number" step="any" data-var="${i}" data-vk="value" value="${v.value ?? ''}" placeholder="required" aria-label="Value of ${v.key}"></div>
        <select class="f-input w-sel" data-var="${i}" data-vk="unit"><option value="number" ${v.unit === 'number' ? html`selected` : ''}>number</option><option value="money" ${v.unit === 'money' ? html`selected` : ''}>money</option><option value="pct" ${v.unit === 'pct' ? html`selected` : ''}>%</option><option value="months" ${v.unit === 'months' ? html`selected` : ''}>months</option><option value="hours" ${v.unit === 'hours' ? html`selected` : ''}>hours</option></select>
        ${sourceSelect(`var:${i}`, v.source || 'fact')}</div></div>`)}
    <button class="btn sm" data-action="add-var">${icon('plus', 14)} Add variable</button>
    <h2 class="h2" style="margin-top:18px">Outputs (formulas)</h2>
    <p class="small muted">Use + − × ÷ (* /), ^, brackets and min, max, abs, round, floor, ceil, sqrt, pow. Formulas can use variables and outputs above them.</p>
    ${s.model.outputs.map((o, i) => html`<div class="field"><div class="list-row">
        <input class="f-input w-key mono" data-out="${i}" data-ok="key" value="${o.key}" aria-label="Output name" maxlength="40">
        <input class="f-input" data-out="${i}" data-ok="label" value="${o.label}" aria-label="Label" maxlength="60">
        <select class="f-input w-sel" data-out="${i}" data-ok="unit"><option value="number" ${o.unit === 'number' ? html`selected` : ''}>number</option><option value="money" ${o.unit === 'money' ? html`selected` : ''}>money</option><option value="pct" ${o.unit === 'pct' ? html`selected` : ''}>%</option><option value="months" ${o.unit === 'months' ? html`selected` : ''}>months</option></select>
        <button class="iconbtn" data-action="del-out" data-i="${i}" aria-label="Remove output">${icon('x')}</button></div>
      <input class="f-input mono" data-out="${i}" data-ok="formula" value="${o.formula}" aria-label="Formula for ${o.key}" maxlength="500"></div>`)}
    <div class="row wrap"><button class="btn sm" data-action="add-out">${icon('plus', 14)} Add output</button><button class="btn sm ghost" data-action="save-template">${icon('file', 14)} Save as template</button></div>`;
}

// ---------- results ----------

const pctNote = 'This shows how often an outcome happened in simulated trials built from your own ranges. It is not the real-world probability of that outcome.';

export function results(state, s, ui) {
  const r = readiness(s);
  const head = html`<div class="page-head"><div><div class="kicker">${icon(TYPE_ICON[s.type], 14)} Scenario results</div><h1>${s.name}</h1></div>
    <div class="row"><a class="btn sm" href="#/s/${s.id}">${icon('edit', 14)} Inputs</a></div></div>`;
  if (!r.ready) return html`${head}${readinessBlock(s, r)}<a class="btn primary" href="#/s/${s.id}">Complete the inputs</a>`;
  let res;
  try { res = runScenario(s); } catch (e) { return html`${head}${notice('warn', e.message)}<a class="btn primary" href="#/s/${s.id}">Fix inputs</a>`; }
  const metrics = metricsFor(s);
  const fields = fieldsFor(s);
  const label = (k) => fields.find((f) => f.key === k)?.label || k;
  const headKey = Object.keys(metrics)[0];
  const sens = safeSensitivity(s, headKey);
  const fmtFor = (k) => (v) => fmtValue(unitFor(s, k), v);
  const fmt = (unit, v) => fmtValue(unit ?? unitFor(s, headKey), v);
  return html`
    ${head}
    <div class="kpis">${Object.entries(metrics).map(([k, l]) => kpi(l, fmtValue(unitFor(s, k), res.summary[k]), '', typeof res.summary[k] === 'number' && res.summary[k] < 0 ? 'neg' : ''))}</div>
    ${res.warnings.map((w) => notice('warn', w))}

    ${s.type === 'business' ? businessResults(s, res) : ''}
    ${s.type === 'career' ? careerResults(s, res) : ''}

    <section class="card">
      <h2 class="h2">What this means</h2>
      <p>${explainResult(s, res, sens, fmt)}</p>
      <div class="ai-box">
        ${ui.explain.busy ? html`<button class="btn danger sm" data-action="cancel-ai">${icon('stop', 14)} Stop</button>`
          : ui.ai.ready ? html`<button class="btn sm" data-action="ai-explain" data-id="${s.id}">${icon('sparkle', 14)} Explain with local AI</button>`
            : html`<p class="small muted">${icon('info', 13)} Local AI is not loaded, so the explanation above is generated from fixed rules. <a href="#/models">Set up a model</a> (optional).</p>`}
        ${ui.explain.error ? notice('warn', ui.explain.error) : ''}
        ${ui.explain.id === s.id && (ui.explain.text || ui.explain.busy) ? html`<div class="ai-out"><div class="kicker">${icon('sparkle', 13)} AI-generated explanation · ${ui.explain.model}</div><p>${ui.explain.text}</p><small class="muted">Written by a local language model from the calculated numbers above. The calculated numbers are authoritative; the wording may be imperfect.</small></div>` : ''}
      </div>
    </section>

    ${sens.rows.length ? html`<section class="card">
      <h2 class="h2">Sensitivity: what moves “${metrics[headKey]}” most</h2>
      <p class="small muted">Each input changed ±${sens.pct}% on its own, everything else fixed.</p>
      ${tornado(sens.rows.map((x) => ({ ...x, label: label(x.key) })), sens.base, fmtFor(headKey))}
      ${sens.skipped.length ? html`<p class="small faint">Not varied (zero or not applicable): ${sens.skipped.map(label).join(', ')}</p>` : ''}
      <h3 class="h3">Suggested experiments</h3>
      ${suggestExperiments(sens, Object.fromEntries(fields.map((f) => [f.key, f.label]))).map((x) => html`<div class="list-row"><span class="grow small">${x.text}</span><button class="btn sm" data-action="lab-try" data-id="${s.id}" data-key="${x.key}">Try in Lab</button></div>`)}
    </section>` : ''}

    <section class="card">
      <h2 class="h2">How it was calculated</h2>
      ${res.steps.map((st) => html`<details class="step"><summary><span>${st.label}</span><b class="mono">${st.result === null ? '' : fmtValue(st.unit, st.result)}</b></summary>
        <div class="step-body"><div><span class="faint">Formula</span> <code>${st.formula}</code></div>${st.values ? html`<div><span class="faint">With your numbers</span> <code>${st.values}</code></div>` : ''}</div></details>`)}
    </section>

    ${provenance(s, fields)}

    <section class="card">
      <h2 class="h2">Limitations</h2>
      <ul class="small">${res.limitations.map((l) => html`<li>${l}</li>`)}</ul>
    </section>

    ${s.type !== 'career' ? monteCarloPanel(s, ui, fields, metrics) : ''}

    <div class="row wrap actions-bar">
      <button class="btn" data-action="save-run" data-id="${s.id}">${icon('history', 16)} Save snapshot</button>
      <button class="btn" data-action="report" data-id="${s.id}">${icon('download', 16)} Export report</button>
      <button class="btn" data-action="lab-open" data-id="${s.id}">${icon('flask', 16)} Open in Lab</button>
      <a class="btn" href="#/s/${s.id}">${icon('edit', 16)} Change inputs</a>
    </div>`;
}

function safeSensitivity(s, metric) {
  try {
    return sensitivity(TYPES[s.type].values(s), sensitivityKeysFor(s), (vals) => {
      const v = runScenario(s, vals).summary[metric];
      if (!Number.isFinite(v)) throw new Error('n/a');
      return v;
    }, 20);
  } catch { return { rows: [], skipped: [], pct: 20, base: 0 }; }
}

function provenance(s, fields) {
  const entries = s.type === 'custom' ? s.model.variables.map((v) => [v.key, { value: v.value, source: v.source || 'fact' }]) : Object.entries(s.inputs);
  const groups = { fact: [], assumption: [], example: [], ai: [] };
  for (const [k, e] of entries) groups[e.source || 'fact'].push([k, e]);
  const unit = (k) => unitFor(s, k);
  return html`<section class="card">
    <h2 class="h2">What went into this</h2>
    <div class="prov">${Object.entries(groups).filter(([, g]) => g.length).map(([src, g]) => html`<div class="prov-col">
      <span class="tag ${SOURCE_STYLE[src]}">${SOURCES[src]}</span>
      ${g.map(([k, e]) => html`<div class="prov-item"><span>${fields.find((f) => f.key === k)?.label || k}</span><b class="mono">${fmtValue(unit(k), e.value)}</b></div>`)}</div>`)}
    </div>
    <p class="small faint">Everything in the results above is a <b>calculated output</b> of these inputs.</p>
  </section>`;
}

function businessResults(s, res) {
  const labels = res.months.map((m) => `M${m.month}`);
  const cases = casesFor(s);
  return html`
    <section class="card">
      ${lineChart([
        { name: 'Cash balance', color: '#38e1c4', values: res.months.map((m) => m.cashBalance) },
        { name: 'Cumulative profit', color: '#8b7bff', values: res.months.map((m) => m.cumulativeProfit), dash: true },
      ], labels, { title: 'Cash vs accounting profit', format: (v) => money(v, { compact: true }) })}
      ${barChart(res.months.map((m) => m.netCashFlow), labels, { title: 'Net cash flow per month', format: (v) => money(v, { compact: true }) })}
      <p class="small muted">Revenue is what customers pay; profit is revenue minus costs; cash is what is actually in the bank (it includes the initial investment and payment delays).</p>
    </section>
    <section class="card">
      <h2 class="h2">Worst · expected · best</h2>
      <div class="cases">${['worst', 'expected', 'best'].map((c) => html`<div class="case c-${c}"><span>${c}</span>
        <b class="${cases[c].summary.finalCash < 0 ? 'neg' : ''}">${money(cases[c].summary.finalCash)}</b><small>cash at end</small>
        <div class="small">${money(cases[c].summary.totalNetProfit)} profit</div>
        <div class="small faint">${cases[c].summary.cashRunsOutMonth ? `cash < 0 in month ${cases[c].summary.cashRunsOutMonth}` : 'cash stays ≥ 0'}</div></div>`)}</div>
      <p class="small faint">Built from your spread assumptions on the Inputs screen. The real outcome can fall outside this range.</p>
    </section>
    <section class="card">
      <details><summary class="h2">Monthly projection table</summary>
      <div class="table-wrap"><table class="table compact mono">
        <thead><tr><th>M</th><th>Units</th><th>Revenue</th><th>Var. costs</th><th>Fixed</th><th>Profit</th><th>Tax</th><th>Cash in</th><th>Cash</th></tr></thead>
        <tbody>${res.months.map((m) => html`<tr><td>${m.month}</td><td>${num(m.units, 1)}</td><td>${money(m.revenue)}</td><td>${money(m.variableCosts)}</td><td>${money(m.fixedCosts)}</td><td class="${m.netProfit < 0 ? 'neg' : ''}">${money(m.netProfit)}</td><td>${money(m.tax)}</td><td>${money(m.cashIn)}</td><td class="${m.cashBalance < 0 ? 'neg' : ''}">${money(m.cashBalance)}</td></tr>`)}</tbody>
      </table></div></details>
    </section>`;
}

function careerResults(s, res) {
  const values = TYPES.career.values(s);
  const alts = [3, 5, 8, 10, 15].map((h) => {
    try { const r = runScenario(s, { ...values, hoursPerWeek: h }); return { h, weeks: r.summary.weeksToTarget, cost: r.summary.totalCost, finish: r.summary.finishDate }; } catch { return null; }
  }).filter(Boolean);
  const weeksSinceStart = Math.max(0, (Date.now() - s.startDate) / (7 * 86400000));
  const plannedSoFar = Math.min(res.inputs.hoursToTarget, weeksSinceStart * res.inputs.hoursPerWeek);
  return html`
    <section class="card">
      ${res.timeline.length ? lineChart([{ name: 'Cumulative hours', color: '#38e1c4', values: res.timeline.map((t) => t.hours) }], res.timeline.map((t) => `W${t.week}`), { title: 'Projected hours over time', format: (v) => `${num(v, 0)} h` }) : notice('info', 'Target already reached with the hours completed.')}
      <div class="kpis">${kpi('Finish around', date(res.summary.finishDate))}${kpi('Progress', `${num(res.summary.progressPct, 0)}%`)}${kpi('Planned so far', `${num(plannedSoFar, 0)} h`, 'since start date')}${kpi('Completed', `${num(res.inputs.completedHours, 1)} h`)}</div>
      ${res.milestones.length ? html`<h3 class="h3">Milestones</h3>${res.milestones.map((m) => html`<div class="list-row"><span class="grow">${m.done ? '✓ ' : ''}${m.name}</span><span class="small muted">${num(m.hours, 0)} h</span><b class="small">${m.done ? 'done' : date(m.date)}</b></div>`)}` : ''}
    </section>
    <section class="card">
      <h2 class="h2">Alternative time commitments</h2>
      <table class="table compact"><thead><tr><th>Hours / week</th><th>Weeks</th><th>Finish</th><th>Total cost</th></tr></thead>
      <tbody>${alts.map((a) => html`<tr class="${a.h === res.inputs.hoursPerWeek ? 'hl' : ''}"><td>${a.h}</td><td>${num(a.weeks, 1)}</td><td>${date(a.finish)}</td><td>${money(a.cost)}</td></tr>`)}</tbody></table>
      <p class="small faint">Uses the same consistency (${res.inputs.consistencyPct}%) and total-hours estimate. Learning time is not a guarantee of a job, salary or skill level.</p>
    </section>`;
}

function monteCarloPanel(s, ui, fields, metrics) {
  const mc = s.mc || { metric: Object.keys(metrics)[0], trials: 2000, seed: 12345, threshold: 0, dists: {} };
  const out = ui.mc.id === s.id ? ui.mc : null;
  const fmt = (v) => fmtValue(unitFor(s, mc.metric), v);
  return html`<section class="card">
    <h2 class="h2">${icon('dice')} Uncertainty (Monte Carlo)</h2>
    <p class="small muted">Optional. Give some inputs a range instead of one number; the app runs many trials with a repeatable random seed.</p>
    <form data-form="mc">
      <div class="grid2">
        <label class="f">Result to study<select class="f-input" name="metric">${Object.entries(metrics).map(([k, l]) => html`<option value="${k}" ${mc.metric === k ? html`selected` : ''}>${l}</option>`)}</select></label>
        <label class="f">Threshold<input class="f-input" type="number" step="any" name="threshold" value="${mc.threshold}"></label>
        <label class="f">Trials (100–20000)<input class="f-input" type="number" name="trials" min="100" max="20000" value="${mc.trials}"></label>
        <label class="f">Random seed<input class="f-input" type="number" name="seed" min="0" value="${mc.seed}"></label>
      </div>
      ${fields.filter((f) => f.unit !== 'months').map((f) => {
        const d = mc.dists[f.key] || { type: 'none' };
        return html`<div class="dist-row"><span class="dist-label">${f.label}</span>
          <select class="f-input w-sel" name="type:${f.key}">${['none', 'uniform', 'triangular', 'normal'].map((t) => html`<option value="${t}" ${d.type === t ? html`selected` : ''}>${t === 'none' ? 'fixed (as entered)' : t}</option>`)}</select>
          ${d.type === 'uniform' ? html`<input class="f-input w-num" name="min:${f.key}" type="number" step="any" placeholder="min" value="${d.min ?? ''}"><input class="f-input w-num" name="max:${f.key}" type="number" step="any" placeholder="max" value="${d.max ?? ''}">` : ''}
          ${d.type === 'triangular' ? html`<input class="f-input w-num" name="min:${f.key}" type="number" step="any" placeholder="min" value="${d.min ?? ''}"><input class="f-input w-num" name="mode:${f.key}" type="number" step="any" placeholder="most likely" value="${d.mode ?? ''}"><input class="f-input w-num" name="max:${f.key}" type="number" step="any" placeholder="max" value="${d.max ?? ''}">` : ''}
          ${d.type === 'normal' ? html`<input class="f-input w-num" name="mean:${f.key}" type="number" step="any" placeholder="mean" value="${d.mean ?? ''}"><input class="f-input w-num" name="sd:${f.key}" type="number" step="any" placeholder="std dev" value="${d.sd ?? ''}">` : ''}
        </div>`;
      })}
      <div class="row wrap"><button class="btn" type="submit" name="mode" value="save">Apply ranges</button><button class="btn primary" type="submit" name="mode" value="run">${icon('dice', 16)} Run simulation</button></div>
    </form>
    ${out?.busy ? html`<p class="muted">Running ${mc.trials} trials…</p>` : ''}
    ${out?.error ? notice('warn', out.error) : ''}
    ${out?.result ? html`
      ${histogram(out.result.histogram, mc.threshold, fmt)}
      <div class="kpis">${kpi('Median (P50)', fmt(out.result.p50))}${kpi('P5 – P95', `${fmt(out.result.p5)} – ${fmt(out.result.p95)}`)}${kpi('Mean', fmt(out.result.mean))}${kpi(`Trials below ${fmt(mc.threshold)}`, `${num(out.result.shareBelowThreshold * 100, 1)}%`, '', out.result.shareBelowThreshold > 0 ? 'neg' : '')}</div>
      ${notice('info', pctNote)}
      <p class="small faint">${out.result.valid} valid trials${out.result.invalid ? `, ${out.result.invalid} dropped because sampled inputs were invalid` : ''}. Seed ${out.result.seed}: the same seed and ranges always give the same result. Normal distributions with bounds are clamped at the bounds.</p>
      <h3 class="h3">Which uncertain inputs matter (correlation with the result)</h3>
      ${out.result.correlations.map((c) => html`<div class="list-row"><span class="grow small">${fields.find((f) => f.key === c.key)?.label || c.key}</span><b class="mono small">${c.r === null ? 'n/a' : c.r.toFixed(2)}</b></div>`)}` : ''}
  </section>`;
}

export function renameModal(s) {
  return html`<form data-form="rename">
    <div class="dhead"><h3>Rename scenario</h3>${closeBtn}</div>
    <div class="dbody"><input type="hidden" name="id" value="${s.id}"><label class="f">Name<input class="f-input" name="name" required maxlength="80" value="${s.name}"></label><div class="err" data-err></div></div>
    <div class="dfoot"><button type="button" class="btn ghost" data-action="close-modal">Cancel</button><button class="btn primary" type="submit">Save</button></div>
  </form>`;
}

export function confirmModal(title, body, action, payload, label, danger = false) {
  return html`<form data-form="confirm" data-confirm="${action}" data-payload="${JSON.stringify(payload)}">
    <div class="dhead"><h3>${title}</h3></div>
    <div class="dbody"><p class="muted">${body}</p></div>
    <div class="dfoot"><button type="button" class="btn ghost" data-action="close-modal">Cancel</button><button class="btn ${danger ? 'danger-fill' : 'primary'}" type="submit">${label}</button></div>
  </form>`;
}

export { CHANGE_OPS };

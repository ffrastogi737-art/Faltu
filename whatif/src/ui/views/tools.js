// Lab, Compare, Decision trees, History.
import { html } from '../html.js';
import { icon, empty, pageHead, notice, fmtValue, money, num, pct, date, lineChart, TYPE_ICON, closeBtn } from './common.js';
import { TYPES, fieldsFor, metricsFor, readiness, runScenario, unitFor } from '../../engine/scenario.js';
import { compareSummaries, applyChanges, CHANGE_OPS } from '../../engine/analysis.js';
import { evaluateTree } from '../../engine/tree.js';
import { scenarioCard } from './home.js';

const scenarioOptions = (list, selected) => list.map((s) => html`<option value="${s.id}" ${s.id === selected ? html`selected` : ''}>${s.name} (${TYPES[s.type].label})</option>`);

// ---------- What-If Lab ----------

export const LAB_PRESETS = {
  business: [
    ['Sales −30%', [{ key: 'unitsPerMonth', op: 'pct', amount: -30 }]],
    ['Expenses ×2', [{ key: 'fixedMonthly', op: 'mul', amount: 2 }, { key: 'marketingMonthly', op: 'mul', amount: 2 }]],
    ['Budget +20%', [{ key: 'startingCash', op: 'pct', amount: 20 }]],
    ['Price +10%', [{ key: 'price', op: 'pct', amount: 10 }]],
    ['Delay launch 3 months', [{ key: 'launchMonth', op: 'add', amount: 3 }]],
  ],
  career: [
    ['Half the time', [{ key: 'hoursPerWeek', op: 'mul', amount: 0.5 }]],
    ['Two skills at once', [{ key: 'hoursPerWeek', op: 'mul', amount: 0.5 }, { key: 'consistencyPct', op: 'pct', amount: -10 }]],
    ['Double the hours', [{ key: 'hoursPerWeek', op: 'mul', amount: 2 }]],
    ['Budget +20%', [{ key: 'trainingCost', op: 'pct', amount: 20 }]],
  ],
  custom: [],
};

export function lab(state, ui) {
  const list = state.scenarios.filter((s) => readiness(s).ready);
  const base = list.find((s) => s.id === ui.lab.baseId) || list[0];
  if (!base) return html`${pageHead('What-If Lab', 'Change one thing, see the difference')}${empty('flask', 'No complete scenario yet', 'The Lab needs a scenario with all inputs filled in.', html`<a class="btn primary" href="#/create">Create one</a>`)}`;
  const fields = fieldsFor(base);
  const label = (k) => fields.find((f) => f.key === k)?.label || k;
  const values = TYPES[base.type].values(base);
  let comparison = null;
  let error = '';
  let modified;
  try {
    modified = applyChanges(values, ui.lab.changes);
    const a = runScenario(base);
    const b = runScenario(base, modified);
    comparison = { a, b, rows: compareSummaries(a.summary, b.summary, metricsFor(base)) };
  } catch (e) { error = e.message; }
  const presets = base.type === 'custom' ? fields.slice(0, 3).map((f) => [`${f.label} +20%`, [{ key: f.key, op: 'pct', amount: 20 }]]) : LAB_PRESETS[base.type];
  return html`
    ${pageHead('What-If Lab', 'Change one thing, see the difference')}
    <section class="card">
      <label class="f">Baseline scenario<select class="f-input" data-lab-base>${scenarioOptions(list, base.id)}</select></label>
      <div class="chips">${presets.map(([name], i) => html`<button class="chip" data-action="lab-preset" data-i="${i}" data-base="${base.id}">${name}</button>`)}</div>
      <h3 class="h3">Changes</h3>
      ${ui.lab.changes.map((c, i) => html`<div class="list-row">
        <select class="f-input" data-lab-change="${i}" data-lk="key">${fields.map((f) => html`<option value="${f.key}" ${c.key === f.key ? html`selected` : ''}>${f.label}</option>`)}</select>
        <select class="f-input w-sel" data-lab-change="${i}" data-lk="op">${Object.entries(CHANGE_OPS).map(([k, l]) => html`<option value="${k}" ${c.op === k ? html`selected` : ''}>${l}</option>`)}</select>
        <input class="f-input w-num" type="number" step="any" data-lab-change="${i}" data-lk="amount" value="${c.amount}" aria-label="Amount">
        <button class="iconbtn" data-action="lab-del" data-i="${i}" aria-label="Remove change">${icon('x')}</button></div>`)}
      <button class="btn sm" data-action="lab-add" data-base="${base.id}">${icon('plus', 14)} Add change</button>
    </section>
    ${error ? notice('warn', error) : ''}
    ${comparison && ui.lab.changes.length ? html`
      <section class="card glow">
        <h2 class="h2">Original vs modified</h2>
        ${diffTable(comparison.rows, base)}
        ${base.type === 'business' ? lineChart([
          { name: 'Original cash', color: '#7d8bb0', values: comparison.a.months.map((m) => m.cashBalance), dash: true },
          { name: 'Modified cash', color: '#38e1c4', values: comparison.b.months.map((m) => m.cashBalance) },
        ], comparison.b.months.map((m) => `M${m.month}`), { title: 'Cash balance', format: (v) => money(v, { compact: true }) }) : ''}
        <h3 class="h3">Variables that changed</h3>
        ${Object.keys(modified).filter((k) => modified[k] !== values[k]).map((k) => html`<div class="list-row"><span class="grow">${label(k)}</span><span class="mono small">${fmtValue(unitFor(base, k), values[k])} → <b>${fmtValue(unitFor(base, k), modified[k])}</b></span></div>`)}
        ${comparison.b.warnings.map((w) => notice('warn', w))}
        <details class="details"><summary>Assumptions & limitations</summary><ul class="small">${comparison.b.limitations.map((l) => html`<li>${l}</li>`)}<li>Only the listed variables changed; every other input is the same as the baseline.</li></ul></details>
        <button class="btn primary" data-action="lab-save" data-base="${base.id}">${icon('copy', 16)} Save as new scenario</button>
      </section>` : html`<p class="muted small">Pick a preset or add a change to compare.</p>`}`;
}

export function diffTable(rows, s) {
  return html`<div class="table-wrap"><table class="table">
    <thead><tr><th>Result</th><th>Original</th><th>Modified</th><th>Difference</th><th>%</th></tr></thead>
    <tbody>${rows.map((r) => {
      const u = unitFor(s, r.key);
      return html`<tr><td>${r.label}</td><td class="num">${fmtValue(u, r.base)}</td><td class="num">${fmtValue(u, r.next)}</td>
        <td class="num ${r.diff > 0 ? 'pos' : r.diff < 0 ? 'neg' : ''}">${r.diff === null ? '—' : `${r.diff > 0 ? '+' : ''}${fmtValue(u, r.diff)}`}</td>
        <td class="num" title="${r.pct.reason}">${r.pct.value === null ? html`<span class="faint">n/a</span>` : pct(r.pct.value)}</td></tr>`;
    })}</tbody></table></div>
    ${rows.some((r) => r.pct.value === null && r.diff !== null) ? html`<p class="small faint">“n/a”: a percentage would be misleading (baseline is zero or a value is negative).</p>` : ''}`;
}

// ---------- Compare ----------

export function compare(state, ui) {
  const ready = state.scenarios.filter((s) => readiness(s).ready);
  const picked = ui.compare.ids.map((id) => ready.find((s) => s.id === id)).filter(Boolean);
  let body = '';
  if (picked.length >= 2) {
    const sameType = picked.every((s) => s.type === picked[0].type && s.type !== 'custom');
    const runs = picked.map((s) => { try { return runScenario(s); } catch (e) { return { error: e.message }; } });
    const metrics = sameType ? metricsFor(picked[0]) : null;
    body = html`<section class="card glow">
      <h2 class="h2">Comparison</h2>
      ${!sameType ? notice('info', 'These scenarios are different kinds, so only their own headline results are shown side by side.') : ''}
      <div class="table-wrap"><table class="table">
        <thead><tr><th>Result</th>${picked.map((s) => html`<th>${s.name}</th>`)}</tr></thead>
        <tbody>${sameType
          ? Object.entries(metrics).map(([k, l]) => html`<tr><td>${l}</td>${picked.map((s, i) => {
            const v = runs[i].summary?.[k];
            const d = i ? compareSummaries(runs[0].summary, runs[i].summary, { [k]: l })[0] : null;
            return html`<td class="num">${fmtValue(unitFor(s, k), v)}${d && d.diff !== null ? html`<small class="${d.diff >= 0 ? 'pos' : 'neg'}">${d.diff >= 0 ? '+' : ''}${fmtValue(unitFor(s, k), d.diff)}${d.pct.value !== null ? ` (${pct(d.pct.value)})` : ''}</small>` : ''}</td>`;
          })}</tr>`)
          : picked.map((s, i) => html`<tr><td>${s.name}</td><td colspan="${picked.length}">${Object.entries(metricsFor(s)).slice(0, 3).map(([k, l]) => html`<div>${l}: <b>${fmtValue(unitFor(s, k), runs[i].summary?.[k])}</b></div>`)}</td></tr>`)}</tbody>
      </table></div>
      ${sameType ? html`<p class="small faint">Differences are relative to the first scenario (${picked[0].name}).</p>` : ''}
      ${sameType && picked[0].type === 'business' ? lineChart(picked.map((s, i) => ({ name: s.name, color: ['#38e1c4', '#8b7bff', '#ffb547', '#ff5c8a'][i], values: runs[i].months.map((m) => m.cashBalance) })), runs[0].months.map((m) => `M${m.month}`), { title: 'Cash balance', format: (v) => money(v, { compact: true }) }) : ''}
      <form data-form="save-comparison" class="row wrap"><input class="f-input grow" name="name" maxlength="60" placeholder="Name this comparison" required><button class="btn" type="submit">${icon('history', 16)} Save comparison</button></form>
    </section>`;
  }
  return html`
    ${pageHead('Comparison workspace', 'Compare scenarios')}
    ${ready.length < 2 ? empty('compare', 'Need two complete scenarios', 'Create or duplicate a scenario, change some inputs, then compare them here.', html`<a class="btn primary" href="#/create">Create a scenario</a>`) : html`
    <section class="card"><p class="small muted">Pick 2–4 scenarios.</p>
      <div class="pick-list">${ready.map((s) => html`<label class="check"><input type="checkbox" data-compare="${s.id}" ${ui.compare.ids.includes(s.id) ? html`checked` : ''}><span>${icon(TYPE_ICON[s.type], 15)} ${s.name}</span></label>`)}</div>
    </section>`}
    ${body}
    ${state.comparisons.length ? html`<h2 class="h2">Saved comparisons</h2>${state.comparisons.slice().reverse().map((c) => html`<div class="card list-row">
      <span class="grow"><b>${c.name}</b><br><span class="small faint">${date(c.createdAt)} · ${c.scenarioIds.length} scenarios</span></span>
      <button class="btn sm" data-action="open-comparison" data-id="${c.id}">Open</button><button class="iconbtn" data-action="delete-comparison" data-id="${c.id}" aria-label="Delete comparison">${icon('trash')}</button></div>`)}` : ''}`;
}

// ---------- Decision trees ----------

export function trees(state) {
  return html`${pageHead('Decision trees', 'Weigh choices', html`<button class="btn sm primary" data-action="new-tree">${icon('plus', 14)} New tree</button>`)}
    <p class="small muted">Choices lead to chance events with your probabilities and outcome values. The app computes expected values; the probabilities are your judgement, not facts.</p>
    ${state.trees.length ? state.trees.map((t) => html`<a class="card list-row" href="#/tree/${t.id}">${icon('tree')}<span class="grow"><b>${t.name}</b><br><span class="small faint">${date(t.updatedAt)}</span></span>${icon('chevron')}</a>`)
      : empty('tree', 'No decision trees', 'Start from a simple template and edit it.', html`<button class="btn primary" data-action="new-tree">Create a tree</button>`)}`;
}

export function treeEditor(state, t, resolveLink) {
  let evaluated = null;
  let error = '';
  try { evaluated = evaluateTree(t.root, resolveLink); } catch (e) { error = e.message; }
  const metricOptions = state.scenarios.filter((s) => readiness(s).ready).flatMap((s) => Object.entries(metricsFor(s)).map(([k, l]) => ({ v: `${s.id}|${k}`, l: `${s.name}: ${l}` })));
  const evById = {};
  const walk = (n) => { evById[n.id] = n; (n.children || []).forEach(walk); };
  if (evaluated) walk(evaluated);
  const node = (n, parentType, depth) => {
    const e = evById[n.id];
    const best = parentType === 'decision' && evById[n.parentId]?.bestId === n.id;
    return html`<div class="tnode t-${n.type} ${best ? 'best' : ''}" style="--d:${depth}">
      <div class="tnode-row">
        <select class="f-input w-sel" data-tn="${n.id}" data-tk="type" aria-label="Node type">${['decision', 'chance', 'outcome'].map((x) => html`<option value="${x}" ${n.type === x ? html`selected` : ''}>${x}</option>`)}</select>
        <input class="f-input grow" data-tn="${n.id}" data-tk="label" value="${n.label}" maxlength="60" aria-label="Label">
        ${parentType === 'chance' ? html`<input class="f-input w-xs" type="number" step="any" min="0" max="100" data-tn="${n.id}" data-tk="p" value="${+(n.p * 100).toFixed(4)}" aria-label="Probability %"><span class="small">%</span>` : ''}
        ${depth ? html`<button class="iconbtn" data-action="tree-del" data-tn="${n.id}" aria-label="Remove">${icon('x')}</button>` : ''}
      </div>
      ${n.type === 'outcome' ? html`<div class="tnode-row">
        <select class="f-input" data-tn="${n.id}" data-tk="link"><option value="">Manual value</option>${metricOptions.map((o) => html`<option value="${o.v}" ${n.link && `${n.link.scenarioId}|${n.link.metric}` === o.v ? html`selected` : ''}>${o.l}</option>`)}</select>
        ${n.link ? '' : html`<input class="f-input w-num" type="number" step="any" data-tn="${n.id}" data-tk="value" value="${n.value ?? ''}" aria-label="Outcome value">`}</div>` : html`<button class="btn sm ghost" data-action="tree-add" data-tn="${n.id}">${icon('plus', 13)} Add branch</button>`}
      ${e ? html`<div class="ev">EV <b>${num(e.ev, 2)}</b>${best ? html` <span class="tag tag-best">best choice</span>` : ''}</div>` : ''}
      ${(n.children || []).map((c) => node({ ...c, parentId: n.id }, n.type, depth + 1))}
    </div>`;
  };
  return html`
    <div class="page-head"><div><div class="kicker">Decision tree</div><h1>${t.name}</h1></div>
      <div class="row"><button class="iconbtn" data-action="rename-tree" data-id="${t.id}" aria-label="Rename">${icon('edit')}</button><button class="iconbtn" data-action="delete-tree" data-id="${t.id}" aria-label="Delete">${icon('trash')}</button></div></div>
    ${error ? notice('warn', error) : notice('info', `Best expected value: ${num(evaluated.ev, 2)}. Expected value is a probability-weighted average of your own estimates, not a guaranteed result.`)}
    <section class="card tree">${node(t.root, null, 0)}</section>
    <details class="details card"><summary>How it is calculated</summary><p class="small">Chance node = Σ (probability × value of each branch). Decision node = the branch with the highest expected value. Probabilities under each chance node must add up to 100%. Outcome values can be typed in or linked to a scenario result, which updates when that scenario changes.</p></details>`;
}

// ---------- History ----------

export function history(state, ui) {
  const q = ui.history.q.toLowerCase();
  const list = [...state.scenarios].filter((s) => (!ui.history.type || s.type === ui.history.type) && (!q || s.name.toLowerCase().includes(q))).sort((a, b) => b.updatedAt - a.updatedAt);
  return html`
    ${pageHead('Scenario history', 'All scenarios')}
    <div class="row wrap"><input class="f-input grow" data-history-q placeholder="Search by name" value="${ui.history.q}" aria-label="Search scenarios">
      <div class="chips">${[['', 'All'], ['business', 'Business'], ['career', 'Career'], ['custom', 'Custom']].map(([k, l]) => html`<button class="chip ${ui.history.type === k ? 'on' : ''}" data-action="history-type" data-type="${k}">${l}</button>`)}</div></div>
    ${list.length ? html`<div class="grid-cards">${list.map((s) => html`<div class="hist-item">${scenarioCard(s)}<div class="row hist-actions">
      <a class="btn sm" href="#/r/${s.id}">Results</a><button class="iconbtn" data-action="rename" data-id="${s.id}" aria-label="Rename ${s.name}">${icon('edit')}</button>
      <button class="iconbtn" data-action="duplicate" data-id="${s.id}" aria-label="Duplicate ${s.name}">${icon('copy')}</button><button class="iconbtn" data-action="delete-scenario" data-id="${s.id}" aria-label="Delete ${s.name}">${icon('trash')}</button></div></div>`)}</div>`
      : empty('history', 'Nothing found', state.scenarios.length ? 'No scenario matches this search.' : 'Scenarios you create appear here.')}
    ${state.runs.length ? html`<h2 class="h2">Saved snapshots</h2>
      ${state.runs.slice().reverse().slice(0, 50).map((r) => html`<div class="card list-row"><span class="grow"><b>${r.name}</b><br><span class="small faint">${date(r.at)} · ${r.headline}</span></span>
        <button class="iconbtn" data-action="delete-run" data-id="${r.id}" aria-label="Delete snapshot">${icon('trash')}</button></div>`)}` : ''}`;
}

export function textModal(title, formName, fields) {
  return html`<form data-form="${formName}">
    <div class="dhead"><h3>${title}</h3>${closeBtn}</div>
    <div class="dbody">${fields}<div class="err" data-err></div></div>
    <div class="dfoot"><button type="button" class="btn ghost" data-action="close-modal">Cancel</button><button class="btn primary" type="submit">Save</button></div>
  </form>`;
}

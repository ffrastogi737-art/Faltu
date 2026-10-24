import { html } from '../html.js';
import { icon, pageHead, notice, fmtValue, SOURCE_SHORT, SOURCE_STYLE } from './common.js';
import { FIELD_SETS } from '../../ai/schema.js';
import { TYPES } from '../../engine/scenario.js';

const EXAMPLES = [
  'I have ₹50,000. What if I start an online business?',
  'What if I sell handmade candles at ₹400 each, 30 orders a month, with ₹6,000 rent per month, for 12 months?',
  'What if I learn data analysis with 6 hours a week, about 250 hours total, course costs ₹12,000?',
];

export function create(state, ui) {
  const c = ui.create;
  const busy = c.busy;
  return html`
    ${pageHead('New scenario', 'Describe a what-if')}
    <form class="card" data-form="interpret">
      <label class="f">Your situation, in your own words
        <textarea name="text" rows="4" maxlength="2000" placeholder="e.g. I have ₹50,000. What if I start an online business?">${c.text}</textarea></label>
      <div class="chips">${EXAMPLES.map((e, i) => html`<button type="button" class="chip" data-action="example-text" data-i="${i}">${e.length > 46 ? `${e.slice(0, 44)}…` : e}</button>`)}</div>
      <div class="row wrap" style="margin-top:12px">
        <button class="btn primary" type="submit" ${busy ? html`disabled` : ''}>${icon('sparkle')} ${busy ? 'Interpreting…' : 'Interpret'}</button>
        ${busy ? html`<button class="btn danger" type="button" data-action="cancel-ai">${icon('stop')} Cancel</button>` : ''}
        <span class="small muted">${ui.ai.ready ? `Uses local AI: ${ui.ai.name}` : 'Uses the rule-based assistant (no AI model loaded)'}</span>
      </div>
      ${busy ? html`<pre class="stream" aria-live="polite">${c.stream}</pre>` : ''}
      ${c.error ? notice('warn', c.error) : ''}
    </form>
    ${c.result ? preview(c.result) : ''}

    ${pageHead('Or build it yourself', 'Manual builder')}
    <div class="grid-cards">
      ${Object.entries(TYPES).map(([type, t]) => html`<div class="card">
        <h3>${icon(type === 'business' ? 'business' : type === 'career' ? 'career' : 'custom')} ${t.label}</h3>
        <p class="small muted">${{ business: 'Revenue, costs, cash flow, break-even and runway, month by month.', career: 'Hours, cost and finish date for a learning plan, with milestones.', custom: 'Your own variables and formulas: budgets, time, anything numeric.' }[type]}</p>
        <div class="row"><button class="btn sm primary" data-action="new" data-type="${type}">Blank</button><button class="btn sm" data-action="new-example" data-type="${type}">With example values</button></div>
      </div>`)}
      ${state.templates.map((t) => html`<div class="card"><h3>${icon('file')} ${t.name}</h3><p class="small muted">Your custom template</p>
        <div class="row"><button class="btn sm primary" data-action="from-template" data-id="${t.id}">Use</button><button class="btn sm ghost" data-action="delete-template" data-id="${t.id}">Delete</button></div></div>`)}
    </div>`;
}

function preview(r) {
  if (!r.ok) return html`<div class="card">${notice('warn', `The interpretation could not be used: ${r.errors.join('; ')}`)}</div>`;
  const d = r.draft;
  const fields = FIELD_SETS[d.scenario_type] || [];
  const source = r.provider === 'llama' ? 'ai' : 'fact';
  return html`<section class="card glow">
    <div class="row spread"><div><div class="kicker">${r.provider === 'llama' ? 'Local AI interpretation' : 'Rule-based interpretation'}</div><h2>${d.title}</h2></div><span class="type-badge t-${d.scenario_type}">${TYPES[d.scenario_type].label}</span></div>
    ${r.provider === 'llama' ? notice('info', 'Values below were suggested by the AI. They stay marked “AI · confirm” until you check them; the simulation will not run on unconfirmed AI values.') : notice('info', 'Only numbers found in your text were filled in. Nothing was guessed.')}
    ${fields.length ? html`<table class="table">
      <thead><tr><th>Input</th><th>Value</th><th>Status</th></tr></thead>
      <tbody>${fields.map((f) => {
        const v = d.values[f.key];
        return html`<tr><td>${f.label}</td><td class="num">${v === null ? '—' : fmtValue(f.unit, v)}</td>
          <td>${v === null ? (f.required === false ? html`<span class="tag">optional · default</span>` : html`<span class="tag tag-warn">missing</span>`) : html`<span class="tag ${SOURCE_STYLE[source]}">${SOURCE_SHORT[source]}</span>`}</td></tr>`;
      })}</tbody></table>` : html`<p class="muted">Custom scenarios start with a simple variable you can rename. Add your own variables and formulas next.</p>`}
    ${d.missing_inputs.length ? html`<p class="small"><b>Still needed:</b> ${d.missing_inputs.map((k) => fields.find((f) => f.key === k)?.label || k).join(', ')}. You can enter them next, or fill them with clearly labelled example values.</p>` : ''}
    ${d.assumptions.length ? html`<details class="details"><summary>Notes from the interpretation</summary><ul>${d.assumptions.map((a) => html`<li>${a}</li>`)}</ul></details>` : ''}
    ${r.rejected?.length ? html`<details class="details"><summary>${r.rejected.length} value(s) rejected by validation</summary><ul>${r.rejected.map((a) => html`<li>${a}</li>`)}</ul></details>` : ''}
    <div class="row wrap"><button class="btn primary" data-action="accept-draft">${icon('check')} Create scenario</button>
      <button class="btn" data-action="accept-draft" data-fill="1">Create & fill gaps with example values</button></div>
  </section>`;
}

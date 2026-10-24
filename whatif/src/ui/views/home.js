import { html } from '../html.js';
import { icon, empty, pageHead, fmtValue, TYPE_ICON, date } from './common.js';
import { TYPES, metricsFor, headlineFor, readiness, runScenario, unitFor } from '../../engine/scenario.js';

export function headline(s) {
  const key = headlineFor(s);
  if (!key) return { label: '', value: '—' };
  const label = metricsFor(s)[key];
  if (!readiness(s).ready) return { label, value: 'needs input' };
  try {
    const v = runScenario(s).summary[key];
    return { label, value: fmtValue(unitFor(s, key), v), negative: typeof v === 'number' && v < 0 };
  } catch { return { label, value: 'check inputs' }; }
}

export function scenarioCard(s) {
  const h = headline(s);
  const r = readiness(s);
  return html`<a class="card scard" href="#/s/${s.id}">
    <div class="scard-top"><span class="type-badge t-${s.type}">${icon(TYPE_ICON[s.type], 15)} ${TYPES[s.type].label}</span><span class="faint small">${date(s.updatedAt)}</span></div>
    <h3>${s.name}</h3>
    <div class="scard-metric"><span>${h.label}</span><b class="${h.negative ? 'neg' : ''}">${h.value}</b></div>
    ${r.unconfirmed.length ? html`<span class="tag tag-ai">${r.unconfirmed.length} AI value(s) to confirm</span>` : r.missing.length ? html`<span class="tag tag-warn">${r.missing.length} missing input(s)</span>` : r.examples.length ? html`<span class="tag tag-example">uses example values</span>` : ''}
  </a>`;
}

export function home(state, ui) {
  const recent = [...state.scenarios].sort((a, b) => b.updatedAt - a.updatedAt).slice(0, 6);
  return html`
    <section class="hero">
      <div class="kicker">Offline decision simulator</div>
      <h1>Explore <span class="grad">what could happen</span> before you decide.</h1>
      <p class="muted">Every number is calculated on this device from inputs you can see and change. Nothing is a prediction or a guarantee.</p>
      <a class="btn primary lg" href="#/create">${icon('sparkle')} Describe a what-if</a>
      <div class="quick">
        <button class="qbtn" data-action="new" data-type="business">${icon('business', 22)}<span>Business</span></button>
        <button class="qbtn" data-action="new" data-type="career">${icon('career', 22)}<span>Career</span></button>
        <button class="qbtn" data-action="new" data-type="custom">${icon('custom', 22)}<span>Custom</span></button>
        <a class="qbtn" href="#/trees">${icon('tree', 22)}<span>Decision tree</span></a>
      </div>
    </section>

    <div class="status-row">
      <a class="status ${ui.ai.ready ? 'ok' : ''}" href="#/models">${icon('chip', 16)}<div><b>${ui.ai.ready ? 'Local AI ready' : 'Rule-based assistant'}</b><small>${ui.ai.ready ? ui.ai.name : 'No model loaded. Everything still works.'}</small></div></a>
      <a class="status ok" href="#/settings">${icon('lock', 16)}<div><b>Private & offline</b><small>Data stays on this device</small></div></a>
    </div>

    ${pageHead('Your scenarios', 'Recent', html`<a class="btn sm ghost" href="#/history">All ${icon('chevron', 14)}</a>`)}
    ${recent.length ? html`<div class="grid-cards">${recent.map(scenarioCard)}</div>`
      : empty('flask', 'No scenarios yet', 'Describe a situation in your own words, or start from a blank or example model.', html`<button class="btn primary" data-action="new-example" data-type="business">Try an example business</button>`)}

    <div class="tools">
      <a class="tool" href="#/lab">${icon('flask')}<span>What-If Lab</span></a>
      <a class="tool" href="#/compare">${icon('compare')}<span>Compare</span></a>
      <a class="tool" href="#/trees">${icon('tree')}<span>Decision trees</span></a>
      <a class="tool" href="#/models">${icon('chip')}<span>AI models</span></a>
      <a class="tool" href="#/export">${icon('download')}<span>Export & data</span></a>
      <a class="tool" href="#/settings">${icon('settings')}<span>Settings</span></a>
    </div>`;
}

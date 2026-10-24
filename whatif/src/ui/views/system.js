// Model manager, settings, data export.
import { html } from '../html.js';
import { icon, pageHead, notice, num, date } from './common.js';
import { CATALOG } from '../../ai/models.js';

const gb = (b) => (b >= 1024 ** 3 ? `${(b / 1024 ** 3).toFixed(2)} GB` : `${Math.round(b / 1024 ** 2)} MB`);

export function models(state, ui) {
  const m = ui.models;
  const installed = state.models;
  const loadedId = ui.ai.modelId;
  return html`
    ${pageHead('Local AI', 'Model manager')}
    <section class="card ${ui.ai.ready ? 'glow' : ''}">
      <div class="row spread"><div><div class="kicker">Status</div><h2>${ui.ai.ready ? `Running locally: ${ui.ai.name}` : ui.ai.loading ? 'Loading model…' : 'No model loaded'}</h2></div>${ui.ai.ready ? html`<button class="btn sm" data-action="unload-model">Unload</button>` : ''}</div>
      <p class="small muted">${ui.ai.ready ? `Inference runs on this device with llama.cpp (WebAssembly)${ui.ai.info?.multithread ? `, ${ui.ai.info.threads} threads` : ', single thread'}, context ${ui.ai.info?.ctx ?? '?'} tokens. Nothing is sent anywhere.` : 'The app works fully without AI: scenarios, simulations, comparisons and explanations all use the built-in deterministic engine and rule-based assistant.'}</p>
      ${ui.ai.loading ? html`<div class="progress"><i style="width:100%" class="indeterminate"></i></div>` : ''}
      ${ui.ai.error ? notice('warn', ui.ai.error) : ''}
    </section>

    <h2 class="h2">Installed models</h2>
    ${installed.length ? installed.map((x) => html`<div class="card model">
      <div class="row spread"><div><b>${x.name}</b><div class="small muted">${gb(x.size)} · ${x.meta.architecture || '?'} · ${x.meta.quantization || '?'} · trained context ${x.meta.contextLength ?? '?'}${x.license ? ` · ${x.license}` : ''}</div></div>
        ${x.id === loadedId ? html`<span class="tag tag-ok">loaded</span>` : ''}</div>
      ${x.assessment.problems.map((p) => notice('warn', p))}${x.assessment.notes.map((p) => notice('info', p))}
      <div class="small faint">Estimated memory while running: ~${gb(x.assessment.estimatedBytes)} · added ${date(x.addedAt)} via ${x.source}</div>
      <div class="row wrap">${x.id === loadedId ? '' : html`<button class="btn sm primary" data-action="load-model" data-id="${x.id}" ${ui.ai.loading || !x.assessment.compatible ? html`disabled` : ''}>${icon('play', 14)} Load</button>`}
        <button class="btn sm danger" data-action="remove-model" data-id="${x.id}" ${ui.ai.loading ? html`disabled` : ''}>${icon('trash', 14)} Remove</button></div>
    </div>`) : html`<p class="small muted">None yet.</p>`}

    ${m.busy ? html`<section class="card"><b>${m.busy}</b><div class="progress"><i style="width:${m.total ? (m.loaded / m.total) * 100 : 0}%"></i></div>
      <div class="row spread small"><span>${gb(m.loaded || 0)} of ${m.total ? gb(m.total) : '?'}</span><button class="btn sm danger" data-action="cancel-model-op">${icon('stop', 14)} Cancel</button></div></section>` : ''}
    ${m.error ? notice('warn', m.error) : ''}

    <h2 class="h2">Use a model you already have</h2>
    <section class="card">
      <p class="small">If you already downloaded a GGUF model file (for example with another AI app that saves models to your Downloads folder), import it here so you don't download it again.</p>
      <label class="btn ${m.busy ? 'disabled' : ''}">${icon('upload', 16)} Import .gguf file<input type="file" accept=".gguf,application/octet-stream" data-action="import-model" class="sr-only" ${m.busy ? html`disabled` : ''}></label>
      <details class="details"><summary>Why can't the app use another AI app's model directly?</summary>
        <p class="small">Android keeps each app's files private (application sandboxing). Other AI apps do not expose their models or a documented local inference service to other apps, so reading their storage would require bypassing Android security, which this app does not do. The supported way is a file you can see in the system file picker. Google's on-device Gemini Nano (AICore) is available to apps only through its own SDK on specific supported phones; it is a different runtime and is not integrated here.</p>
      </details>
    </section>

    <h2 class="h2">Download a model (optional, needs internet once)</h2>
    ${CATALOG.map((c) => {
      const has = installed.some((x) => x.catalogId === c.id);
      return html`<div class="card model"><div class="row spread"><div><b>${c.name}</b><div class="small muted">${gb(c.size)} · ${c.license} · GGUF</div></div>${has ? html`<span class="tag tag-ok">installed</span>` : ''}</div>
        <p class="small">${c.note}</p>
        ${has ? '' : html`<button class="btn sm" data-action="download-model" data-id="${c.id}" ${m.busy ? html`disabled` : ''}>${icon('download', 14)} Download from Hugging Face</button>`}</div>`;
    })}
    <p class="small faint">Downloads go directly from huggingface.co to this device and only start when you tap Download. No scenario data is sent. Model files are stored in app-private storage and are never included in exports.</p>
    <section class="card">
      <div class="row spread small"><span>Storage used by this app</span><b>${ui.storage ? `${gb(ui.storage.usage || 0)} of ${gb(ui.storage.quota || 0)} available` : 'unknown'}</b></div>
      ${navigator.deviceMemory ? html`<div class="row spread small"><span>Device memory (reported)</span><b>~${navigator.deviceMemory} GB</b></div>` : ''}
    </section>`;
}

export function settings(state) {
  const s = state.settings;
  const curr = ['INR', 'USD', 'EUR', 'GBP', 'JPY', 'AUD', 'CAD', 'SGD', 'AED', 'BDT', 'PKR', 'LKR', 'NPR'];
  return html`
    ${pageHead('Preferences', 'Settings')}
    <form class="card" data-form="settings">
      <div class="grid2">
        <label class="f">Currency<select class="f-input" name="currency">${curr.map((c) => html`<option ${c === s.currency ? html`selected` : ''}>${c}</option>`)}</select></label>
        <label class="f">Number format<select class="f-input" name="locale">${[['en-IN', 'India (1,00,000)'], ['en-US', 'US (100,000)'], ['en-GB', 'UK'], ['de-DE', 'Germany (100.000)']].map(([k, l]) => html`<option value="${k}" ${k === s.locale ? html`selected` : ''}>${l}</option>`)}</select></label>
        <label class="f">AI context length<select class="f-input" name="nCtx">${[1024, 2048, 4096].map((n) => html`<option ${n === s.ai.nCtx ? html`selected` : ''}>${n}</option>`)}</select></label>
        <label class="f">Reduce motion<select class="f-input" name="reduceMotion"><option value="0">Off</option><option value="1" ${s.reduceMotion ? html`selected` : ''}>On</option></select></label>
      </div>
      <label class="check"><input type="checkbox" name="autoLoad" ${s.ai.autoLoad ? html`checked` : ''}><span>Load the last used AI model when the app starts<small>Uses memory and battery. Off by default.</small></span></label>
      <button class="btn primary" type="submit">Save settings</button>
    </form>
    <section class="card">
      <h2 class="h2">${icon('lock')} Privacy</h2>
      <ul class="small">
        <li>No account. Scenarios, results and settings are stored only on this device.</li>
        <li>The only network use is downloading an AI model when you tap Download. No scenario data is ever uploaded.</li>
        <li>No analytics, ads or tracking. No API keys are used or stored.</li>
        <li>You can export everything or delete everything at any time.</li>
      </ul>
      <a class="btn" href="#/export">${icon('download', 16)} Export & delete data</a>
    </section>`;
}

export function exportView(state) {
  return html`
    ${pageHead('Your data', 'Export & delete')}
    <section class="card">
      <h2 class="h2">Export</h2>
      <p class="small muted">${state.scenarios.length} scenario(s), ${state.trees.length} decision tree(s), ${state.comparisons.length} saved comparison(s), ${state.runs.length} snapshot(s).</p>
      <div class="row wrap">
        <button class="btn primary" data-action="export-json">${icon('download', 16)} Full backup (JSON)</button>
        <button class="btn" data-action="export-reports" ${state.scenarios.length ? '' : html`disabled`}>${icon('file', 16)} All reports (Markdown)</button>
        <button class="btn" data-action="export-csv" ${state.scenarios.some((s) => s.type === 'business') ? '' : html`disabled`}>${icon('file', 16)} Business projections (CSV)</button>
      </div>
    </section>
    <section class="card">
      <h2 class="h2">Import</h2>
      <p class="small muted">Restores a WHAT IF? backup. This replaces the scenarios on this device.</p>
      <label class="btn">${icon('upload', 16)} Import backup<input type="file" accept="application/json,.json" data-action="import-json" class="sr-only"></label>
    </section>
    <section class="card">
      <h2 class="h2">Delete</h2>
      <p class="small muted">Removes all scenarios, trees, comparisons, snapshots, settings and downloaded AI models from this device.</p>
      <button class="btn danger" data-action="delete-all">${icon('trash', 16)} Delete everything</button>
    </section>`;
}

export function deleteAllModal() {
  return html`<form data-form="delete-all">
    <div class="dhead"><h3>Delete all data?</h3></div>
    <div class="dbody"><p class="muted">This cannot be undone. Consider exporting a backup first.</p>
      <label class="f">Type DELETE to confirm<input class="f-input" name="confirm" autocomplete="off" required></label><div class="err" data-err></div></div>
    <div class="dfoot"><button type="button" class="btn ghost" data-action="close-modal">Cancel</button><button class="btn danger-fill" type="submit">Delete everything</button></div>
  </form>`;
}

export { num };

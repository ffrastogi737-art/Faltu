// Controller: routing, events, persistence calls, AI orchestration. Calculations live in src/engine.

import { createStore, indexedDbAdapter } from '../data/store.js';
import { newScenario, TYPES, readiness, runScenario, fieldsFor, metricsFor, sensitivityKeysFor, unitFor } from '../engine/scenario.js';
import { BUSINESS_EXAMPLE } from '../engine/business.js';
import { CAREER_EXAMPLE } from '../engine/career.js';
import { applyChanges, sensitivity } from '../engine/analysis.js';
import { runMonteCarlo } from '../engine/montecarlo.js';
import { scenarioReport, businessCSV } from '../engine/report.js';
import { RuleProvider, LlamaProvider, CancelledError } from '../ai/provider.js';
import { draftToScenario } from '../ai/schema.js';
import { factSheet } from '../ai/explain.js';
import { assessModel } from '../ai/gguf.js';
import { CATALOG, importModelFile, downloadModel, getModelFile, deleteModelFile, storageEstimate, opfsAvailable } from '../ai/models.js';
import { html } from './html.js';
import { shell, setFormat, fmtValue } from './views/common.js';
import { home } from './views/home.js';
import { create } from './views/create.js';
import { editor, results, liveSummary, readinessBlock, renameModal, confirmModal } from './views/scenario.js';
import { lab, compare, trees, treeEditor, history, textModal, LAB_PRESETS } from './views/tools.js';
import { models, settings, exportView, deleteAllModal } from './views/system.js';

const app = document.getElementById('app');
const dialog = document.getElementById('modal');
const toasts = document.getElementById('toasts');
const store = createStore(indexedDbAdapter());
const rules = new RuleProvider();
const llama = new LlamaProvider({
  wasmUrl: new URL('vendor/wllama/wllama.wasm', location.href).href,
  moduleUrl: new URL('vendor/wllama/index.js', location.href).href,
});

const ui = {
  create: { text: '', busy: false, stream: '', error: '', result: null },
  ai: { ready: false, loading: false, name: '', modelId: null, info: null, error: '' },
  explain: { id: null, text: '', busy: false, error: '', model: '' },
  mc: { id: null, busy: false, result: null, error: '' },
  lab: { baseId: null, changes: [] },
  compare: { ids: [] },
  history: { q: '', type: '' },
  models: { busy: '', loaded: 0, total: 0, error: '' },
  storage: null,
  abort: null,
  silent: false,
};

const uid = (p) => p + (crypto.randomUUID?.() ?? `${Date.now().toString(36)}${Math.random().toString(36).slice(2)}`);
const findS = (id) => store.state.scenarios.find((s) => s.id === id);

// ---------- routing & render ----------

function parseRoute() {
  const [name = 'home', id] = location.hash.replace(/^#\/?/, '').split('/');
  return { name, id };
}

function resolveLink(link) {
  const s = findS(link.scenarioId);
  if (!s) throw new Error('A linked scenario was deleted');
  const v = runScenario(s).summary[link.metric];
  if (!Number.isFinite(v)) throw new Error(`Linked result “${link.metric}” is not available`);
  return v;
}

function view(state, r) {
  switch (r.name) {
    case 'create': return create(state, ui);
    case 's': { const s = findS(r.id); return s ? editor(state, s, ui) : notFound(); }
    case 'r': { const s = findS(r.id); return s ? results(state, s, ui) : notFound(); }
    case 'lab': return lab(state, ui);
    case 'compare': return compare(state, ui);
    case 'trees': return trees(state);
    case 'tree': { const t = state.trees.find((x) => x.id === r.id); return t ? treeEditor(state, t, resolveLink) : notFound(); }
    case 'history': return history(state, ui);
    case 'models': return models(state, ui);
    case 'settings': return settings(state);
    case 'export': return exportView(state);
    default: return home(state, ui);
  }
}
const notFound = () => html`<div class="empty"><b>Not found</b><p>This item no longer exists.</p><a class="btn" href="#/home">Home</a></div>`;

function aiLabel() {
  return ui.ai.ready ? { ready: true, short: 'AI on', text: `Local model: ${ui.ai.name}` } : { ready: false, short: ui.ai.loading ? 'Loading…' : 'Rules', text: 'Rule-based assistant (no AI model loaded)' };
}

function render() {
  const state = store.state;
  setFormat(state.settings);
  document.documentElement.classList.toggle('reduce-motion', !!state.settings.reduceMotion);
  const r = parseRoute();
  const nav = { s: 'create', r: 'history', tree: 'trees' }[r.name] || r.name;
  const scroll = window.scrollY;
  const active = document.activeElement?.id;
  app.innerHTML = shell(nav, aiLabel(), view(state, r));
  window.scrollTo(0, scroll);
  if (active) document.getElementById(active)?.focus();
  if (dialog.open && ui.modalView) dialog.innerHTML = ui.modalView();
}

function openModal(fn) { ui.modalView = null; dialog.innerHTML = fn(); if (!dialog.open) dialog.showModal(); dialog.querySelector('input:not([type=hidden]),select,textarea')?.focus(); }
function closeModal() { if (dialog.open) dialog.close(); }

function toast(msg, kind = '') {
  const el = document.createElement('div');
  el.className = `toast ${kind}`;
  el.setAttribute('role', 'status');
  el.textContent = msg;
  toasts.append(el);
  while (toasts.children.length > 3) toasts.firstChild.remove();
  setTimeout(() => el.remove(), kind === 'err' ? 5000 : 3000);
}

async function save(fn, { quiet = false } = {}) {
  try {
    if (quiet) ui.silent = true;
    return await store.update(fn);
  } catch (e) {
    toast(e.message, 'err');
    throw e;
  } finally { ui.silent = false; }
}

function download(name, text, mime = 'application/json') {
  if (window.AndroidBridge) { window.AndroidBridge.saveFile(name, text, mime); return; }
  const url = URL.createObjectURL(new Blob([text], { type: mime }));
  const a = Object.assign(document.createElement('a'), { href: url, download: name });
  document.body.append(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
const fileSafe = (s) => s.replace(/[^\w.-]+/g, '-').slice(0, 50);

// ---------- scenario helpers ----------

async function createScenario(type, withExamples, name) {
  const id = uid('s_');
  await save((st, now) => { st.scenarios.push(newScenario(type, { id, name: name || `New ${TYPES[type].label.toLowerCase()} scenario`, now, withExamples })); });
  location.hash = `#/s/${id}`;
}

function touch(s, now) { s.updatedAt = now; }

/** Field edits re-render only the live parts so typing never loses focus. */
async function editScenario(id, fn, { full = false } = {}) {
  await save((st, now) => { const s = st.scenarios.find((x) => x.id === id); fn(s, now); touch(s, now); }, { quiet: !full });
  if (!full) {
    const s = findS(id);
    const live = document.getElementById('live');
    const rd = document.getElementById('readiness');
    if (live) live.innerHTML = liveSummary(s);
    if (rd) rd.innerHTML = readinessBlock(s);
  }
}

const parseNum = (v) => (v === '' || v === null ? null : Number(v));

// ---------- click actions ----------

const actions = {
  'close-modal': closeModal,
  new: (d) => createScenario(d.type, false),
  'new-example': (d) => createScenario(d.type, true, `Example ${TYPES[d.type].label.toLowerCase()}`),
  'example-text': (d) => { ui.create.text = ['I have ₹50,000. What if I start an online business?', 'What if I sell handmade candles at ₹400 each, 30 orders a month, with ₹6,000 rent per month, for 12 months?', 'What if I learn data analysis with 6 hours a week, about 250 hours total, course costs ₹12,000?'][d.i]; render(); },
  'cancel-ai': () => ui.abort?.abort(),
  'accept-draft': async (d) => {
    const r = ui.create.result;
    const id = uid('s_');
    const s = draftToScenario(r.draft, { id, now: Date.now(), source: r.provider === 'llama' ? 'ai' : 'fact' });
    if (d.fill && s.type !== 'custom') {
      const ex = s.type === 'business' ? BUSINESS_EXAMPLE : CAREER_EXAMPLE;
      for (const [k, e] of Object.entries(s.inputs)) if (e.value === null && ex[k] !== undefined) s.inputs[k] = { value: ex[k], source: 'example' };
    }
    if (r.draft.currency && r.draft.currency !== store.state.settings.currency) toast(`Your text mentions ${r.draft.currency}; amounts are shown in ${store.state.settings.currency} (change it in Settings).`);
    await save((st) => { st.scenarios.push(s); });
    ui.create = { text: '', busy: false, stream: '', error: '', result: null };
    location.hash = `#/s/${id}`;
  },
  'from-template': async (d) => {
    const t = store.state.templates.find((x) => x.id === d.id);
    const id = uid('s_');
    await save((st, now) => { const s = newScenario('custom', { id, name: t.name, now }); s.model = structuredClone(t.model); st.scenarios.push(s); });
    location.hash = `#/s/${id}`;
  },
  'delete-template': (d) => save((st) => { st.templates = st.templates.filter((t) => t.id !== d.id); }),
  'save-template': async () => {
    const s = findS(parseRoute().id);
    await save((st) => { st.templates.push({ id: uid('t_'), name: s.name, model: structuredClone(s.model) }); });
    toast('Saved as a template. Find it on the Create screen.');
  },
  rename: (d) => openModal(() => renameModal(findS(d.id))),
  duplicate: async (d) => {
    const id = uid('s_');
    await save((st, now) => { const s = structuredClone(st.scenarios.find((x) => x.id === d.id)); Object.assign(s, { id, name: `${s.name} (copy)`, createdAt: now, updatedAt: now, parentId: d.id }); st.scenarios.push(s); });
    toast('Duplicated.');
    location.hash = `#/s/${id}`;
  },
  'delete-scenario': (d) => openModal(() => confirmModal('Delete scenario?', `“${findS(d.id).name}” and its snapshots will be removed from this device.`, 'deleteScenario', { id: d.id }, 'Delete', true)),
  'confirm-input': (d) => editScenario(parseRoute().id, (s) => { s.inputs[d.key].source = 'assumption'; }, { full: true }),
  'confirm-all': (d) => editScenario(d.id, (s) => {
    if (s.type === 'custom') s.model.variables.forEach((v) => { if (v.source === 'ai') v.source = 'assumption'; });
    else Object.values(s.inputs).forEach((e) => { if (e.source === 'ai') e.source = 'assumption'; });
  }, { full: true }),
  'fill-examples': (d) => editScenario(d.id, (s) => {
    const ex = s.type === 'business' ? BUSINESS_EXAMPLE : CAREER_EXAMPLE;
    for (const [k, e] of Object.entries(s.inputs)) if ((e.value === null || e.value === '') && ex[k] !== undefined) s.inputs[k] = { value: ex[k], source: 'example' };
  }, { full: true }),
  'add-oc': () => editScenario(parseRoute().id, (s) => { s.otherCosts.push({ name: 'New cost', amount: 0, frequency: 'monthly', month: 1 }); }, { full: true }),
  'del-oc': (d) => editScenario(parseRoute().id, (s) => { s.otherCosts.splice(+d.i, 1); }, { full: true }),
  'add-ms': () => editScenario(parseRoute().id, (s) => { s.milestones.push({ name: 'Milestone', hours: Math.max(1, Math.round((s.inputs.hoursToTarget.value || 10) / 2)) }); }, { full: true }),
  'del-ms': (d) => editScenario(parseRoute().id, (s) => { s.milestones.splice(+d.i, 1); }, { full: true }),
  'log-hours': () => {
    const h = Number(document.getElementById('log-hours').value);
    if (!(h > 0 && h <= 24 * 7)) { toast('Enter the hours you studied (more than 0).', 'err'); return; }
    return editScenario(parseRoute().id, (s, now) => {
      s.log = s.log || [];
      s.log.push({ at: now, hours: h });
      s.inputs.completedHours = { value: (Number(s.inputs.completedHours.value) || 0) + h, source: 'fact' };
    }, { full: true }).then(() => toast(`Logged ${h} h.`));
  },
  'add-var': () => editScenario(parseRoute().id, (s) => {
    let n = s.model.variables.length + 1;
    while (s.model.variables.some((v) => v.key === `v${n}`) || s.model.outputs.some((o) => o.key === `v${n}`)) n++;
    s.model.variables.push({ key: `v${n}`, label: `Variable ${n}`, value: null, unit: 'number', source: 'fact' });
  }, { full: true }),
  'del-var': (d) => editScenario(parseRoute().id, (s) => { s.model.variables.splice(+d.i, 1); }, { full: true }),
  'add-out': () => editScenario(parseRoute().id, (s) => {
    let n = s.model.outputs.length + 1;
    while (s.model.outputs.some((o) => o.key === `out${n}`)) n++;
    s.model.outputs.push({ key: `out${n}`, label: `Output ${n}`, formula: s.model.variables[0]?.key || '0', unit: 'number' });
  }, { full: true }),
  'del-out': (d) => editScenario(parseRoute().id, (s) => { if (s.model.outputs.length > 1) s.model.outputs.splice(+d.i, 1); else toast('A custom scenario needs at least one output.', 'err'); }, { full: true }),

  'ai-explain': async (d) => {
    const s = findS(d.id);
    const res = runScenario(s);
    const metric = Object.keys(metricsFor(s))[0];
    let sens = null;
    try { sens = sensitivity(TYPES[s.type].values(s), sensitivityKeysFor(s), (v) => runScenario(s, v).summary[metric], 20); } catch { /* optional */ }
    const facts = factSheet(s, res, sens, (u, v) => fmtValue(u ?? unitFor(s, metric), v));
    ui.abort = new AbortController();
    ui.explain = { id: s.id, text: '', busy: true, error: '', model: ui.ai.name };
    render();
    try {
      await llama.explain(facts, { signal: ui.abort.signal, onToken: (_, all) => { ui.explain.text = all; patchText('.ai-out p', all); } });
    } catch (e) {
      ui.explain.error = e instanceof CancelledError ? 'Stopped.' : `Local AI failed: ${e.message}. The calculated results above are unaffected.`;
    }
    ui.explain.busy = false;
    render();
  },
  'save-run': async (d) => {
    const s = findS(d.id);
    const res = runScenario(s);
    const k = Object.keys(metricsFor(s))[0];
    await save((st, now) => { st.runs.push({ id: uid('r_'), scenarioId: s.id, name: s.name, at: now, headline: `${metricsFor(s)[k]}: ${fmtValue(unitFor(s, k), res.summary[k])}`, inputs: TYPES[s.type].values(s), summary: res.summary }); });
    toast('Snapshot saved to History.');
  },
  report: (d) => { const s = findS(d.id); download(`${fileSafe(s.name)}.md`, scenarioReport(s, fmtValue), 'text/markdown'); },
  'lab-open': (d) => { ui.lab = { baseId: d.id, changes: [] }; location.hash = '#/lab'; },
  'lab-try': (d) => { ui.lab = { baseId: d.id, changes: [{ key: d.key, op: 'pct', amount: 20 }] }; location.hash = '#/lab'; },
  'lab-preset': (d) => {
    const s = findS(d.base);
    const presets = s.type === 'custom' ? fieldsFor(s).slice(0, 3).map((f) => [f.label, [{ key: f.key, op: 'pct', amount: 20 }]]) : LAB_PRESETS[s.type];
    ui.lab = { baseId: s.id, changes: structuredClone(presets[+d.i][1]) };
    render();
  },
  'lab-add': (d) => { ui.lab.baseId = d.base; ui.lab.changes.push({ key: fieldsFor(findS(d.base))[0].key, op: 'pct', amount: 10 }); render(); },
  'lab-del': (d) => { ui.lab.changes.splice(+d.i, 1); render(); },
  'lab-save': async (d) => {
    const base = findS(d.base);
    const vals = applyChanges(TYPES[base.type].values(base), ui.lab.changes);
    const id = uid('s_');
    const desc = ui.lab.changes.map((c) => `${fieldsFor(base).find((f) => f.key === c.key)?.label} ${c.op === 'pct' ? `${c.amount > 0 ? '+' : ''}${c.amount}%` : c.op === 'mul' ? `×${c.amount}` : c.op === 'add' ? `+${c.amount}` : `= ${c.amount}`}`).join(', ');
    await save((st, now) => {
      const s = structuredClone(base);
      Object.assign(s, { id, name: `${base.name}: what if ${desc}`.slice(0, 80), createdAt: now, updatedAt: now, parentId: base.id });
      for (const [k, v] of Object.entries(vals)) {
        if (v === TYPES[base.type].values(base)[k]) continue;
        const rounded = Math.round(v * 1e6) / 1e6;
        if (s.type === 'custom') { const x = s.model.variables.find((y) => y.key === k); x.value = rounded; x.source = 'assumption'; } else s.inputs[k] = { value: rounded, source: 'assumption' };
      }
      st.scenarios.push(s);
    });
    toast('Saved as a new scenario.');
    location.hash = `#/r/${id}`;
  },
  'open-comparison': (d) => { ui.compare.ids = [...store.state.comparisons.find((c) => c.id === d.id).scenarioIds]; render(); },
  'delete-comparison': (d) => save((st) => { st.comparisons = st.comparisons.filter((c) => c.id !== d.id); }),
  'new-tree': async () => {
    const id = uid('t_');
    const n = () => uid('n_');
    await save((st, now) => {
      st.trees.push({ id, name: 'Start the business?', createdAt: now, updatedAt: now, root: { id: n(), type: 'decision', label: 'Decide', children: [
        { id: n(), type: 'chance', label: 'Start the business', children: [
          { id: n(), type: 'outcome', label: 'Demand as hoped', p: 0.5, value: 100000 },
          { id: n(), type: 'outcome', label: 'Demand weak', p: 0.5, value: -30000 },
        ] },
        { id: n(), type: 'outcome', label: 'Keep current plan', value: 20000 },
      ] } });
    });
    location.hash = `#/tree/${id}`;
  },
  'tree-add': (d) => editTree((root) => { const node = findNode(root, d.tn); node.children = node.children || []; node.children.push({ id: uid('n_'), type: 'outcome', label: 'New branch', value: 0, ...(node.type === 'chance' ? { p: 0 } : {}) }); }),
  'tree-del': (d) => editTree((root) => { const parent = findParent(root, d.tn); parent.children = parent.children.filter((c) => c.id !== d.tn); }),
  'rename-tree': (d) => openModal(() => textModal('Rename tree', 'rename-tree', html`<input type="hidden" name="id" value="${d.id}"><label class="f">Name<input class="f-input" name="name" required maxlength="60" value="${store.state.trees.find((t) => t.id === d.id).name}"></label>`)),
  'delete-tree': (d) => openModal(() => confirmModal('Delete decision tree?', 'This cannot be undone.', 'deleteTree', { id: d.id }, 'Delete', true)),
  'history-type': (d) => { ui.history.type = d.type; render(); },
  'delete-run': (d) => save((st) => { st.runs = st.runs.filter((r) => r.id !== d.id); }),

  'download-model': (d) => modelOp('Downloading', async (signal) => {
    const entry = CATALOG.find((c) => c.id === d.id);
    const id = uid('m_');
    const { meta, bytes } = await downloadModel(entry, id, progress, signal);
    await registerModel({ id, name: entry.name, size: bytes, meta, source: 'download', catalogId: entry.id, license: entry.license });
  }),
  'cancel-model-op': () => ui.abort?.abort(),
  'load-model': (d) => loadModel(d.id),
  'unload-model': async () => { await llama.unload(); ui.ai = { ...ui.ai, ready: false, name: '', modelId: null, info: null }; render(); },
  'remove-model': (d) => openModal(() => confirmModal('Remove model?', 'The model file will be deleted from this device. You can import or download it again later.', 'removeModel', { id: d.id }, 'Remove', true)),
  'export-json': () => download(`whatif-backup-${new Date().toISOString().slice(0, 10)}.json`, store.exportJSON()),
  'export-reports': () => download('whatif-reports.md', store.state.scenarios.map((s) => scenarioReport(s, fmtValue)).join('\n\n---\n\n'), 'text/markdown'),
  'export-csv': () => {
    const rows = store.state.scenarios.filter((s) => s.type === 'business' && readiness(s).ready).map((s) => { try { return businessCSV(s); } catch { return ''; } }).filter(Boolean);
    download('whatif-business-projections.csv', rows.map((r, i) => (i ? r.split('\n').slice(1).join('\n') : r)).join('\n'), 'text/csv');
  },
  'delete-all': () => openModal(() => deleteAllModal()),
  reload: () => location.reload(),
};

const findNode = (n, id) => (n.id === id ? n : (n.children || []).reduce((f, c) => f || findNode(c, id), null));
const findParent = (n, id) => ((n.children || []).some((c) => c.id === id) ? n : (n.children || []).reduce((f, c) => f || findParent(c, id), null));
async function editTree(fn, { quiet = false } = {}) {
  const id = parseRoute().id;
  await save((st, now) => { const t = st.trees.find((x) => x.id === id); fn(t.root); t.updatedAt = now; }, { quiet });
  if (quiet) render();
}

/** Streaming output patches one element so buttons (like Stop) stay in place under the user's finger. */
function patchText(selector, text) {
  const el = document.querySelector(selector);
  if (el) { el.textContent = text; return; }
  throttledRender();
}

let renderQueued = false;
function throttledRender() {
  if (renderQueued) return;
  renderQueued = true;
  setTimeout(() => { renderQueued = false; render(); }, 120);
}

// ---------- models ----------

function progress(loaded, total) {
  ui.models.loaded = loaded;
  ui.models.total = total;
  throttledRender();
}

async function modelOp(label, fn) {
  if (!opfsAvailable()) { ui.models.error = 'This browser does not provide private file storage for models.'; render(); return; }
  ui.abort = new AbortController();
  ui.models = { busy: label, loaded: 0, total: 0, error: '' };
  render();
  try {
    await fn(ui.abort.signal);
    toast('Model ready to load.');
  } catch (e) {
    ui.models.error = e.name === 'AbortError' ? 'Cancelled. Partial file removed.' : `${label} failed: ${e.message}`;
  }
  ui.models.busy = '';
  ui.storage = await storageEstimate();
  render();
}

async function registerModel(rec) {
  const assessment = assessModel(rec.meta, rec.size, store.state.settings.ai.nCtx, navigator.deviceMemory);
  await save((st, now) => { st.models.push({ ...rec, assessment, addedAt: now, license: rec.license || rec.meta.license || null }); });
}

async function loadModel(id) {
  const rec = store.state.models.find((m) => m.id === id);
  ui.ai = { ...ui.ai, loading: true, error: '' };
  render();
  try {
    const file = await getModelFile(id);
    const info = await llama.load(file, { name: rec.name, nCtx: store.state.settings.ai.nCtx });
    ui.ai = { ready: true, loading: false, name: rec.name, modelId: id, info, error: '' };
    await save((st) => { st.settings.ai.modelId = id; });
    toast(`${rec.name} loaded.`);
  } catch (e) {
    ui.ai = { ready: false, loading: false, name: '', modelId: null, info: null, error: `${e.message} The app keeps working with the rule-based assistant.` };
  }
  render();
}

// ---------- events ----------

document.addEventListener('click', (e) => {
  const el = e.target.closest('[data-action]');
  if (!el || el.disabled || el.tagName === 'INPUT') return;
  const fn = actions[el.dataset.action];
  if (!fn) return;
  e.preventDefault();
  Promise.resolve(fn({ ...el.dataset }, el)).catch((err) => { if (err?.message) console.warn(err); });
});

document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape' && ui.abort && !dialog.open) ui.abort.abort();
});

let typingTimer;
document.addEventListener('input', (e) => {
  const t = e.target;
  const id = parseRoute().id;
  const debounce = (fn) => { clearTimeout(typingTimer); typingTimer = setTimeout(fn, 250); };
  if (t.matches('textarea[name=text]')) { ui.create.text = t.value; return; }
  if (t.dataset.field) {
    const key = t.dataset.field;
    return debounce(() => editScenario(id, (s) => {
      const src = s.inputs[key].source;
      s.inputs[key] = { value: parseNum(t.value), source: src === 'example' || src === 'ai' ? 'assumption' : src };
    }).then(() => {
      const sel = document.querySelector(`[data-src="${key}"]`);
      const src = findS(id).inputs[key].source;
      if (sel && sel.value !== src) { sel.value = src; sel.className = `src src-${{ fact: 'fact', assumption: 'assume', example: 'example', ai: 'ai' }[src]}`; }
      document.querySelector(`[data-row="${key}"]`)?.classList.remove('is-ai');
    }));
  }
  if (t.dataset.var !== undefined) {
    const i = +t.dataset.var; const k = t.dataset.vk;
    return debounce(() => editScenario(id, (s) => {
      const v = s.model.variables[i];
      if (k === 'value') { v.value = parseNum(t.value); if (v.source === 'example' || v.source === 'ai') v.source = 'assumption'; } else v[k] = t.value.trim();
    }));
  }
  if (t.dataset.out !== undefined) {
    const i = +t.dataset.out; const k = t.dataset.ok;
    return debounce(() => editScenario(id, (s) => { s.model.outputs[i][k] = t.value.trim(); }));
  }
  if (t.dataset.oc !== undefined) {
    const i = +t.dataset.oc; const k = t.dataset.ock;
    if (k === 'frequency') return;
    return debounce(() => editScenario(id, (s) => { s.otherCosts[i][k] = k === 'name' ? t.value : Number(t.value); }));
  }
  if (t.dataset.ms !== undefined) {
    const i = +t.dataset.ms; const k = t.dataset.msk;
    return debounce(() => editScenario(id, (s) => { s.milestones[i][k] = k === 'name' ? t.value : Number(t.value); }));
  }
  if (t.dataset.spread) return debounce(() => editScenario(id, (s) => { s.spread[t.dataset.spread][t.dataset.sk] = Number(t.value) || 0; }));
  if (t.matches('[data-notes]')) return debounce(() => editScenario(id, (s) => { s.notes = t.value; }));
  if (t.dataset.labChange !== undefined && t.dataset.lk === 'amount') { ui.lab.changes[+t.dataset.labChange].amount = Number(t.value); return debounce(render); }
  if (t.matches('[data-history-q]')) { ui.history.q = t.value; return debounce(render); }
  if (t.dataset.tn && (t.dataset.tk === 'label' || t.dataset.tk === 'value' || t.dataset.tk === 'p')) {
    return debounce(() => editTree((root) => {
      const n = findNode(root, t.dataset.tn);
      if (t.dataset.tk === 'label') n.label = t.value.slice(0, 60);
      else if (t.dataset.tk === 'value') n.value = parseNum(t.value);
      else n.p = Number(t.value) / 100;
    }, { quiet: true }));
  }
});

document.addEventListener('change', async (e) => {
  const t = e.target;
  const id = parseRoute().id;
  if (t.dataset.src) {
    const key = t.dataset.src;
    return editScenario(id, (s) => { if (key.startsWith('var:')) s.model.variables[+key.slice(4)].source = t.value; else s.inputs[key].source = t.value; }, { full: true });
  }
  if (t.dataset.oc !== undefined && t.dataset.ock === 'frequency') return editScenario(id, (s) => { s.otherCosts[+t.dataset.oc].frequency = t.value; }, { full: true });
  if (t.dataset.var !== undefined && t.dataset.vk === 'unit') return editScenario(id, (s) => { s.model.variables[+t.dataset.var].unit = t.value; });
  if (t.dataset.out !== undefined && t.dataset.ok === 'unit') return editScenario(id, (s) => { s.model.outputs[+t.dataset.out].unit = t.value; });
  if (t.matches('[data-start]')) return editScenario(id, (s) => { const d = new Date(`${t.value}T00:00:00`).getTime(); if (Number.isFinite(d)) s.startDate = d; });
  if (t.matches('[data-lab-base]')) { ui.lab = { baseId: t.value, changes: [] }; return render(); }
  if (t.dataset.labChange !== undefined && t.dataset.lk !== 'amount') { ui.lab.changes[+t.dataset.labChange][t.dataset.lk] = t.value; return render(); }
  if (t.dataset.compare) {
    const ids = ui.compare.ids.filter((x) => x !== t.dataset.compare);
    if (t.checked) { if (ids.length >= 4) { t.checked = false; toast('Compare up to 4 scenarios.', 'err'); return; } ids.push(t.dataset.compare); }
    ui.compare.ids = ids;
    return render();
  }
  if (t.dataset.tn && (t.dataset.tk === 'type' || t.dataset.tk === 'link')) {
    return editTree((root) => {
      const n = findNode(root, t.dataset.tn);
      if (t.dataset.tk === 'link') {
        if (t.value) { const [scenarioId, metric] = t.value.split('|'); n.link = { scenarioId, metric }; } else delete n.link;
      } else {
        n.type = t.value;
        if (t.value === 'outcome') { n.children = []; n.value ??= 0; } else if (!n.children?.length) n.children = [{ id: uid('n_'), type: 'outcome', label: 'Branch', value: 0, ...(t.value === 'chance' ? { p: 1 } : {}) }];
        if (t.value === 'chance') { const k = n.children.length; n.children.forEach((c) => { c.p ??= 1 / k; }); }
      }
    });
  }
  if (t.dataset.action === 'import-model') {
    const file = t.files[0];
    t.value = '';
    if (!file) return;
    return modelOp('Importing', async (signal) => {
      const mid = uid('m_');
      const { meta, bytes } = await importModelFile(file, mid, progress, signal);
      await registerModel({ id: mid, name: file.name.replace(/\.gguf$/i, ''), size: bytes, meta, source: 'import' });
    });
  }
  if (t.dataset.action === 'import-json') {
    const file = t.files[0];
    t.value = '';
    if (!file) return;
    if (file.size > 50 * 1024 * 1024) return toast('File is too large.', 'err');
    try { await store.importJSON(await file.text()); toast('Backup restored.'); } catch (err) { toast(err.message, 'err'); }
  }
});

// ---------- forms ----------

const forms = {
  interpret: async (fd) => {
    const text = String(fd.get('text') || '').trim();
    ui.create.text = text;
    if (text.length < 5) { ui.create.error = 'Describe the situation in a few words first.'; return render(); }
    const provider = llama.status().ready ? llama : rules;
    ui.abort = new AbortController();
    ui.create = { ...ui.create, busy: true, stream: '', error: '', result: null };
    render();
    try {
      const r = await provider.interpret(text, { signal: ui.abort.signal, onToken: (_, all) => { ui.create.stream = all; patchText('pre.stream', all); } });
      ui.create.result = { ...r, provider: provider.id };
      if (!r.ok && provider === llama) {
        const fallback = await rules.interpret(text);
        ui.create.result = { ...fallback, provider: 'rules' };
        ui.create.error = `The AI output did not pass validation (${r.errors.join('; ')}), so the rule-based assistant was used instead.`;
      }
    } catch (e) {
      if (e instanceof CancelledError) ui.create.error = 'Cancelled.';
      else {
        ui.create.result = { ...(await rules.interpret(text)), provider: 'rules' };
        ui.create.error = `Local AI failed (${e.message}). Used the rule-based assistant instead.`;
      }
    }
    ui.create.busy = false;
    render();
  },
  rename: async (fd, form, err) => {
    const name = String(fd.get('name')).trim();
    if (!name) { err.textContent = 'Name is required.'; return false; }
    await save((st, now) => { const s = st.scenarios.find((x) => x.id === fd.get('id')); s.name = name.slice(0, 80); s.updatedAt = now; });
    return true;
  },
  'rename-tree': async (fd, form, err) => {
    const name = String(fd.get('name')).trim();
    if (!name) { err.textContent = 'Name is required.'; return false; }
    await save((st) => { st.trees.find((x) => x.id === fd.get('id')).name = name.slice(0, 60); });
    return true;
  },
  confirm: async (fd, form) => {
    const p = JSON.parse(form.dataset.payload);
    const kind = form.dataset.confirm;
    if (kind === 'deleteScenario') {
      await save((st) => { st.scenarios = st.scenarios.filter((s) => s.id !== p.id); st.runs = st.runs.filter((r) => r.scenarioId !== p.id); });
      ui.compare.ids = ui.compare.ids.filter((x) => x !== p.id);
      location.hash = '#/history';
    } else if (kind === 'deleteTree') {
      await save((st) => { st.trees = st.trees.filter((t) => t.id !== p.id); });
      location.hash = '#/trees';
    } else if (kind === 'removeModel') {
      if (ui.ai.modelId === p.id) { await llama.unload(); ui.ai = { ...ui.ai, ready: false, modelId: null, name: '' }; }
      await deleteModelFile(p.id);
      await save((st) => { st.models = st.models.filter((m) => m.id !== p.id); if (st.settings.ai.modelId === p.id) st.settings.ai.modelId = null; });
      ui.storage = await storageEstimate();
      toast('Model removed.');
    }
    return true;
  },
  'save-comparison': async (fd) => {
    await save((st, now) => { st.comparisons.push({ id: uid('c_'), name: String(fd.get('name')).trim().slice(0, 60) || 'Comparison', scenarioIds: [...ui.compare.ids], createdAt: now }); });
    toast('Comparison saved.');
  },
  mc: async (fd, form, err, submitter) => {
    const s = findS(parseRoute().id);
    const fields = fieldsFor(s).filter((f) => f.unit !== 'months');
    const dists = {};
    for (const f of fields) {
      const type = fd.get(`type:${f.key}`);
      if (!type || type === 'none') continue;
      const g = (k) => (fd.get(`${k}:${f.key}`) === null || fd.get(`${k}:${f.key}`) === '' ? undefined : Number(fd.get(`${k}:${f.key}`)));
      dists[f.key] = type === 'uniform' ? { type, min: g('min'), max: g('max') } : type === 'triangular' ? { type, min: g('min'), mode: g('mode'), max: g('max') } : { type, mean: g('mean'), sd: g('sd') };
      // sensible starting ranges around the current value, clearly editable
      const cur = Number(TYPES[s.type].values(s)[f.key]);
      if (type !== 'normal' && dists[f.key].min === undefined) Object.assign(dists[f.key], { min: cur * 0.7, max: cur * 1.3, ...(type === 'triangular' ? { mode: cur } : {}) });
      if (type === 'normal' && dists[f.key].mean === undefined) Object.assign(dists[f.key], { mean: cur, sd: Math.abs(cur) * 0.15 });
    }
    const mc = { metric: fd.get('metric'), trials: Math.round(Number(fd.get('trials'))), seed: Math.round(Number(fd.get('seed'))), threshold: Number(fd.get('threshold')) || 0, dists };
    await save((st) => { st.scenarios.find((x) => x.id === s.id).mc = mc; }, { quiet: true });
    if (submitter?.value !== 'run') { render(); return; }
    ui.mc = { id: s.id, busy: true, result: null, error: '' };
    render();
    await new Promise((r) => setTimeout(r, 30));
    try {
      ui.mc.result = runMonteCarlo({ trials: mc.trials, seed: mc.seed, distributions: dists, baseValues: TYPES[s.type].values(findS(s.id)), threshold: mc.threshold, evaluate: (v) => runScenario(s, v).summary[mc.metric] });
    } catch (e2) { ui.mc.error = e2.message; }
    ui.mc.busy = false;
    render();
  },
  settings: async (fd) => {
    await save((st) => {
      st.settings.currency = String(fd.get('currency'));
      st.settings.locale = String(fd.get('locale'));
      st.settings.reduceMotion = fd.get('reduceMotion') === '1';
      st.settings.ai.nCtx = Number(fd.get('nCtx'));
      st.settings.ai.autoLoad = fd.get('autoLoad') === 'on';
    });
    toast('Settings saved.');
  },
  'delete-all': async (fd, form, err) => {
    if (fd.get('confirm') !== 'DELETE') { err.textContent = 'Type DELETE in capitals to confirm.'; return false; }
    await llama.unload();
    for (const m of store.state.models) { try { await deleteModelFile(m.id); } catch { /* keep going */ } }
    await store.wipe();
    ui.ai = { ready: false, loading: false, name: '', modelId: null, info: null, error: '' };
    ui.compare.ids = [];
    location.hash = '#/home';
    toast('All data deleted.');
    return true;
  },
};

document.addEventListener('submit', async (e) => {
  const form = e.target.closest('form[data-form]');
  if (!form) return;
  e.preventDefault();
  const fn = forms[form.dataset.form];
  if (!fn) return;
  const err = form.querySelector('[data-err]');
  if (err) err.textContent = '';
  try {
    const done = await fn(new FormData(form), form, err, e.submitter);
    if (done && dialog.contains(form)) closeModal();
  } catch (x) { if (err) err.textContent = x.message; }
});

// ---------- boot ----------

async function boot() {
  try {
    await store.init();
    store.subscribe(() => { if (!ui.silent) render(); });
    window.addEventListener('hashchange', () => { closeModal(); render(); window.scrollTo(0, 0); if (parseRoute().name === 'models') storageEstimate().then((s) => { ui.storage = s; render(); }); });
    render();
    const { autoLoad, modelId } = store.state.settings.ai;
    if (autoLoad && modelId && store.state.models.some((m) => m.id === modelId)) loadModel(modelId);
  } catch (err) {
    app.innerHTML = html`<div class="empty"><b>Could not open your data</b><p>${err.message}</p><p class="small">Nothing was changed. If storage is blocked (private mode), try a normal window.</p><button class="btn primary" data-action="reload">Retry</button></div>`.toString();
  }
}

if ('serviceWorker' in navigator && !window.AndroidBridge && location.protocol !== 'file:') {
  navigator.serviceWorker.register('sw.js').catch(() => {});
}
window.__whatif = { store, llama, ui };
boot();

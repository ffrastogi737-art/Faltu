// UI controller: routing, event delegation, modals, toasts. Business rules stay in core/.

import { createStore, indexedDbAdapter } from '../data/store.js';
import { recommend } from '../core/recommender.js';
import { templatesFor } from '../core/templates.js';
import { dayKey } from '../core/time.js';
import { planGoal } from '../ai/provider.js';
import { html } from './html.js';
import { icon } from './icons.js';
import * as V from './views.js';

const KEY_SECRET = 'anthropicKey';
const app = document.getElementById('app');
const dialog = document.getElementById('modal');
const toasts = document.getElementById('toasts');

const store = createStore(indexedDbAdapter());
const ui = { questTab: 'active', suggestions: null, plan: null, planning: false, modalView: null, pendingPlan: null, hasKey: false };
const ROUTES = new Set(V.ROUTES);
const route = () => { const r = location.hash.replace(/^#\/?/, ''); return ROUTES.has(r) ? r : 'home'; };

// ---------- rendering ----------

function render() {
  const s = store.state;
  const now = Date.now();
  document.documentElement.classList.toggle('reduce-motion', Boolean(s.settings.reduceMotion));
  if (!s.profile) { app.innerHTML = V.onboarding(s); return; }
  const r = route();
  if (r === 'quests') ui.suggestions = recommend(s, now);
  const view = { home: V.home, quests: V.quests, skills: V.skills, bosses: V.bosses, achievements: V.achievements, stats: V.stats, profile: V.profile }[r];
  const scroll = window.scrollY;
  app.innerHTML = V.shell(s, r, view(s, ui, now));
  window.scrollTo(0, scroll);
  if (dialog.open && ui.modalView) dialog.innerHTML = ui.modalView();
}

function openModal(view, { live = false } = {}) {
  ui.modalView = live ? view : null;
  dialog.innerHTML = view();
  if (!dialog.open) dialog.showModal();
  dialog.querySelector('input:not([type=hidden]),select,textarea')?.focus();
}
function closeModal() { ui.modalView = null; if (dialog.open) dialog.close(); }
dialog.addEventListener('close', () => { ui.modalView = null; });

const TOAST_ICON = { xp: 'bolt', ach: 'achievements', err: 'info', '': 'check' };
function toast(message, cls = '', ic = TOAST_ICON[cls]) {
  const el = document.createElement('div');
  el.className = `toast ${cls}`;
  el.setAttribute('role', 'status');
  el.innerHTML = `<span class="t-ic">${icon(ic, 18)}</span>`;
  el.append(Object.assign(document.createElement('span'), { textContent: message }));
  toasts.append(el);
  while (toasts.children.length > 3) toasts.firstChild.remove();
  setTimeout(() => el.remove(), cls === 'err' ? 5000 : 3200);
}

function showEvents(events) {
  for (const e of events) {
    if (e.type === 'questCompleted') toast(`${e.title} · +${e.xp} XP${e.tapered ? ' (daily taper: rest counts too)' : ''}`, 'xp', 'check');
    else if (e.type === 'stageCleared') toast(`Stage cleared: ${e.title}`, 'xp', 'sword');
    else if (e.type === 'skillLevelUp') toast(`${e.name} reached level ${e.to}`, 'xp', 'arrowUp');
    else if (e.type === 'milestone') toast(`${e.name} milestone: level ${e.level}`, 'ach', 'star');
    else if (e.type === 'achievement') toast(`Badge unlocked: ${e.name}`, 'ach');
    else if (e.type === 'info') toast(e.message);
  }
  if (events.some((e) => e.type === 'levelUp' || e.type === 'bossDefeated')) openModal(() => V.celebrate(events));
}

/** Single path for every state change: dispatch, show feedback, surface errors where the user is looking. */
async function run(action, payload, errEl) {
  try {
    const events = await store.dispatch(action, payload);
    showEvents(events);
    return events;
  } catch (err) {
    if (errEl) errEl.textContent = err.message; else toast(err.message, 'err');
    if (err.name !== 'GameError') console.error(err);
    return null;
  }
}

// ---------- helpers ----------

const val = (fd, k) => (fd.get(k) ?? '').toString();
const findQuest = (id) => store.state.quests.find((q) => q.id === id);

function questPayload(fd, form) {
  const type = val(fd, 'type');
  const date = val(fd, 'dueAt');
  const [bossId, stageId] = val(fd, 'bossStage').split('|');
  const prereq = form.querySelector('[name=prerequisites]');
  return {
    title: val(fd, 'title'),
    description: val(fd, 'description'),
    criteria: val(fd, 'criteria'),
    type,
    skillId: val(fd, 'skillId') || null,
    goalId: val(fd, 'goalId') || null,
    difficulty: Number(val(fd, 'difficulty')),
    estimatedMinutes: Number(val(fd, 'estimatedMinutes')),
    repeats: fd.get('repeats') === 'on',
    dueAt: date && (type === 'custom' || type === 'longterm') ? new Date(`${date}T12:00:00`).getTime() : null,
    steps: val(fd, 'steps').split('\n').map((x) => x.trim()).filter(Boolean),
    prerequisites: prereq ? [...prereq.selectedOptions].map((o) => o.value) : [],
    bossId: bossId || null,
    stageId: stageId || null,
  };
}

function download(name, text) {
  const url = URL.createObjectURL(new Blob([text], { type: 'application/json' }));
  const a = Object.assign(document.createElement('a'), { href: url, download: name });
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

// ---------- click actions ----------

const actions = {
  'close-modal': closeModal,
  reload: () => location.reload(),
  complete: (d) => run('completeQuest', { id: d.id }),
  'toggle-step': (d) => run('toggleStep', { questId: d.qid, stepId: d.sid }),
  'edit-quest': (d) => openModal(() => V.questForm(store.state, findQuest(d.id))),
  postpone: (d) => run('postponeQuest', { id: d.id, days: 1 }),
  abandon: (d) => openModal(() => V.confirmForm('Abandon quest?', `“${findQuest(d.id).title}” will move to Missed & abandoned. You keep all XP and can restore it later.`, 'abandonQuest', { id: d.id }, 'Abandon')),
  restore: (d) => run('reactivateQuest', { id: d.id }),
  'new-quest': (d) => openModal(() => V.questForm(store.state, null, d.boss ? { bossId: d.boss, stageId: d.stage, type: 'custom' } : {})),
  'quest-tab': (d) => { ui.questTab = d.tab; render(); },
  'accept-suggestion': async (d) => {
    const sg = ui.suggestions?.suggestions[Number(d.i)];
    if (sg) await run('createQuest', { ...sg.draft, source: 'recommendation' });
  },
  'open-planner': () => { ui.plan = null; openModal(() => V.plannerForm(store.state, ui)); },
  'skill-detail': (d) => openModal(() => V.skillDetail(store.state, d.id), { live: true }),
  'new-skill': () => openModal(() => V.newSkillForm()),
  'toggle-skill': (d) => run('updateSkill', { id: d.id, enabled: !store.state.skills.find((s) => s.id === d.id).enabled }),
  'accept-challenge': (d) => {
    const skill = store.state.skills.find((s) => s.id === d.skill);
    const t = templatesFor(skill).find((x) => x.d === Number(d.d));
    return run('createQuest', { title: t.t, criteria: t.c, difficulty: t.d, estimatedMinutes: t.m, skillId: skill.id, type: 'custom', source: 'recommendation' });
  },
  'new-boss': () => { ui.pendingPlan = null; openModal(() => V.bossForm(store.state)); },
  'boss-detail': (d) => openModal(() => V.bossDetail(store.state, d.id), { live: true }),
  'add-stage-row': (d, el) => {
    const box = el.closest('form').querySelector('[data-stages]');
    if (box.children.length >= 10) return toast('At most 10 stages', 'err');
    box.insertAdjacentHTML('beforeend', V.stageRow({}, box.children.length).toString());
  },
  'remove-stage-row': (d, el) => {
    const box = el.closest('[data-stages]');
    if (box.children.length <= 2) return toast('A boss needs at least 2 stages', 'err');
    el.closest('[data-stage-row]').remove();
  },
  'clear-stage': (d) => {
    const boss = store.state.bosses.find((b) => b.id === d.boss);
    openModal(() => V.clearStageForm(boss, boss.stages.find((s) => s.id === d.stage)));
  },
  'boss-status': (d) => run('setBossStatus', { id: d.id, status: d.status }),
  'new-achievement': () => openModal(() => V.achievementForm(store.state)),
  'new-goal': () => openModal(() => V.goalForm(store.state)),
  'goal-status': (d) => run('updateGoal', { id: d.id, status: d.status }),
  export: () => {
    download(`life-rpg-${dayKey(Date.now())}.json`, store.exportData());
    toast('Export downloaded. It contains all your progress, but not your API key.');
  },
  'delete-all': () => openModal(() => V.deleteForm()),
  'forget-key': async () => { await store.setSecret(KEY_SECRET, null); ui.hasKey = false; render(); toast('API key removed from this device.'); },
};

document.addEventListener('click', (e) => {
  const el = e.target.closest('[data-action]');
  if (!el || el.disabled || el.dataset.action === 'import') return;
  const fn = actions[el.dataset.action];
  if (!fn) return;
  if (el.tagName !== 'INPUT') e.preventDefault();
  fn({ ...el.dataset }, el);
});

document.addEventListener('keydown', (e) => {
  const el = e.target.closest?.('[role=button][data-action]');
  if (el && (e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); el.click(); }
});

document.addEventListener('input', (e) => {
  const m = e.target.dataset?.mirror;
  if (m) e.target.closest('form').querySelector(`[data-out="${m}"]`).textContent = e.target.value;
});

document.addEventListener('change', async (e) => {
  if (e.target.dataset?.action !== 'import') return;
  const file = e.target.files[0];
  e.target.value = '';
  if (!file) return;
  if (file.size > 20 * 1024 * 1024) return toast('File is too large', 'err');
  try {
    const fixes = await store.importData(await file.text());
    toast(fixes.length ? `Imported. Repaired ${fixes.length} inconsistent total(s) from the XP ledger.` : 'Import complete.');
  } catch (err) { toast(err.message, 'err'); }
});

// ---------- forms ----------

const forms = {
  onboarding: (fd) => run('createProfile', {
    name: val(fd, 'name'), avatar: val(fd, 'avatar'), focusSkillIds: fd.getAll('focus').slice(0, 4),
    difficultyMode: val(fd, 'difficultyMode'), dailyMinutes: Number(val(fd, 'dailyMinutes')),
  }),
  quest: (fd, form, err) => {
    const p = questPayload(fd, form);
    const id = val(fd, 'id');
    return run(id ? 'editQuest' : 'createQuest', id ? { ...p, id } : p, err);
  },
  skill: (fd, form, err) => {
    const id = val(fd, 'id');
    const p = { name: val(fd, 'name'), icon: val(fd, 'icon') || '◆', color: val(fd, 'color') };
    return run(id ? 'updateSkill' : 'createSkill', id ? { ...p, id } : p, err).then((ev) => (ev && id ? (toast('Skill saved.'), null) : ev));
  },
  goal: (fd, form, err) => run('createGoal', { title: val(fd, 'title'), description: val(fd, 'description'), skillId: val(fd, 'skillId') || null }, err),
  boss: async (fd, form, err) => {
    const titles = fd.getAll('stageTitle');
    const objectives = fd.getAll('stageObjective');
    const events = await run('createBoss', {
      title: val(fd, 'title'), description: val(fd, 'description'), skillId: val(fd, 'skillId') || null,
      difficulty: Number(val(fd, 'difficulty')),
      stages: titles.map((t, i) => ({ title: t, objective: objectives[i] })).filter((s) => s.title.trim()),
    }, err);
    if (!events) return null;
    const bossId = events.find((e) => e.bossId)?.bossId;
    const plan = ui.pendingPlan;
    ui.pendingPlan = null;
    if (plan?.length && bossId) {
      const boss = store.state.bosses.find((b) => b.id === bossId);
      const drafts = plan.map(({ stageIndex, ...dr }) => {
        const stage = boss.stages[stageIndex];
        return stage ? { ...dr, bossId, stageId: stage.id } : dr;
      });
      await run('acceptDrafts', { drafts, source: plan.source });
    }
    return events;
  },
  achievement: (fd, form, err) => run('addCustomAchievement', {
    name: val(fd, 'name'), icon: val(fd, 'icon'), description: val(fd, 'description'),
    metric: val(fd, 'metric'), threshold: Number(val(fd, 'threshold')), skillId: val(fd, 'skillId'),
  }, err),
  profile: (fd, form, err) => run('updateProfile', { name: val(fd, 'name'), avatar: val(fd, 'avatar'), focusSkillIds: fd.getAll('focus').slice(0, 4) }, err)
    .then((ev) => ev && toast('Character saved.')),
  settings: async (fd, form, err) => {
    let notify = fd.get('notify') === 'on';
    if (notify && 'Notification' in window && Notification.permission !== 'granted') {
      notify = (await Notification.requestPermission()) === 'granted';
      if (!notify) toast('Notifications were not allowed, so reminders stay off.', 'err');
    } else if (notify && !('Notification' in window)) { notify = false; toast('This browser does not support notifications.', 'err'); }
    const ev = await run('updateSettings', {
      difficultyMode: val(fd, 'difficultyMode'), dailyMinutes: Number(val(fd, 'dailyMinutes')),
      curve: { base: Number(val(fd, 'curveBase')), exponent: Number(val(fd, 'curveExp')) },
      notifications: { enabled: notify, time: val(fd, 'notifyTime') || '19:00' },
      reduceMotion: fd.get('reduceMotion') === 'on',
    }, err);
    if (ev) toast('Settings saved.');
  },
  ai: async (fd, form, err) => {
    const ev = await run('updateSettings', { ai: { provider: val(fd, 'provider'), model: val(fd, 'model'), timeoutMs: Number(val(fd, 'timeout')) * 1000 } }, err);
    if (!ev) return;
    const key = val(fd, 'apiKey').trim();
    if (key) { await store.setSecret(KEY_SECRET, key); ui.hasKey = true; }
    render();
    toast('AI settings saved.');
  },
  plan: async (fd) => {
    ui.plan = { goal: val(fd, 'goal'), skillId: val(fd, 'skillId') || null };
    ui.planning = true;
    openModal(() => V.plannerForm(store.state, ui));
    const apiKey = await store.getSecret(KEY_SECRET);
    ui.plan.result = await planGoal(ui.plan.goal, store.state, { skillId: ui.plan.skillId, apiKey });
    ui.planning = false;
    openModal(() => V.plannerForm(store.state, ui));
    return 'keep';
  },
  'plan-accept': async (fd, form, err, submitter) => {
    const r = ui.plan.result;
    const picked = fd.getAll('pick').map(Number).map((i) => r.quests[i]).filter((q) => q?.ok);
    const source = r.source === 'ai' ? 'ai' : 'planner';
    if (submitter?.value === 'boss') {
      ui.pendingPlan = Object.assign(picked.map((q) => ({ ...q.draft, stageIndex: q.stageIndex })), { source });
      openModal(() => V.bossForm(store.state, { title: ui.plan.goal, skillId: picked[0]?.draft.skillId ?? ui.plan.skillId, stages: r.stages }));
      return 'keep';
    }
    if (!picked.length) { toast('Select at least one quest', 'err'); return 'keep'; }
    return run('acceptDrafts', { drafts: picked.map((q) => q.draft), source });
  },
  'clear-stage': (fd, form, err) => {
    if (fd.get('confirm') !== 'on') { err.textContent = 'Please confirm you met the requirement.'; return null; }
    return run('clearStage', { bossId: val(fd, 'bossId'), stageId: val(fd, 'stageId'), note: val(fd, 'note') }, err);
  },
  'delete-all': async (fd, form, err) => {
    if (val(fd, 'confirm') !== 'DELETE') { err.textContent = 'Type DELETE in capitals to confirm.'; return null; }
    await store.wipe();
    ui.hasKey = false;
    location.hash = '#/home';
    return true;
  },
  confirm: (fd, form) => run(form.dataset.confirm, JSON.parse(form.dataset.payload)),
};

document.addEventListener('submit', async (e) => {
  const form = e.target.closest('form[data-form]');
  if (!form) return;
  e.preventDefault();
  const handler = forms[form.dataset.form];
  if (!handler) return;
  const err = form.querySelector('[data-err]');
  if (err) err.textContent = '';
  const buttons = form.querySelectorAll('button[type=submit],button:not([type])');
  buttons.forEach((b) => { b.disabled = true; });
  try {
    const result = await handler(new FormData(form), form, err, e.submitter);
    // a celebration may have replaced the form inside the dialog; only close if the form is still showing
    if (result && result !== 'keep' && dialog.contains(form)) closeModal();
  } finally {
    buttons.forEach((b) => { b.disabled = false; });
  }
});

// ---------- background: day rollover + optional reminder ----------

function tick() {
  const s = store.state;
  if (!s?.profile) return;
  if (dayKey(s.meta.lastRollover ?? 0) !== dayKey(Date.now())) store.dispatch('rollover').catch(() => {});
  const n = s.settings.notifications;
  if (!n.enabled || !('Notification' in window) || Notification.permission !== 'granted') return;
  const now = new Date();
  const hhmm = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
  let last = null;
  try { last = localStorage.getItem('lastReminder'); } catch { /* storage blocked: reminder may repeat once */ }
  const open = s.quests.filter((q) => q.status === 'active' && q.type === 'daily').length;
  if (hhmm >= n.time && last !== dayKey(now) && open) {
    try { localStorage.setItem('lastReminder', dayKey(now)); } catch { /* ignore */ }
    const body = `${open} quest${open > 1 ? 's' : ''} waiting today. Even one small step counts.`;
    navigator.serviceWorker?.ready.then((r) => r.showNotification('LIFE RPG', { body, icon: 'icons/icon-192.png', tag: 'daily' }))
      .catch(() => new Notification('LIFE RPG', { body }));
  }
}

// ---------- boot ----------

async function boot() {
  app.innerHTML = html`<div class="loading"><div><div class="spinner"></div>Loading your adventure…</div></div>`.toString();
  try {
    const { fixes } = await store.init();
    ui.hasKey = Boolean(await store.getSecret(KEY_SECRET));
    store.subscribe(render);
    window.addEventListener('hashchange', () => { closeModal(); render(); document.getElementById('main')?.focus({ preventScroll: true }); window.scrollTo(0, 0); });
    render();
    if (fixes.length) toast(`Repaired ${fixes.length} inconsistent total(s) from your XP history.`);
    setInterval(tick, 60000);
    tick();
  } catch (err) {
    console.error(err);
    app.innerHTML = html`<div class="onboard"><div class="logo">LIFE RPG</div><div class="card"><b>Could not open your save data.</b><p class="muted">${err.message}</p><p class="small muted">Your data has not been changed. If this browser blocks storage (private mode), try a normal window.</p><button class="btn primary" data-action="reload">Retry</button></div></div>`.toString();
  }
}

if ('serviceWorker' in navigator && location.protocol !== 'file:') {
  navigator.serviceWorker.register('sw.js').catch((e) => console.warn('Offline cache unavailable', e));
}
window.__lifeRpg = { store }; // handy for debugging and the end-to-end test
boot();

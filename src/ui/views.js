// Screen templates. Pure functions of (state, ui, now) -> html. No side effects here.

import { html, fmtDate, fmtDateTime, toDateInput } from './html.js';
import { DIFFICULTY, ACHIEVEMENT_METRICS, SKILL_MILESTONES, LIMITS } from '../core/config.js';
import { levelInfo } from '../core/progression.js';
import { computeMetrics, allAchievementDefs, metricValue } from '../core/achievements.js';
import { buildStats, streaks } from '../core/analytics.js';
import { templatesFor } from '../core/templates.js';
import { endOfDay } from '../core/time.js';

const AVATARS = ['🧙', '🧝', '🥷', '🧑‍🚀', '🦸', '🧛', '🤖', '🐉', '🦊', '🦉'];
export const NAV = [
  ['home', '⌂', 'Home'], ['quests', '📜', 'Quests'], ['skills', '✦', 'Skills'], ['bosses', '☠', 'Bosses'],
  ['achievements', '🏆', 'Awards'], ['stats', '📈', 'Stats'], ['profile', '⚙', 'Profile'],
];

const skillOf = (s, id) => s.skills.find((k) => k.id === id);
const pips = (d) => html`<span class="pips" title="${DIFFICULTY[d].label}" aria-label="Difficulty ${d} of 5">${[1, 2, 3, 4, 5].map((i) => html`<i class="${i <= d ? 'on' : ''}"></i>`)}</span>`;
const bar = (p, cls = '') => html`<div class="bar ${cls}" role="progressbar" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${Math.round(p * 100)}"><i style="width:${(Math.max(0, Math.min(1, p)) * 100).toFixed(1)}%"></i></div>`;
const empty = (icon, text, action = '') => html`<div class="empty card"><div class="ei">${icon}</div><p>${text}</p>${action}</div>`;

// ---------- shell ----------

export function shell(state, route, body) {
  const p = state.profile;
  const lv = levelInfo(p.lifetimeXp, state.settings.curve);
  return html`
    <header class="topbar">
      <a href="#/profile" class="avatar" aria-label="Profile">${p.avatar}</a>
      <div class="who">
        <div class="name">${p.name}</div>
        ${bar(lv.progress, 'thin')}
        <div class="xpline">${lv.currentXp} / ${lv.needed} XP · ${lv.toNext} to Lv ${lv.level + 1}</div>
      </div>
      <div class="lvl" title="Character level"><div><small>LV</small>${lv.level}</div></div>
    </header>
    <main id="main" tabindex="-1">${body}</main>
    <nav class="nav" aria-label="Main">
      ${NAV.map(([id, ic, label]) => html`<a href="#/${id}" ${route === id ? html`aria-current="page"` : ''}><span class="ic" aria-hidden="true">${ic}</span>${label}</a>`)}
    </nav>`;
}

export function onboarding(state) {
  return html`
    <div class="onboard">
      <div class="logo">LIFE RPG</div>
      <p class="tag">Level up your real life. Offline, private, no account needed.</p>
      <form class="card glow" data-form="onboarding">
        <label class="f">Character name<input name="name" required maxlength="40" autocomplete="nickname" placeholder="e.g. Ada"></label>
        <div class="f"><span class="small muted">AVATAR</span>
          <div class="avatars">${AVATARS.map((a, i) => html`<label><input type="radio" name="avatar" value="${a}" ${i === 0 ? html`checked` : ''}>${a}</label>`)}</div>
        </div>
        <fieldset><legend>Focus skills (up to 4)</legend>
          <div class="grid2">${state.skills.map((s) => html`<label class="check small"><input type="checkbox" name="focus" value="${s.id}">${s.icon} ${s.name}</label>`)}</div>
        </fieldset>
        <div class="f"><span class="small muted">CHALLENGE LEVEL</span>${modeSeg(state.settings.difficultyMode)}</div>
        <label class="f">Time available per day: <b class="mono" data-out="dm">${state.settings.dailyMinutes}</b> min
          <input type="range" name="dailyMinutes" min="10" max="240" step="5" value="${state.settings.dailyMinutes}" data-mirror="dm"></label>
        <button class="btn primary block" type="submit">Begin adventure</button>
      </form>
    </div>`;
}

function modeSeg(current) {
  return html`<div class="seg" role="radiogroup">${['relaxed', 'balanced', 'challenging'].map((m) => html`<label><input type="radio" name="difficultyMode" value="${m}" ${m === current ? html`checked` : ''}>${m[0].toUpperCase() + m.slice(1)}</label>`)}</div>`;
}

// ---------- home ----------

export function home(state, ui, now) {
  const p = state.profile;
  const lv = levelInfo(p.lifetimeXp, state.settings.curve);
  const st = streaks(state, now);
  const m = computeMetrics(state);
  const today = state.quests.filter((q) => q.status === 'active' && (q.type === 'daily' || (q.dueAt && q.dueAt <= endOfDay(now))));
  const boss = state.bosses.find((b) => b.status === 'active');
  const recent = [...state.achievements].sort((a, b) => b.unlockedAt - a.unlockedAt).slice(0, 3);
  const defs = allAchievementDefs(state);
  const top = [...state.skills].filter((s) => s.enabled).sort((a, b) => b.xp - a.xp).slice(0, 3);
  return html`
    <section class="card glow">
      <div class="hero">
        <div class="avatar">${p.avatar}</div>
        <div class="grow">
          <h1>${p.name}</h1>
          <div class="muted small">Level ${lv.level} adventurer · ${p.lifetimeXp} lifetime XP</div>
          <div style="margin-top:8px">${bar(lv.progress)}</div>
          <div class="small mono muted" style="margin-top:4px">${lv.currentXp}/${lv.needed} XP · <b>${lv.toNext}</b> to level ${lv.level + 1}</div>
        </div>
      </div>
      <div class="grid3" style="margin-top:14px">
        <div class="stat"><b>${m.questsCompleted}</b><span>Quests</span></div>
        <div class="stat" title="A single rest day never breaks a streak"><b>${st.current}🔥</b><span>Streak</span></div>
        <div class="stat"><b>${m.bossesDefeated}</b><span>Bosses</span></div>
      </div>
    </section>

    <h2>Today’s quests</h2>
    ${today.length ? today.slice(0, 4).map((q) => questCard(state, q, now)) : empty('🌅', 'No quests due today.', html`<div class="row" style="justify-content:center"><a class="btn primary" href="#/quests">Find a quest</a></div>`)}
    ${today.length > 4 ? html`<a class="btn ghost block" href="#/quests">See all ${today.length} quests</a>` : ''}

    ${boss ? html`<h2>Active boss</h2>${bossSummary(state, boss)}` : ''}

    <h2>Top skills</h2>
    <div class="card">${top.map((s) => {
      const li = levelInfo(s.xp, state.settings.skillCurve);
      return html`<div class="hbar"><span>${s.icon} ${s.name}</span>${bar(li.progress, 'thin')}<span class="mono small">Lv ${li.level}</span></div>`;
    })}</div>

    <h2>Recent achievements</h2>
    ${recent.length ? html`<div class="card">${recent.map((a) => {
      const d = defs.find((x) => x.id === a.id);
      return html`<div class="row" style="padding:4px 0"><span style="font-size:22px">${d?.icon || '★'}</span><div class="grow"><b>${d?.name || a.id}</b><div class="small muted">${fmtDate(a.unlockedAt)}</div></div></div>`;
    })}</div>` : empty('🏆', 'Complete your first quest to earn a badge.')}`;
}

// ---------- quests ----------

function dueChip(q, now) {
  if (!q.dueAt || q.status !== 'active') return '';
  if (q.dueAt < now) return html`<span class="chip warn">Overdue · no penalty</span>`;
  const hrs = (q.dueAt - now) / 3600000;
  return html`<span class="chip">${hrs < 24 ? `Due in ${Math.max(1, Math.round(hrs))}h` : `Due ${fmtDate(q.dueAt)}`}</span>`;
}

export function questCard(state, q, now) {
  const skill = skillOf(state, q.skillId);
  const boss = q.bossId && state.bosses.find((b) => b.id === q.bossId);
  const blocked = q.prerequisites.map((id) => state.quests.find((x) => x.id === id)).filter((x) => x && x.status !== 'completed');
  const open = q.steps.filter((s) => !s.done).length;
  const statusChip = { completed: html`<span class="chip good">Completed ${fmtDate(q.completedAt)}</span>`, expired: html`<span class="chip">Missed · no penalty</span>`, abandoned: html`<span class="chip">Abandoned</span>` }[q.status];
  return html`
    <article class="card quest ${q.status !== 'active' ? 'done' : ''}" style="--c:${skill?.color || '#7c9cff'}" data-quest="${q.id}">
      <div class="row spread"><h3 class="grow">${q.title}</h3><span class="chip xp">+${q.xpReward} XP</span></div>
      <div class="meta">
        <span class="chip">${q.type === 'longterm' ? 'Long-term' : q.type[0].toUpperCase() + q.type.slice(1)}${q.repeats ? ' · repeats' : ''}</span>
        ${pips(q.difficulty)}
        <span class="chip">⏱ ${q.estimatedMinutes}m</span>
        ${skill ? html`<span class="chip">${skill.icon} ${skill.name}</span>` : ''}
        ${boss ? html`<span class="chip bad">☠ ${boss.title}</span>` : ''}
        ${dueChip(q, now)} ${statusChip || ''}
        ${q.source !== 'manual' ? html`<span class="chip">${{ recommendation: 'Suggested', planner: 'Local planner', ai: 'AI draft', recurring: 'Recurring' }[q.source]}</span>` : ''}
      </div>
      ${q.description ? html`<p class="desc">${q.description}</p>` : ''}
      ${q.criteria ? html`<div class="crit">${q.criteria}</div>` : ''}
      ${q.steps.length ? html`<ul class="steps">${q.steps.map((st) => html`<li><label><input type="checkbox" data-action="toggle-step" data-qid="${q.id}" data-sid="${st.id}" ${st.done ? html`checked` : ''} ${q.status !== 'active' ? html`disabled` : ''}><span class="${st.done ? 's-done' : ''}">${st.title}</span></label></li>`)}</ul>` : ''}
      ${blocked.length && q.status === 'active' ? html`<div class="small warn" style="color:var(--warn);margin-top:6px">🔒 Requires: ${blocked.map((b) => b.title).join(', ')}</div>` : ''}
      ${q.status === 'active' ? html`
        <div class="actions">
          <button class="btn primary sm" data-action="complete" data-id="${q.id}" ${blocked.length || open ? html`disabled title="Finish steps and prerequisites first"` : ''}>✓ Complete</button>
          <button class="btn sm" data-action="edit-quest" data-id="${q.id}">Edit</button>
          <button class="btn sm" data-action="postpone" data-id="${q.id}">Postpone</button>
          <button class="btn sm ghost" data-action="abandon" data-id="${q.id}">Abandon</button>
        </div>` : ''}
      ${['expired', 'abandoned'].includes(q.status) && !(q.repeats && q.spawnedNext) ? html`<div class="actions"><button class="btn sm" data-action="restore" data-id="${q.id}">Restore</button></div>` : ''}
    </article>`;
}

export function quests(state, ui, now) {
  const tab = ui.questTab;
  const groups = {
    active: state.quests.filter((q) => q.status === 'active'),
    completed: state.quests.filter((q) => q.status === 'completed').sort((a, b) => b.completedAt - a.completedAt),
    inactive: state.quests.filter((q) => ['expired', 'abandoned'].includes(q.status)).reverse(),
  };
  const order = { daily: 0, weekly: 1, custom: 2, longterm: 3 };
  const list = tab === 'active' ? [...groups.active].sort((a, b) => order[a.type] - order[b.type] || (a.dueAt ?? Infinity) - (b.dueAt ?? Infinity)) : groups[tab];
  return html`
    <div class="row spread"><h2>Quest board</h2><div class="row"><button class="btn sm" data-action="open-planner">✨ Plan a goal</button><button class="btn sm primary" data-action="new-quest">+ Quest</button></div></div>
    ${tab === 'active' ? suggestionsBlock(state, ui) : ''}
    <div class="tabs" role="toolbar">${[['active', 'Active'], ['completed', 'Completed'], ['inactive', 'Missed & abandoned']].map(([id, label]) => html`<button data-action="quest-tab" data-tab="${id}" aria-pressed="${tab === id}">${label} (${groups[id].length})</button>`)}</div>
    ${list.length ? list.slice(0, 60).map((q) => questCard(state, q, now))
      : empty(tab === 'active' ? '📜' : '·', tab === 'active' ? 'No active quests. Accept a suggestion above or create your own.' : 'Nothing here yet.')}`;
}

function suggestionsBlock(state, ui) {
  const r = ui.suggestions;
  if (!r) return '';
  return html`
    <section class="card glow">
      <b>Recommended for you</b>
      <div class="small muted">Mode: ${state.settings.difficultyMode} · target difficulty ${r.target.toFixed(1)} · ${r.available} min free today</div>
      ${r.suggestions.length ? r.suggestions.map((sg, i) => {
        const skill = skillOf(state, sg.draft.skillId);
        return html`<div class="quest" style="--c:${skill?.color};padding:10px 0 4px 12px;margin-top:8px">
          <div class="row spread"><b class="grow">${sg.draft.title}</b><span class="chip xp">+${sg.xp}</span></div>
          <div class="meta">${skill ? html`<span class="chip">${skill.icon} ${skill.name}</span>` : ''}${pips(sg.draft.difficulty)}<span class="chip">⏱ ${sg.draft.estimatedMinutes}m</span></div>
          <details class="why"><summary>Why this quest?</summary><ul>${sg.reasons.map((x) => html`<li>${x}</li>`)}</ul></details>
          <div class="actions"><button class="btn sm primary" data-action="accept-suggestion" data-i="${i}">Accept</button></div>
        </div>`;
      }) : html`<p class="muted small">No suggestions: every template is already on your board.</p>`}
    </section>`;
}

export function questForm(state, q, preset = {}) {
  const v = q || { type: 'daily', difficulty: 2, estimatedMinutes: 30, steps: [], prerequisites: [], ...preset };
  const others = state.quests.filter((x) => x.id !== v.id && ['active', 'completed'].includes(x.status));
  const enabledSkills = state.skills.filter((s) => s.enabled || s.id === v.skillId);
  const bosses = state.bosses.filter((b) => b.status === 'active' || b.id === v.bossId);
  return html`
    <form data-form="quest" novalidate>
      <div class="dhead"><h3>${q ? 'Edit quest' : 'New quest'}</h3><button type="button" class="btn sm ghost" data-action="close-modal" aria-label="Close">✕</button></div>
      <div class="dbody">
        <input type="hidden" name="id" value="${v.id || ''}">
        <label class="f">Title<input name="title" required maxlength="${LIMITS.title}" value="${v.title || ''}"></label>
        <label class="f">Description<textarea name="description" maxlength="500">${v.description || ''}</textarea></label>
        <label class="f">Completion criteria<input name="criteria" maxlength="500" placeholder="How will you know it's done?" value="${v.criteria || ''}"></label>
        <div class="grid2">
          <label class="f">Type<select name="type">${[['daily', 'Daily'], ['weekly', 'Weekly'], ['custom', 'Custom'], ['longterm', 'Long-term objective']].map(([id, l]) => html`<option value="${id}" ${v.type === id ? html`selected` : ''}>${l}</option>`)}</select></label>
          <label class="f">Skill<select name="skillId"><option value="">None</option>${enabledSkills.map((s) => html`<option value="${s.id}" ${v.skillId === s.id ? html`selected` : ''}>${s.icon} ${s.name}</option>`)}</select></label>
          <label class="f">Difficulty<select name="difficulty">${[1, 2, 3, 4, 5].map((d) => html`<option value="${d}" ${Number(v.difficulty) === d ? html`selected` : ''}>${d} · ${DIFFICULTY[d].label}</option>`)}</select></label>
          <label class="f">Minutes<input name="estimatedMinutes" type="number" inputmode="numeric" min="5" max="480" value="${v.estimatedMinutes}"></label>
        </div>
        <label class="check"><input type="checkbox" name="repeats" ${v.repeats ? html`checked` : ''}><span>Repeats every day/week <span class="small muted">(daily & weekly only; a missed day just skips, nothing is lost)</span></span></label>
        <label class="f">Due date <span class="faint">(custom & long-term)</span><input type="date" name="dueAt" value="${toDateInput(v.dueAt)}"></label>
        <label class="f">Steps <span class="faint">(one per line, optional)</span><textarea name="steps" rows="3">${v.steps.map((s) => s.title || s).join('\n')}</textarea></label>
        ${others.length ? html`<label class="f">Prerequisites<select name="prerequisites" multiple size="${Math.min(4, others.length)}">${others.map((x) => html`<option value="${x.id}" ${v.prerequisites.includes(x.id) ? html`selected` : ''}>${x.title}</option>`)}</select></label>` : ''}
        <div class="grid2">
          <label class="f">Goal<select name="goalId"><option value="">None</option>${state.goals.filter((g) => g.status === 'active' || g.id === v.goalId).map((g) => html`<option value="${g.id}" ${v.goalId === g.id ? html`selected` : ''}>${g.title}</option>`)}</select></label>
          ${bosses.length ? html`<label class="f">Boss stage<select name="bossStage"><option value="">None</option>${bosses.map((b) => b.stages.filter((s) => s.status !== 'cleared' || s.id === v.stageId).map((s) => html`<option value="${b.id}|${s.id}" ${v.stageId === s.id ? html`selected` : ''}>${b.title}: ${s.title}</option>`))}</select></label>` : ''}
        </div>
        <p class="small muted">XP is calculated from difficulty, time and steps, so it can't be inflated.</p>
        <div class="err" data-err></div>
      </div>
      <div class="dfoot"><button type="button" class="btn ghost" data-action="close-modal">Cancel</button><button class="btn primary" type="submit">${q ? 'Save' : 'Create quest'}</button></div>
    </form>`;
}

export function plannerForm(state, ui) {
  const plan = ui.plan;
  const aiOn = state.settings.ai.provider === 'anthropic';
  return html`
    <div class="dhead"><h3>✨ Plan a goal</h3><button type="button" class="btn sm ghost" data-action="close-modal" aria-label="Close">✕</button></div>
    <div class="dbody">
      <form data-form="plan">
        <label class="f">Your goal<input name="goal" required maxlength="80" placeholder="e.g. Build a functional Python project" value="${plan?.goal || ''}"></label>
        <label class="f">Skill<select name="skillId"><option value="">Auto-detect</option>${state.skills.filter((s) => s.enabled).map((s) => html`<option value="${s.id}" ${plan?.skillId === s.id ? html`selected` : ''}>${s.icon} ${s.name}</option>`)}</select></label>
        <p class="small muted">${aiOn ? 'Uses your AI provider; falls back to local rules if it fails or you are offline.' : 'Uses the built-in local rule-based planner (no AI, works offline). AI can be enabled in Profile.'}</p>
        <button class="btn primary block" type="submit" ${ui.planning ? html`disabled` : ''}>${ui.planning ? 'Planning…' : 'Break it down'}</button>
      </form>
      ${plan?.result ? planPreview(state, plan) : ''}
    </div>`;
}

function planPreview(state, plan) {
  const r = plan.result;
  if (!r.ok) return html`<p class="err">${r.error}</p>`;
  return html`
    <form data-form="plan-accept" style="margin-top:14px">
      ${r.warning ? html`<p class="small" style="color:var(--warn)">${r.warning}</p>` : ''}
      <p class="small muted">${r.source === 'ai' ? 'AI-generated draft (validated).' : 'Local rule-based draft.'} ${r.explanation}</p>
      <b class="small">Choose quests to add. Nothing is added until you confirm.</b>
      ${r.quests.map((q, i) => q.ok ? html`
        <label class="check"><input type="checkbox" name="pick" value="${i}" checked>
          <span><b>${q.draft.title}</b> <span class="chip xp">+${q.draft.xp}</span><br><span class="small muted">${DIFFICULTY[q.draft.difficulty].label} · ${q.draft.estimatedMinutes} min · ${q.draft.criteria}</span></span></label>`
        : html`<div class="small faint" style="padding:6px 0">✕ Rejected draft: ${q.errors.join('; ')}</div>`)}
      <div class="actions">
        <button class="btn primary" type="submit" name="mode" value="quests">Add selected quests</button>
        ${r.stages.length >= 2 ? html`<button class="btn" type="submit" name="mode" value="boss">☠ Create boss battle + quests</button>` : ''}
      </div>
    </form>`;
}

// ---------- skills ----------

const UNLOCK_LEVEL = { 1: 1, 2: 1, 3: 2, 4: 4, 5: 6 };

export function skills(state) {
  const visible = state.skills;
  return html`
    <div class="row spread"><h2>Skill tree</h2><button class="btn sm primary" data-action="new-skill">+ Skill</button></div>
    <p class="small muted" style="margin-top:-4px">Skills grow only from quests and boss battles in that skill.</p>
    <div class="tree">
      ${visible.map((s) => {
        const li = levelInfo(s.xp, state.settings.skillCurve);
        return html`
          <div class="card branch ${s.enabled ? '' : 'off'}" style="--c:${s.color}" data-action="skill-detail" data-id="${s.id}" role="button" tabindex="0">
            <div class="row">
              <div class="node">${s.icon}</div>
              <div class="grow">
                <div class="row spread"><b>${s.name}</b><span class="mono small">Lv ${li.level}</span></div>
                ${bar(li.progress, 'thin')}
                <div class="small faint mono">${s.xp} XP · ${li.toNext} to next${s.enabled ? '' : ' · disabled'}</div>
              </div>
            </div>
            <div class="path" aria-label="Milestones">${SKILL_MILESTONES.map((m, i) => html`${i ? html`<span class="ln ${li.level >= m ? 'on' : ''}"></span>` : ''}<span class="m ${li.level >= m ? 'on' : ''}" title="Milestone: level ${m}">${m}</span>`)}</div>
          </div>`;
      })}
    </div>`;
}

export function skillDetail(state, id) {
  const s = skillOf(state, id);
  const li = levelInfo(s.xp, state.settings.skillCurve);
  const related = state.quests.filter((q) => q.skillId === id);
  const history = state.ledger.filter((e) => e.skillId === id).slice(-8).reverse();
  const active = new Set(state.quests.filter((q) => q.status === 'active').map((q) => q.title));
  return html`
    <div class="dhead"><h3>${s.icon} ${s.name}</h3><button type="button" class="btn sm ghost" data-action="close-modal" aria-label="Close">✕</button></div>
    <div class="dbody">
      <div class="row"><div class="lvl"><div><small>LV</small>${li.level}</div></div><div class="grow">${bar(li.progress)}<div class="small mono muted">${li.currentXp}/${li.needed} XP · ${s.xp} total</div></div></div>
      <h2>Milestones</h2>
      <div class="row wrap">${SKILL_MILESTONES.map((m) => html`<span class="chip ${li.level >= m ? 'good' : ''}">${li.level >= m ? '✓' : '🔒'} Level ${m}</span>`)}</div>
      <h2>Challenges</h2>
      ${templatesFor(s).map((t) => {
        const need = UNLOCK_LEVEL[t.d];
        const locked = li.level < need;
        return html`<div class="row" style="padding:6px 0;border-bottom:1px solid var(--line)">
          <div class="grow"><div class="${locked ? 'faint' : ''}">${t.t}</div><div class="small faint">${pips(t.d)} ${t.m} min ${locked ? `· unlocks at level ${need}` : ''}</div></div>
          ${locked ? html`<span class="chip">🔒</span>` : active.has(t.t) ? html`<span class="chip">On board</span>`
            : html`<button class="btn sm" data-action="accept-challenge" data-skill="${s.id}" data-d="${t.d}" ${s.enabled ? '' : html`disabled`}>Accept</button>`}
        </div>`;
      })}
      <h2>Related quests (${related.length})</h2>
      ${related.length ? related.slice(-6).reverse().map((q) => html`<div class="row small" style="padding:3px 0"><span class="grow">${q.title}</span><span class="chip">${q.status}</span></div>`) : html`<p class="small muted">None yet.</p>`}
      <h2>Progress history</h2>
      ${history.length ? history.map((e) => html`<div class="row small mono" style="padding:3px 0"><span class="grow muted">${fmtDateTime(e.at)}</span><span class="chip xp">+${e.amount}</span></div>`) : html`<p class="small muted">No XP earned in this skill yet.</p>`}
      <h2>Manage</h2>
      <form data-form="skill" class="stack">
        <input type="hidden" name="id" value="${s.id}">
        <div class="grid2"><label class="f">Name<input name="name" maxlength="40" required value="${s.name}"></label><label class="f">Icon<input name="icon" maxlength="4" value="${s.icon}"></label></div>
        <label class="f">Colour<input type="color" name="color" value="${s.color}"></label>
        <div class="err" data-err></div>
        <div class="actions"><button class="btn primary" type="submit">Save</button><button type="button" class="btn ${s.enabled ? 'danger' : ''}" data-action="toggle-skill" data-id="${s.id}">${s.enabled ? 'Disable skill' : 'Enable skill'}</button></div>
        <p class="small faint">Disabling hides it from new quests and suggestions. Its XP is kept.</p>
      </form>
    </div>`;
}

export function newSkillForm() {
  return html`
    <form data-form="skill">
      <div class="dhead"><h3>New skill</h3><button type="button" class="btn sm ghost" data-action="close-modal" aria-label="Close">✕</button></div>
      <div class="dbody">
        <div class="grid2"><label class="f">Name<input name="name" maxlength="40" required placeholder="e.g. Cooking"></label><label class="f">Icon<input name="icon" maxlength="4" value="◆"></label></div>
        <label class="f">Colour<input type="color" name="color" value="#8ab4ff"></label>
        <div class="err" data-err></div>
      </div>
      <div class="dfoot"><button type="button" class="btn ghost" data-action="close-modal">Cancel</button><button class="btn primary" type="submit">Add skill</button></div>
    </form>`;
}

// ---------- bosses ----------

function bossSummary(state, b) {
  const cleared = b.stages.filter((s) => s.status === 'cleared').length;
  const current = b.stages.find((s) => s.status === 'active');
  return html`
    <article class="card" data-action="boss-detail" data-id="${b.id}" role="button" tabindex="0" style="cursor:pointer">
      <div class="boss-head">
        <div class="boss-icon ${b.status === 'defeated' ? 'dead' : ''}">${b.status === 'defeated' ? '💀' : '👹'}</div>
        <div class="grow">
          <div class="row spread"><b>${b.title}</b><span class="chip ${b.status === 'defeated' ? 'good' : b.status === 'abandoned' ? '' : 'bad'}">${b.status === 'defeated' ? 'Defeated' : b.status === 'abandoned' ? 'Retreated' : `Stage ${cleared + 1}/${b.stages.length}`}</span></div>
          <div class="small muted">HP ${b.stages.length - cleared}/${b.stages.length}</div>
          ${bar((b.stages.length - cleared) / b.stages.length, 'hp')}
          ${current ? html`<div class="small" style="margin-top:6px">Now: <b>${current.title}</b></div>` : ''}
        </div>
      </div>
    </article>`;
}

export function bosses(state) {
  const list = [...state.bosses].sort((a, b) => ({ active: 0, abandoned: 1, defeated: 2 }[a.status] - { active: 0, abandoned: 1, defeated: 2 }[b.status]));
  return html`
    <div class="row spread"><h2>Boss battles</h2><button class="btn sm primary" data-action="new-boss">+ Boss</button></div>
    <p class="small muted" style="margin-top:-4px">Turn a major goal into milestone stages. Each stage is a real step forward.</p>
    ${list.length ? list.map((b) => bossSummary(state, b)) : empty('👹', 'No bosses yet. Create one from a big goal, or use “Plan a goal” on the Quest board.', html`<button class="btn primary" data-action="new-boss">Summon a boss</button>`)}`;
}

export function bossDetail(state, id) {
  const b = state.bosses.find((x) => x.id === id);
  const skill = skillOf(state, b.skillId);
  return html`
    <div class="dhead"><h3>☠ ${b.title}</h3><button type="button" class="btn sm ghost" data-action="close-modal" aria-label="Close">✕</button></div>
    <div class="dbody">
      ${b.description ? html`<p class="muted">${b.description}</p>` : ''}
      <div class="row wrap">${pips(b.difficulty)}${skill ? html`<span class="chip">${skill.icon} ${skill.name}</span>` : ''}<span class="chip xp">Stage +${b.stages[0].xp} · Defeat +${b.xpReward}</span></div>
      <ol class="stages">${b.stages.map((s) => {
        const linked = state.quests.filter((q) => q.bossId === b.id && q.stageId === s.id && q.status !== 'abandoned');
        const open = linked.filter((q) => q.status !== 'completed');
        return html`<li class="${s.status}">
          <b>${s.title}</b> ${s.status === 'cleared' ? html`<span class="small muted">· cleared ${fmtDate(s.clearedAt)}</span>` : ''}
          ${s.objective ? html`<div class="small muted">Requirement: ${s.objective}</div>` : ''}
          ${s.note ? html`<div class="small faint">Note: ${s.note}</div>` : ''}
          ${linked.length ? html`<div class="small" style="margin-top:4px">${linked.map((q) => html`<div>${q.status === 'completed' ? '✓' : '○'} ${q.title}</div>`)}</div>` : ''}
          ${s.status === 'active' && b.status === 'active' ? html`<div class="actions">
            <button class="btn sm" data-action="new-quest" data-boss="${b.id}" data-stage="${s.id}">+ Stage quest</button>
            <button class="btn sm gold" data-action="clear-stage" data-boss="${b.id}" data-stage="${s.id}" ${open.length ? html`disabled title="Finish linked quests first"` : ''}>⚔ Clear stage</button>
          </div>` : ''}
        </li>`;
      })}</ol>
      <h2>History</h2>
      ${b.history.slice().reverse().map((h) => html`<div class="row small" style="padding:2px 0"><span class="grow">${h.action}</span><span class="faint mono">${fmtDateTime(h.at)}</span></div>`)}
      <div class="actions" style="margin-top:12px">
        ${b.status === 'active' ? html`<button class="btn sm ghost" data-action="boss-status" data-id="${b.id}" data-status="abandoned">Retreat (keeps earned XP)</button>` : ''}
        ${b.status === 'abandoned' ? html`<button class="btn sm" data-action="boss-status" data-id="${b.id}" data-status="active">Resume battle</button>` : ''}
      </div>
    </div>`;
}

export function bossForm(state, preset) {
  const stages = preset?.stages?.length ? preset.stages : [{ title: '' }, { title: '' }, { title: '' }];
  return html`
    <form data-form="boss" novalidate>
      <div class="dhead"><h3>Summon a boss</h3><button type="button" class="btn sm ghost" data-action="close-modal" aria-label="Close">✕</button></div>
      <div class="dbody">
        <label class="f">Major goal<input name="title" required maxlength="80" placeholder="e.g. Build a functional Python project" value="${preset?.title || ''}"></label>
        <label class="f">Description<textarea name="description" maxlength="500">${preset?.description || ''}</textarea></label>
        <div class="grid2">
          <label class="f">Skill<select name="skillId"><option value="">None</option>${state.skills.filter((s) => s.enabled).map((s) => html`<option value="${s.id}" ${preset?.skillId === s.id ? html`selected` : ''}>${s.icon} ${s.name}</option>`)}</select></label>
          <label class="f">Difficulty<select name="difficulty">${[1, 2, 3, 4, 5].map((d) => html`<option value="${d}" ${d === 3 ? html`selected` : ''}>${d} · ${DIFFICULTY[d].label}</option>`)}</select></label>
        </div>
        <fieldset><legend>Stages (last one is the final boss)</legend>
          <div data-stages>${stages.map((s, i) => stageRow(s, i))}</div>
          <button type="button" class="btn sm" data-action="add-stage-row">+ Stage</button>
        </fieldset>
        <div class="err" data-err></div>
      </div>
      <div class="dfoot"><button type="button" class="btn ghost" data-action="close-modal">Cancel</button><button class="btn primary" type="submit">Create boss</button></div>
    </form>`;
}

export function stageRow(s = {}, i = 0) {
  return html`<div class="card" style="padding:10px" data-stage-row>
    <div class="row"><input class="f-input grow" name="stageTitle" maxlength="80" placeholder="Stage ${i + 1} title" value="${s.title || ''}" style="margin:0"><button type="button" class="btn sm ghost" data-action="remove-stage-row" aria-label="Remove stage">✕</button></div>
    <input class="f-input" name="stageObjective" maxlength="500" placeholder="Completion requirement" value="${s.objective || ''}">
  </div>`;
}

export function clearStageForm(boss, stage) {
  return html`
    <form data-form="clear-stage">
      <div class="dhead"><h3>⚔ Clear “${stage.title}”?</h3></div>
      <div class="dbody">
        <input type="hidden" name="bossId" value="${boss.id}"><input type="hidden" name="stageId" value="${stage.id}">
        ${stage.objective ? html`<p>Requirement: <b>${stage.objective}</b></p>` : ''}
        <label class="check"><input type="checkbox" name="confirm" required><span>I have genuinely met this stage’s requirement.</span></label>
        <label class="f">Evidence / note (optional)<textarea name="note" maxlength="300" placeholder="What did you finish?"></textarea></label>
        <div class="err" data-err></div>
      </div>
      <div class="dfoot"><button type="button" class="btn ghost" data-action="close-modal">Not yet</button><button class="btn gold" type="submit">Clear stage +${stage.xp} XP</button></div>
    </form>`;
}

// ---------- achievements ----------

export function achievements(state) {
  const metrics = computeMetrics(state);
  const unlocked = new Map(state.achievements.map((a) => [a.id, a]));
  const defs = allAchievementDefs(state);
  return html`
    <div class="row spread"><h2>Achievements · ${state.achievements.length}/${defs.length}</h2><button class="btn sm" data-action="new-achievement">+ Custom</button></div>
    <div class="badges">${defs.map((d) => {
      const u = unlocked.get(d.id);
      const val = Math.min(metricValue(metrics, d), d.threshold);
      return html`<div class="card badge ${u ? 'on' : ''}">
        <div class="bi">${d.icon}</div>
        <h3>${d.name}</h3>
        <p>${d.description}</p>
        ${u ? html`<span class="chip good">✓ ${fmtDate(u.unlockedAt)}${u.xp ? ` · +${u.xp} XP` : ''}</span>` : html`${bar(val / d.threshold, 'thin gold')}<div class="small faint mono" style="margin-top:4px">${val}/${d.threshold}</div>`}
        ${d.custom ? html`<div class="small faint">Custom · badge only</div>` : ''}
      </div>`;
    })}</div>
    <p class="small faint" style="margin-top:12px">Achievements reward steady, healthy progress. None reward overwork, skipped sleep or spending money.</p>`;
}

export function achievementForm(state) {
  return html`
    <form data-form="achievement">
      <div class="dhead"><h3>Custom achievement</h3><button type="button" class="btn sm ghost" data-action="close-modal" aria-label="Close">✕</button></div>
      <div class="dbody">
        <div class="grid2"><label class="f">Name<input name="name" required maxlength="50"></label><label class="f">Icon<input name="icon" maxlength="4" value="★"></label></div>
        <label class="f">Description<input name="description" maxlength="200"></label>
        <label class="f">Unlock when<select name="metric">${Object.entries(ACHIEVEMENT_METRICS).map(([k, l]) => html`<option value="${k}">${l}</option>`)}</select></label>
        <div class="grid2">
          <label class="f">Reaches<input type="number" name="threshold" min="1" max="100000" value="10" required></label>
          <label class="f">Skill <span class="faint">(per-skill only)</span><select name="skillId">${state.skills.map((s) => html`<option value="${s.id}">${s.name}</option>`)}</select></label>
        </div>
        <p class="small muted">Custom badges celebrate milestones you choose. They grant no XP, so they can’t be used to farm levels.</p>
        <div class="err" data-err></div>
      </div>
      <div class="dfoot"><button type="button" class="btn ghost" data-action="close-modal">Cancel</button><button class="btn primary" type="submit">Create</button></div>
    </form>`;
}

// ---------- stats ----------

function columnChart(rows, valueKey, labelFn, { height = 120, unit = '' } = {}) {
  const w = 320; const padB = 16; const padT = 16;
  const max = Math.max(1, ...rows.map((r) => r[valueKey]));
  const bw = w / rows.length;
  const y = (v) => padT + (height - padB - padT) * (1 - v / max);
  return html`<svg class="chart" viewBox="0 0 ${w} ${height}" role="img" aria-label="${rows.map((r) => `${labelFn(r)}: ${r[valueKey]}${unit}`).join(', ')}">
    <line class="grid" x1="0" x2="${w}" y1="${y(max)}" y2="${y(max)}"></line>
    <line class="grid" x1="0" x2="${w}" y1="${y(0)}" y2="${y(0)}"></line>
    <text x="${w}" y="${y(max) - 2}" text-anchor="end">${max}${unit}</text>
    ${rows.map((r, i) => {
      const v = r[valueKey];
      const bh = Math.max(v ? 2 : 0, y(0) - y(v));
      return html`<g><title>${labelFn(r)}: ${v}${unit}</title>
        <rect x="${i * bw}" y="${padT}" width="${bw}" height="${height - padB - padT}" fill="transparent"></rect>
        ${v ? html`<rect class="bar-mark" x="${i * bw + bw * 0.18}" y="${y(0) - bh}" width="${bw * 0.64}" height="${bh}" rx="2"></rect>` : ''}</g>`;
    })}
    <text x="0" y="${height - 3}">${labelFn(rows[0])}</text><text x="${w}" y="${height - 3}" text-anchor="end">${labelFn(rows[rows.length - 1])}</text>
  </svg>`;
}

export function stats(state, ui, now) {
  const s = buildStats(state, now);
  if (!s.hasData) {
    return html`<h2>Statistics</h2>${empty('📈', 'No data yet. Statistics appear once you complete your first quest. Nothing here is estimated.', html`<a class="btn primary" href="#/quests">Go to quests</a>`)}
      ${s.totals.activeQuests ? html`<div class="card"><b>Planned (not completed)</b><div class="muted small">${s.totals.activeQuests} active quests · ${s.totals.plannedMinutes} min planned</div></div>` : ''}`;
  }
  const r = s.resolution;
  const maxCat = Math.max(1, ...s.categories.map((c) => c.count));
  return html`
    <h2>Overview</h2>
    <div class="grid3">
      <div class="stat"><b>${s.totals.completed}</b><span>Completed</span></div>
      <div class="stat"><b>${s.totals.lifetimeXp}</b><span>Lifetime XP</span></div>
      <div class="stat"><b>${r.rate === null ? '–' : `${Math.round(r.rate * 100)}%`}</b><span>Completion rate</span></div>
    </div>
    <div class="card" style="margin-top:10px">
      <div class="row spread small"><span>✓ Done: <b>${s.totals.completed}</b> quests · ${s.totals.completedMinutes} min</span><span class="muted">Planned: ${s.totals.activeQuests} · ${s.totals.plannedMinutes} min</span></div>
      <div class="small faint" style="margin-top:4px">Missed ${r.missed} · Abandoned ${r.abandoned}. Planned quests are never counted as done.</div>
    </div>

    <h2>XP earned · last 30 days</h2>
    <div class="card">${columnChart(s.xpByDay, 'xp', (d) => fmtDate(`${d.key}T12:00:00`), { unit: ' XP' })}</div>

    <h2>Weekly activity · quests completed</h2>
    <div class="card">${columnChart(s.weekly, 'quests', (w) => `wk ${fmtDate(`${w.key}T12:00:00`)}`)}</div>

    <h2>Most active categories</h2>
    <div class="card">${s.categories.map((c) => html`<div class="hbar"><span>${c.name}</span><div class="bar thin"><i style="width:${(c.count / maxCat) * 100}%;background:${c.color}"></i></div><span class="mono small">${c.count}</span></div>`)}</div>

    <h2>Skill progression</h2>
    <div class="card">${s.skills.map((k) => html`<div class="hbar"><span>${k.icon} ${k.name}</span>${bar(k.progress, 'thin')}<span class="mono small">Lv ${k.level} · ${k.xp}</span></div>`)}</div>

    ${s.bosses.length ? html`<h2>Boss battles</h2><div class="card">${s.bosses.map((b) => html`<div class="hbar"><span>${b.title}</span>${bar(b.cleared / b.total, 'thin')}<span class="mono small">${b.cleared}/${b.total}${b.status === 'defeated' ? ' ✓' : ''}</span></div>`)}</div>` : ''}
    ${s.goals.length ? html`<h2>Goals</h2><div class="card">${s.goals.map((g) => html`<div class="hbar"><span>${g.title}</span>${bar(g.total ? g.done / g.total : 0, 'thin')}<span class="mono small">${g.done}/${g.total} ${g.status === 'achieved' ? '✓' : ''}</span></div>`)}</div>` : ''}

    <h2>Personal records</h2>
    <div class="grid2">
      <div class="stat"><b>${s.records.bestDayXp.value}</b><span>Best day XP${s.records.bestDayXp.key ? ` · ${fmtDate(`${s.records.bestDayXp.key}T12:00:00`)}` : ''}</span></div>
      <div class="stat"><b>${s.records.bestDayQuests.value}</b><span>Most quests in a day</span></div>
      <div class="stat"><b>${s.records.longestStreak}</b><span>Longest streak (days)</span></div>
      <div class="stat"><b>${s.records.level}</b><span>Highest level</span></div>
    </div>`;
}

// ---------- profile & settings ----------

export function profile(state, ui) {
  const p = state.profile;
  const st = state.settings;
  return html`
    <h2>Character</h2>
    <form class="card" data-form="profile">
      <div class="grid2"><label class="f">Name<input name="name" maxlength="40" required value="${p.name}"></label>
        <label class="f">Avatar<select name="avatar">${[...new Set([p.avatar, ...AVATARS])].map((a) => html`<option ${a === p.avatar ? html`selected` : ''}>${a}</option>`)}</select></label></div>
      <fieldset><legend>Focus skills (up to 4)</legend><div class="grid2">${state.skills.filter((s) => s.enabled).map((s) => html`<label class="check small"><input type="checkbox" name="focus" value="${s.id}" ${p.focusSkillIds.includes(s.id) ? html`checked` : ''}>${s.icon} ${s.name}</label>`)}</div></fieldset>
      <div class="err" data-err></div>
      <button class="btn primary" type="submit">Save character</button>
    </form>

    <div class="row spread"><h2>Goals</h2><button class="btn sm" data-action="new-goal">+ Goal</button></div>
    ${state.goals.length ? state.goals.map((g) => {
      const skill = skillOf(state, g.skillId);
      return html`<div class="card row"><div class="grow"><b>${g.title}</b><div class="small muted">${skill ? `${skill.icon} ${skill.name} · ` : ''}${g.status}</div></div>
        ${g.status === 'active' ? html`<button class="btn sm" data-action="goal-status" data-id="${g.id}" data-status="achieved">✓ Achieved</button><button class="btn sm ghost" data-action="goal-status" data-id="${g.id}" data-status="archived">Archive</button>`
          : html`<button class="btn sm ghost" data-action="goal-status" data-id="${g.id}" data-status="active">Reopen</button>`}</div>`;
    }) : html`<p class="small muted">Goals guide your recommendations. Link quests and bosses to them.</p>`}

    <h2>Gameplay</h2>
    <form class="card" data-form="settings">
      <div class="f"><span class="small muted">CHALLENGE MODE</span>${modeSeg(st.difficultyMode)}</div>
      <p class="small faint" style="margin-top:-6px">Relaxed: gentle steps. Balanced: steady growth. Challenging: bigger quests sooner. Missed days never cost XP.</p>
      <label class="f">Time available per day: <b class="mono" data-out="dm2">${st.dailyMinutes}</b> min<input type="range" name="dailyMinutes" min="10" max="600" step="5" value="${st.dailyMinutes}" data-mirror="dm2"></label>
      <fieldset><legend>XP curve (XP to next level = base × level^exponent)</legend>
        <div class="grid2"><label class="f">Base<input type="number" name="curveBase" min="10" max="10000" value="${st.curve.base}"></label><label class="f">Exponent<input type="number" name="curveExp" min="1" max="3" step="0.05" value="${st.curve.exponent}"></label></div>
        <p class="small faint">Levels are recalculated from your XP history, so changing this never loses XP.</p>
      </fieldset>
      <fieldset><legend>Reminders</legend>
        <label class="check"><input type="checkbox" name="notify" ${st.notifications.enabled ? html`checked` : ''}><span>One gentle daily reminder, only if you have open quests. Off by default.</span></label>
        <label class="f">Time<input type="time" name="notifyTime" value="${st.notifications.time}"></label>
        <p class="small faint">Shown by this device while the app is open or in the background. No server, no tracking.</p>
      </fieldset>
      <label class="check"><input type="checkbox" name="reduceMotion" ${st.reduceMotion ? html`checked` : ''}><span>Reduce motion</span></label>
      <div class="err" data-err></div>
      <button class="btn primary" type="submit">Save settings</button>
    </form>

    <h2>AI assistant (optional)</h2>
    <form class="card" data-form="ai">
      <label class="f">Provider<select name="provider"><option value="local" ${st.ai.provider === 'local' ? html`selected` : ''}>Local rules only (offline, no AI)</option><option value="anthropic" ${st.ai.provider === 'anthropic' ? html`selected` : ''}>Anthropic Claude (your API key)</option></select></label>
      <label class="f">Model<input name="model" maxlength="60" value="${st.ai.model}"></label>
      <label class="f">API key ${ui.hasKey ? html`<span class="chip good">saved</span>` : ''}<input name="apiKey" type="password" autocomplete="off" placeholder="${ui.hasKey ? 'Leave blank to keep the saved key' : 'sk-ant-…'}"></label>
      <label class="f">Timeout (seconds)<input type="number" name="timeout" min="5" max="120" value="${st.ai.timeoutMs / 1000}"></label>
      <p class="small faint">The key is stored only on this device, never exported, never logged. Requests go directly from your device to the provider. AI drafts are validated and you choose what to add.</p>
      <div class="err" data-err></div>
      <div class="actions"><button class="btn primary" type="submit">Save AI settings</button>${ui.hasKey ? html`<button type="button" class="btn danger" data-action="forget-key">Forget key</button>` : ''}</div>
    </form>

    <h2>Your data</h2>
    <div class="card stack">
      <p class="small muted">Everything is stored locally on this device. No account, no tracking, no ads, no purchases.</p>
      <div class="actions">
        <button class="btn" data-action="export">⬇ Export data (JSON)</button>
        <label class="btn">⬆ Import<input type="file" accept="application/json,.json" data-action="import" class="sr-only"></label>
        <button class="btn danger" data-action="delete-all">Delete all data</button>
      </div>
      <p class="small faint">Schema v${state.schemaVersion} · ${state.ledger.length} XP records · character since ${fmtDate(p.createdAt)}</p>
    </div>`;
}

export function goalForm(state) {
  return html`
    <form data-form="goal">
      <div class="dhead"><h3>New goal</h3><button type="button" class="btn sm ghost" data-action="close-modal" aria-label="Close">✕</button></div>
      <div class="dbody">
        <label class="f">Goal<input name="title" required maxlength="80" placeholder="e.g. Get comfortable speaking in public"></label>
        <label class="f">Why it matters<textarea name="description" maxlength="500"></textarea></label>
        <label class="f">Skill<select name="skillId"><option value="">None</option>${state.skills.filter((s) => s.enabled).map((s) => html`<option value="${s.id}">${s.icon} ${s.name}</option>`)}</select></label>
        <div class="err" data-err></div>
      </div>
      <div class="dfoot"><button type="button" class="btn ghost" data-action="close-modal">Cancel</button><button class="btn primary" type="submit">Create goal</button></div>
    </form>`;
}

export function deleteForm() {
  return html`
    <form data-form="delete-all">
      <div class="dhead"><h3>Delete all data?</h3></div>
      <div class="dbody">
        <p>This permanently removes your character, quests, XP history, achievements and saved API key from this device. Consider exporting first.</p>
        <label class="f">Type DELETE to confirm<input name="confirm" autocomplete="off" required></label>
        <div class="err" data-err></div>
      </div>
      <div class="dfoot"><button type="button" class="btn ghost" data-action="close-modal">Cancel</button><button class="btn danger" type="submit">Delete everything</button></div>
    </form>`;
}

export function confirmForm(title, body, action, data, label) {
  return html`
    <form data-form="confirm" data-confirm="${action}" data-payload="${JSON.stringify(data)}">
      <div class="dhead"><h3>${title}</h3></div>
      <div class="dbody"><p class="muted">${body}</p></div>
      <div class="dfoot"><button type="button" class="btn ghost" data-action="close-modal">Cancel</button><button class="btn primary" type="submit">${label}</button></div>
    </form>`;
}

export function celebrate(events) {
  const lvl = events.find((e) => e.type === 'levelUp');
  const boss = events.find((e) => e.type === 'bossDefeated');
  return html`
    <div class="celebrate">
      ${boss ? html`<div style="font-size:54px">💀</div><h3>Boss defeated!</h3><p class="muted">${boss.title}</p>` : ''}
      ${lvl ? html`<div class="small muted">LEVEL UP</div><div class="big">${lvl.to}</div><p class="muted">You reached level ${lvl.to}. Real progress, earned.</p>` : ''}
      <button class="btn primary" data-action="close-modal">Continue</button>
    </div>`;
}


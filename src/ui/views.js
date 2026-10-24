// Screen templates. Pure functions of (state, ui, now) -> html. No side effects here.

import { html, fmtDate, fmtDateTime, toDateInput } from './html.js';
import { icon, skillGlyph, achievementGlyph } from './icons.js';
import { DIFFICULTY, ACHIEVEMENT_METRICS, SKILL_MILESTONES, LIMITS } from '../core/config.js';
import { levelInfo } from '../core/progression.js';
import { computeMetrics, allAchievementDefs, metricValue } from '../core/achievements.js';
import { buildStats, streaks } from '../core/analytics.js';
import { templatesFor } from '../core/templates.js';
import { endOfDay } from '../core/time.js';

const AVATARS = ['🧙', '🧝', '🥷', '🧑‍🚀', '🦸', '🧛', '🤖', '🐉', '🦊', '🦉'];
export const NAV = [['home', 'Home'], ['quests', 'Quests'], ['skills', 'Skills'], ['bosses', 'Bosses'], ['stats', 'Stats']];
export const ROUTES = ['home', 'quests', 'skills', 'bosses', 'stats', 'achievements', 'profile'];

const RANK = { 1: 'D', 2: 'C', 3: 'B', 4: 'A', 5: 'S' };
export function rankTitle(level) {
  return level >= 50 ? 'Legend' : level >= 35 ? 'Master' : level >= 20 ? 'Expert' : level >= 10 ? 'Adept' : level >= 5 ? 'Apprentice' : 'Novice';
}

const skillOf = (s, id) => s.skills.find((k) => k.id === id);
const pct = (p) => `${(Math.max(0, Math.min(1, p)) * 100).toFixed(1)}%`;
const bar = (p, cls = '') => html`<div class="bar ${cls}" role="progressbar" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${Math.round(p * 100)}"><i style="width:${pct(p)}"></i></div>`;
const rank = (d) => html`<div class="rank r${d}" title="${DIFFICULTY[d].label} (difficulty ${d}/5)" aria-label="Difficulty ${DIFFICULTY[d].label}">${RANK[d]}</div>`;
const sectionTitle = (text, extra = '') => html`<div class="sec"><h2>${text}</h2>${extra}</div>`;
const empty = (ic, title, text, action = '') => html`<div class="empty"><div class="empty-ic">${icon(ic, 30)}</div><b>${title}</b><p>${text}</p>${action}</div>`;
const closeBtn = html`<button type="button" class="iconbtn" data-action="close-modal" aria-label="Close">${icon('x', 18)}</button>`;

function ring(progress, size, stroke, cls = '') {
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  return html`<svg class="ring ${cls}" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}" aria-hidden="true">
    <circle cx="${size / 2}" cy="${size / 2}" r="${r}" class="ring-bg" stroke-width="${stroke}" fill="none"></circle>
    <circle cx="${size / 2}" cy="${size / 2}" r="${r}" class="ring-fg" stroke-width="${stroke}" fill="none" stroke-linecap="round"
      stroke-dasharray="${c.toFixed(2)}" stroke-dashoffset="${(c * (1 - Math.max(0, Math.min(1, progress)))).toFixed(2)}" transform="rotate(-90 ${size / 2} ${size / 2})"></circle>
  </svg>`;
}

// ---------- shell ----------

export function shell(state, route, body) {
  const p = state.profile;
  const lv = levelInfo(p.lifetimeXp, state.settings.curve);
  const cur = (r) => (route === r ? html`aria-current="page"` : '');
  return html`
    <header class="topbar">
      <a href="#/home" class="tb-avatar" data-nav="home" aria-label="Character">${ring(lv.progress, 46, 3)}<span>${p.avatar}</span><b class="tb-lv">${lv.level}</b></a>
      ${route === 'home' ? html`<div class="tb-who"><div class="tb-logo">LIFE <span>RPG</span></div></div>` : html`<div class="tb-who">
        <div class="tb-name">${p.name} <span class="tb-rank">${rankTitle(lv.level)}</span></div>
        <div class="tb-xp">${bar(lv.progress, 'thin')}<span>${lv.currentXp}/${lv.needed}</span></div>
      </div>`}
      <a class="iconbtn ${route === 'achievements' ? 'on' : ''}" href="#/achievements" data-nav="achievements" ${cur('achievements')} aria-label="Achievements">${icon('achievements')}</a>
      <a class="iconbtn ${route === 'profile' ? 'on' : ''}" href="#/profile" data-nav="profile" ${cur('profile')} aria-label="Profile and settings">${icon('profile')}</a>
    </header>
    <main id="main" tabindex="-1">${body}</main>
    <nav class="nav" aria-label="Main">
      ${NAV.map(([id, label]) => html`<a href="#/${id}" data-nav="${id}" ${cur(id)}>${icon(id, 22)}<span>${label}</span></a>`)}
    </nav>`;
}

export function onboarding(state) {
  return html`
    <div class="onboard">
      <div class="ob-emblem">${icon('sparkle', 40)}</div>
      <h1 class="logo">LIFE <span>RPG</span></h1>
      <p class="tag-line">Level up your real life. Offline, private, no account.</p>
      <form class="card glow" data-form="onboarding">
        <div class="step-k">01 · Identity</div>
        <label class="f">Character name<input name="name" required maxlength="40" autocomplete="nickname" placeholder="e.g. Ada"></label>
        <div class="f"><span>Avatar</span>
          <div class="avatars">${AVATARS.map((a, i) => html`<label><input type="radio" name="avatar" value="${a}" ${i === 0 ? html`checked` : ''}><span>${a}</span></label>`)}</div>
        </div>
        <div class="step-k">02 · Focus skills <span class="faint">up to 4</span></div>
        <div class="pick-grid">${state.skills.map((s) => html`<label class="pick" style="--c:${s.color}"><input type="checkbox" name="focus" value="${s.id}"><span>${skillGlyph(s, 18)}${s.name}</span></label>`)}</div>
        <div class="step-k">03 · Difficulty</div>
        ${modeSeg(state.settings.difficultyMode)}
        <label class="f" style="margin-top:14px">Time per day <b class="num" data-out="dm">${state.settings.dailyMinutes}</b> min
          <input type="range" name="dailyMinutes" min="10" max="240" step="5" value="${state.settings.dailyMinutes}" data-mirror="dm"></label>
        <button class="btn primary block lg" type="submit">${icon('sword', 18)} Begin adventure</button>
      </form>
    </div>`;
}

function modeSeg(current) {
  const desc = { relaxed: 'Gentle steps', balanced: 'Steady growth', challenging: 'Push harder' };
  return html`<div class="seg" role="radiogroup">${['relaxed', 'balanced', 'challenging'].map((m) => html`<label><input type="radio" name="difficultyMode" value="${m}" ${m === current ? html`checked` : ''}><b>${m[0].toUpperCase() + m.slice(1)}</b><small>${desc[m]}</small></label>`)}</div>`;
}

// ---------- home ----------

const SHORT = { programming: 'Code', fitness: 'Fitness', learning: 'Learning', creativity: 'Creative', communication: 'Social', finance: 'Finance', problem: 'Logic', discipline: 'Discipline' };

function radar(state) {
  const skills = state.skills.filter((s) => s.enabled).slice(0, 10);
  if (skills.length < 3) return html`<p class="small muted center">Enable at least 3 skills to see your attribute chart.</p>`;
  const lv = skills.map((s) => levelInfo(s.xp, state.settings.skillCurve).level);
  const max = Math.max(4, ...lv);
  const C = 50; const R = 27;
  const pt = (i, f) => {
    const a = -Math.PI / 2 + (i / skills.length) * Math.PI * 2;
    return [C + Math.cos(a) * R * f, C + Math.sin(a) * R * f];
  };
  const poly = (f) => skills.map((_, i) => pt(i, typeof f === 'function' ? f(i) : f).map((v) => v.toFixed(2)).join(',')).join(' ');
  return html`<svg class="radar" viewBox="0 0 100 100" role="img" aria-label="Attributes: ${skills.map((s, i) => `${s.name} level ${lv[i]}`).join(', ')}">
    ${[0.25, 0.5, 0.75, 1].map((f) => html`<polygon points="${poly(f)}" class="rg"></polygon>`)}
    ${skills.map((_, i) => { const [x, y] = pt(i, 1); return html`<line x1="50" y1="50" x2="${x}" y2="${y}" class="rg"></line>`; })}
    <polygon points="${poly((i) => Math.max(0.06, lv[i] / max))}" class="rv"></polygon>
    ${skills.map((s, i) => { const [x, y] = pt(i, Math.max(0.06, lv[i] / max)); return html`<circle cx="${x}" cy="${y}" r="1.6" fill="${s.color}"></circle>`; })}
    ${skills.map((s, i) => {
      const [x, y] = pt(i, 1.3);
      return html`<text x="${x}" y="${y}" text-anchor="${x < 45 ? 'end' : x > 55 ? 'start' : 'middle'}" dominant-baseline="middle">${SHORT[s.id] || s.name.slice(0, 9)} <tspan class="rl">${lv[i]}</tspan></text>`;
    })}
  </svg>`;
}

export function home(state, ui, now) {
  const p = state.profile;
  const lv = levelInfo(p.lifetimeXp, state.settings.curve);
  const st = streaks(state, now);
  const m = computeMetrics(state);
  const today = state.quests.filter((q) => q.status === 'active' && (q.type === 'daily' || (q.dueAt && q.dueAt <= endOfDay(now))));
  const doneToday = state.completions.filter((c) => new Date(c.at).toDateString() === new Date(now).toDateString()).length;
  const boss = state.bosses.find((b) => b.status === 'active');
  const defs = allAchievementDefs(state);
  const recent = [...state.achievements].sort((a, b) => b.unlockedAt - a.unlockedAt).slice(0, 4);
  return html`
    <section class="hero card glow">
      <div class="hero-top">
        <div class="hero-avatar">${ring(lv.progress, 104, 6, 'gold')}<span>${p.avatar}</span><div class="lv-plate"><small>LV</small>${lv.level}</div></div>
        <div class="grow">
          <div class="kicker">${rankTitle(lv.level)}</div>
          <h1>${p.name}</h1>
          <div class="xp-num"><b>${lv.currentXp}</b> / ${lv.needed} XP</div>
          ${bar(lv.progress, 'xp')}
          <div class="small muted" style="margin-top:6px">${lv.toNext} XP to level ${lv.level + 1}</div>
        </div>
      </div>
      <div class="hud">
        <div><span class="hud-ic" style="--c:#ff9f43">${icon('flame', 18)}</span><b>${st.current}</b><small>Streak</small></div>
        <div><span class="hud-ic" style="--c:#5ce1ff">${icon('sword', 18)}</span><b>${m.questsCompleted}</b><small>Quests</small></div>
        <div><span class="hud-ic" style="--c:#ff4d6d">${icon('bosses', 18)}</span><b>${m.bossesDefeated}</b><small>Bosses</small></div>
        <div><span class="hud-ic" style="--c:#ffc857">${icon('achievements', 18)}</span><b>${state.achievements.length}</b><small>Badges</small></div>
      </div>
    </section>

    ${sectionTitle('Daily missions', html`<span class="sec-meta">${doneToday} done today</span>`)}
    ${today.length ? today.slice(0, 4).map((q) => questCard(state, q, now))
      : empty('target', 'No missions due today', 'Pick a recommended quest or create your own.', html`<a class="btn primary" href="#/quests">${icon('plus', 16)} Find a quest</a>`)}
    ${today.length > 4 ? html`<a class="btn ghost block" href="#/quests">View all ${today.length} missions ${icon('chevron', 16)}</a>` : ''}

    ${boss ? html`${sectionTitle('Boss encounter')}${bossCard(state, boss)}` : ''}

    ${sectionTitle('Attributes', html`<a class="sec-link" href="#/skills">Skill tree ${icon('chevron', 14)}</a>`)}
    <div class="card radar-card">${radar(state)}</div>

    ${sectionTitle('Recent badges', html`<a class="sec-link" href="#/achievements">All ${icon('chevron', 14)}</a>`)}
    ${recent.length ? html`<div class="badge-row">${recent.map((a) => {
      const d = defs.find((x) => x.id === a.id) || { id: a.id, name: a.id, icon: '★' };
      return html`<div class="mini-badge"><div class="hex on">${achievementGlyph(d, 20)}</div><span>${d.name}</span></div>`;
    })}</div>` : empty('achievements', 'No badges yet', 'Complete your first quest to earn one.')}`;
}

// ---------- quests ----------

function dueLabel(q, now) {
  if (!q.dueAt || q.status !== 'active') return '';
  if (q.dueAt < now) return html`<span class="tag warn">Overdue · no penalty</span>`;
  const hrs = (q.dueAt - now) / 3600000;
  return html`<span class="tag">${hrs < 24 ? `${Math.max(1, Math.round(hrs))}h left` : `Due ${fmtDate(q.dueAt)}`}</span>`;
}

const TYPE_LABEL = { daily: 'Daily', weekly: 'Weekly', custom: 'Quest', longterm: 'Long-term' };
const SOURCE_LABEL = { recommendation: 'Suggested', planner: 'Planner', ai: 'AI draft', recurring: 'Recurring' };

export function questCard(state, q, now) {
  const skill = skillOf(state, q.skillId);
  const boss = q.bossId && state.bosses.find((b) => b.id === q.bossId);
  const blocked = q.prerequisites.map((id) => state.quests.find((x) => x.id === id)).filter((x) => x && x.status !== 'completed');
  const open = q.steps.filter((s) => !s.done).length;
  const statusTag = {
    completed: html`<span class="tag good">${icon('check', 12)} Done ${fmtDate(q.completedAt)}</span>`,
    expired: html`<span class="tag">Missed · no penalty</span>`,
    abandoned: html`<span class="tag">Abandoned</span>`,
  }[q.status];
  return html`
    <article class="card quest ${q.status !== 'active' ? 'done' : ''}" style="--c:${skill?.color || '#5ce1ff'}" data-quest="${q.id}">
      <div class="q-top">
        ${rank(q.difficulty)}
        <div class="grow">
          <div class="q-kicker">${TYPE_LABEL[q.type]}${q.repeats ? ' · Repeats' : ''}${q.source !== 'manual' ? ` · ${SOURCE_LABEL[q.source]}` : ''}</div>
          <h3>${q.title}</h3>
        </div>
        <div class="reward"><b>+${q.xpReward}</b><small>XP</small></div>
      </div>
      <div class="q-meta">
        ${skill ? html`<span class="tag skill">${skillGlyph(skill, 13)} ${skill.name}</span>` : ''}
        <span class="tag">${icon('clock', 12)} ${q.estimatedMinutes}m</span>
        ${boss ? html`<span class="tag boss">${icon('bosses', 12)} ${boss.title}</span>` : ''}
        ${dueLabel(q, now)} ${statusTag || ''}
      </div>
      ${q.description ? html`<p class="q-desc">${q.description}</p>` : ''}
      ${q.criteria ? html`<div class="q-crit">${icon('target', 13)}<span>${q.criteria}</span></div>` : ''}
      ${q.steps.length ? html`<div class="steps-head"><span>Objectives</span><span>${q.steps.length - open}/${q.steps.length}</span></div>
        <ul class="steps">${q.steps.map((st) => html`<li><label><input type="checkbox" data-action="toggle-step" data-qid="${q.id}" data-sid="${st.id}" ${st.done ? html`checked` : ''} ${q.status !== 'active' ? html`disabled` : ''}><span class="${st.done ? 's-done' : ''}">${st.title}</span></label></li>`)}</ul>` : ''}
      ${blocked.length && q.status === 'active' ? html`<div class="q-lock">${icon('lock', 13)} Requires: ${blocked.map((b) => b.title).join(', ')}</div>` : ''}
      ${q.status === 'active' ? html`
        <div class="q-actions">
          <button class="btn primary grow" data-action="complete" data-id="${q.id}" ${blocked.length || open ? html`disabled title="Finish objectives and prerequisites first"` : ''}>${icon('check', 18)} Complete</button>
          <button class="iconbtn" data-action="edit-quest" data-id="${q.id}" aria-label="Edit" title="Edit">${icon('edit', 18)}</button>
          <button class="iconbtn" data-action="postpone" data-id="${q.id}" aria-label="Postpone one day" title="Postpone 1 day">${icon('postpone', 18)}</button>
          <button class="iconbtn" data-action="abandon" data-id="${q.id}" aria-label="Abandon" title="Abandon">${icon('abandon', 18)}</button>
        </div>` : ''}
      ${['expired', 'abandoned'].includes(q.status) && !(q.repeats && q.spawnedNext) ? html`<div class="q-actions"><button class="btn sm" data-action="restore" data-id="${q.id}">${icon('undo', 16)} Restore</button></div>` : ''}
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
    <div class="page-head">
      <div><div class="kicker">Quest board</div><h1>Missions</h1></div>
      <div class="row"><button class="btn sm" data-action="open-planner">${icon('sparkle', 16)} Plan goal</button><button class="btn sm primary" data-action="new-quest">${icon('plus', 16)} New</button></div>
    </div>
    ${tab === 'active' ? suggestionsBlock(state, ui) : ''}
    <div class="tabs" role="toolbar">${[['active', 'Active'], ['completed', 'Completed'], ['inactive', 'Missed']].map(([id, label]) => html`<button data-action="quest-tab" data-tab="${id}" aria-pressed="${tab === id}">${label}<span>${groups[id].length}</span></button>`)}</div>
    ${list.length ? list.slice(0, 60).map((q) => questCard(state, q, now))
      : tab === 'active' ? empty('quests', 'Board is clear', 'Accept a recommendation above or create your own quest.')
        : empty(tab === 'completed' ? 'check' : 'calendar', 'Nothing here yet', tab === 'completed' ? 'Completed quests will be listed here.' : 'Missed and abandoned quests land here. They never cost XP.')}`;
}

function suggestionsBlock(state, ui) {
  const r = ui.suggestions;
  if (!r) return '';
  return html`
    <div class="sec"><h2>Recommended</h2><span class="sec-meta">${state.settings.difficultyMode} · ${r.available} min free</span></div>
    ${r.suggestions.length ? html`<div class="carousel">${r.suggestions.map((sg, i) => {
      const skill = skillOf(state, sg.draft.skillId);
      return html`<div class="card sugg" style="--c:${skill?.color || '#5ce1ff'}">
        <div class="q-top">${rank(sg.draft.difficulty)}<div class="grow"><div class="q-kicker">${skill ? skill.name : 'General'}</div><h3>${sg.draft.title}</h3></div></div>
        <div class="q-meta"><span class="tag">${icon('clock', 12)} ${sg.draft.estimatedMinutes}m</span><span class="tag xp">+${sg.xp} XP</span></div>
        <details class="why"><summary>${icon('info', 14)} Why this quest?</summary><ul>${sg.reasons.map((x) => html`<li>${x}</li>`)}</ul></details>
        <button class="btn primary block" data-action="accept-suggestion" data-i="${i}">${icon('plus', 16)} Accept</button>
      </div>`;
    })}</div>` : html`<p class="muted small">Every suggestion is already on your board.</p>`}`;
}

export function questForm(state, q, preset = {}) {
  const v = q || { type: 'daily', difficulty: 2, estimatedMinutes: 30, steps: [], prerequisites: [], ...preset };
  const others = state.quests.filter((x) => x.id !== v.id && ['active', 'completed'].includes(x.status));
  const enabledSkills = state.skills.filter((s) => s.enabled || s.id === v.skillId);
  const bosses = state.bosses.filter((b) => b.status === 'active' || b.id === v.bossId);
  return html`
    <form data-form="quest" novalidate>
      <div class="dhead"><h3>${q ? 'Edit quest' : 'New quest'}</h3>${closeBtn}</div>
      <div class="dbody">
        <input type="hidden" name="id" value="${v.id || ''}">
        <label class="f">Title<input name="title" required maxlength="${LIMITS.title}" value="${v.title || ''}" placeholder="What will you do?"></label>
        <label class="f">Description<textarea name="description" maxlength="500">${v.description || ''}</textarea></label>
        <label class="f">Done when…<input name="criteria" maxlength="500" placeholder="How will you know it's complete?" value="${v.criteria || ''}"></label>
        <div class="grid2">
          <label class="f">Type<select name="type">${[['daily', 'Daily'], ['weekly', 'Weekly'], ['custom', 'Custom'], ['longterm', 'Long-term objective']].map(([id, l]) => html`<option value="${id}" ${v.type === id ? html`selected` : ''}>${l}</option>`)}</select></label>
          <label class="f">Skill<select name="skillId"><option value="">None</option>${enabledSkills.map((s) => html`<option value="${s.id}" ${v.skillId === s.id ? html`selected` : ''}>${s.name}</option>`)}</select></label>
          <label class="f">Difficulty<select name="difficulty">${[1, 2, 3, 4, 5].map((d) => html`<option value="${d}" ${Number(v.difficulty) === d ? html`selected` : ''}>Rank ${RANK[d]} · ${DIFFICULTY[d].label}</option>`)}</select></label>
          <label class="f">Minutes<input name="estimatedMinutes" type="number" inputmode="numeric" min="5" max="480" value="${v.estimatedMinutes}"></label>
        </div>
        <label class="check"><input type="checkbox" name="repeats" ${v.repeats ? html`checked` : ''}><span>Repeat every day/week<small>Daily and weekly only. A missed one just skips, nothing is lost.</small></span></label>
        <label class="f">Due date <i>custom & long-term</i><input type="date" name="dueAt" value="${toDateInput(v.dueAt)}"></label>
        <label class="f">Objectives <i>one per line, optional</i><textarea name="steps" rows="3">${v.steps.map((s) => s.title || s).join('\n')}</textarea></label>
        ${others.length ? html`<label class="f">Prerequisites<select name="prerequisites" multiple size="${Math.min(4, others.length)}">${others.map((x) => html`<option value="${x.id}" ${v.prerequisites.includes(x.id) ? html`selected` : ''}>${x.title}</option>`)}</select></label>` : ''}
        <div class="grid2">
          <label class="f">Goal<select name="goalId"><option value="">None</option>${state.goals.filter((g) => g.status === 'active' || g.id === v.goalId).map((g) => html`<option value="${g.id}" ${v.goalId === g.id ? html`selected` : ''}>${g.title}</option>`)}</select></label>
          ${bosses.length ? html`<label class="f">Boss stage<select name="bossStage"><option value="">None</option>${bosses.map((b) => b.stages.filter((s) => s.status !== 'cleared' || s.id === v.stageId).map((s) => html`<option value="${b.id}|${s.id}" ${v.stageId === s.id ? html`selected` : ''}>${b.title}: ${s.title}</option>`))}</select></label>` : ''}
        </div>
        <p class="note">${icon('info', 14)} XP is calculated from rank, time and objectives, so it can't be inflated.</p>
        <div class="err" data-err></div>
      </div>
      <div class="dfoot"><button type="button" class="btn ghost" data-action="close-modal">Cancel</button><button class="btn primary" type="submit">${q ? 'Save' : 'Create quest'}</button></div>
    </form>`;
}

export function plannerForm(state, ui) {
  const plan = ui.plan;
  const aiOn = state.settings.ai.provider === 'anthropic';
  return html`
    <div class="dhead"><h3>${icon('sparkle', 18)} Plan a goal</h3>${closeBtn}</div>
    <div class="dbody">
      <form data-form="plan">
        <label class="f">Your goal<input name="goal" required maxlength="80" placeholder="e.g. Build a functional Python project" value="${plan?.goal || ''}"></label>
        <label class="f">Skill<select name="skillId"><option value="">Auto-detect</option>${state.skills.filter((s) => s.enabled).map((s) => html`<option value="${s.id}" ${plan?.skillId === s.id ? html`selected` : ''}>${s.name}</option>`)}</select></label>
        <p class="note">${icon('info', 14)} ${aiOn ? 'Uses your AI provider. Falls back to local rules if it fails or you are offline.' : 'Uses the built-in local planner (no AI, works offline). AI can be enabled in Settings.'}</p>
        <button class="btn primary block" type="submit" ${ui.planning ? html`disabled` : ''}>${ui.planning ? 'Planning…' : 'Break it down'}</button>
      </form>
      ${plan?.result ? planPreview(state, plan) : ''}
    </div>`;
}

function planPreview(state, plan) {
  const r = plan.result;
  if (!r.ok) return html`<p class="err">${r.error}</p>`;
  return html`
    <form data-form="plan-accept" class="plan">
      ${r.warning ? html`<p class="note warn">${icon('info', 14)} ${r.warning}</p>` : ''}
      <div class="kicker">${r.source === 'ai' ? 'AI draft · validated' : 'Local planner draft'}</div>
      <p class="small muted">${r.explanation}</p>
      <p class="small"><b>Choose what to add.</b> Nothing is added until you confirm.</p>
      ${r.quests.map((q, i) => q.ok ? html`
        <label class="check plan-item"><input type="checkbox" name="pick" value="${i}" checked>
          <span>${rank(q.draft.difficulty)}<span class="grow"><b>${q.draft.title}</b><small>${q.draft.estimatedMinutes} min · +${q.draft.xp} XP · ${q.draft.criteria}</small></span></span></label>`
        : html`<div class="rejected">${icon('x', 14)} Rejected: ${q.errors.join('; ')}</div>`)}
      <div class="q-actions">
        <button class="btn primary grow" type="submit" name="mode" value="quests">Add quests</button>
        ${r.stages.length >= 2 ? html`<button class="btn danger-fill grow" type="submit" name="mode" value="boss">${icon('bosses', 16)} Make boss battle</button>` : ''}
      </div>
    </form>`;
}

// ---------- skills ----------

const UNLOCK_LEVEL = { 1: 1, 2: 1, 3: 2, 4: 4, 5: 6 };

function constellation(state) {
  const skills = state.skills.filter((s) => s.enabled);
  const lv = levelInfo(state.profile.lifetimeXp, state.settings.curve);
  const two = skills.length > 10;
  const pos = skills.map((_, i) => {
    const r = two ? (i % 2 ? 26 : 41) : 38;
    const a = -Math.PI / 2 + (i / skills.length) * Math.PI * 2;
    return [50 + Math.cos(a) * r, 50 + Math.sin(a) * r];
  });
  return html`
    <div class="constellation">
      <svg viewBox="0 0 100 100" aria-hidden="true">
        <circle cx="50" cy="50" r="${two ? 41 : 38}" class="orbit"></circle>${two ? html`<circle cx="50" cy="50" r="26" class="orbit"></circle>` : ''}
        ${skills.map((s, i) => {
          const sl = levelInfo(s.xp, state.settings.skillCurve).level;
          return html`<line x1="50" y1="50" x2="${pos[i][0]}" y2="${pos[i][1]}" stroke="${s.color}" class="link" style="opacity:${Math.min(0.9, 0.18 + sl * 0.08)}"></line>`;
        })}
      </svg>
      <div class="core">${ring(lv.progress, 76, 4, 'gold')}<span>${state.profile.avatar}</span><b>LV ${lv.level}</b></div>
      ${skills.map((s, i) => {
        const li = levelInfo(s.xp, state.settings.skillCurve);
        return html`<button class="snode" style="left:${pos[i][0]}%;top:${pos[i][1]}%;--c:${s.color}" data-action="skill-detail" data-id="${s.id}" aria-label="${s.name}, level ${li.level}">
          ${ring(li.progress, 54, 3)}<span class="sn-g">${skillGlyph(s, 20)}</span><b class="sn-lv">${li.level}</b>
          <span class="sn-name">${s.name.split(' ').pop()}</span>
        </button>`;
      })}
    </div>`;
}

export function skills(state) {
  return html`
    <div class="page-head">
      <div><div class="kicker">Skill tree</div><h1>Abilities</h1></div>
      <button class="btn sm primary" data-action="new-skill">${icon('plus', 16)} Skill</button>
    </div>
    <div class="card glow">${constellation(state)}<p class="small muted center" style="margin:6px 0 0">Tap a node. Skills grow only from quests and boss battles in that skill.</p></div>
    ${sectionTitle('Branches')}
    ${state.skills.map((s) => {
      const li = levelInfo(s.xp, state.settings.skillCurve);
      return html`
        <div class="card branch ${s.enabled ? '' : 'off'}" style="--c:${s.color}" data-action="skill-detail" data-id="${s.id}" role="button" tabindex="0">
          <div class="row">
            <div class="node">${skillGlyph(s, 22)}</div>
            <div class="grow">
              <div class="row spread"><b>${s.name}</b><span class="lvtag">LV ${li.level}</span></div>
              ${bar(li.progress, 'thin skillbar')}
              <div class="small faint">${s.xp} XP · ${li.toNext} to next${s.enabled ? '' : ' · disabled'}</div>
            </div>
          </div>
          <div class="path" aria-label="Milestones">${SKILL_MILESTONES.map((m, i) => html`${i ? html`<span class="ln ${li.level >= m ? 'on' : ''}"></span>` : ''}<span class="m ${li.level >= m ? 'on' : ''}" title="Milestone: level ${m}">${m}</span>`)}</div>
        </div>`;
    })}`;
}

export function skillDetail(state, id) {
  const s = skillOf(state, id);
  const li = levelInfo(s.xp, state.settings.skillCurve);
  const related = state.quests.filter((q) => q.skillId === id);
  const history = state.ledger.filter((e) => e.skillId === id).slice(-8).reverse();
  const active = new Set(state.quests.filter((q) => q.status === 'active').map((q) => q.title));
  return html`
    <div class="dhead" style="--c:${s.color}"><span class="node sm">${skillGlyph(s, 18)}</span><h3>${s.name}</h3>${closeBtn}</div>
    <div class="dbody" style="--c:${s.color}">
      <div class="skill-hero">
        <div class="sh-ring">${ring(li.progress, 84, 5)}<b>${li.level}</b><small>LEVEL</small></div>
        <div class="grow"><div class="xp-num"><b>${li.currentXp}</b> / ${li.needed} XP</div>${bar(li.progress, 'skillbar')}<div class="small faint" style="margin-top:4px">${s.xp} XP total</div></div>
      </div>
      <div class="sec"><h2>Milestones</h2></div>
      <div class="milestones">${SKILL_MILESTONES.map((m) => html`<span class="ms ${li.level >= m ? 'on' : ''}">${li.level >= m ? icon('check', 12) : icon('lock', 12)} ${m}</span>`)}</div>
      <div class="sec"><h2>Challenges</h2></div>
      ${templatesFor(s).map((t) => {
        const need = UNLOCK_LEVEL[t.d];
        const locked = li.level < need;
        return html`<div class="challenge ${locked ? 'locked' : ''}">
          ${rank(t.d)}
          <div class="grow"><div>${t.t}</div><div class="small faint">${t.m} min${locked ? ` · unlocks at level ${need}` : ''}</div></div>
          ${locked ? html`<span class="iconbtn ghost" aria-label="Locked">${icon('lock', 16)}</span>` : active.has(t.t) ? html`<span class="tag">On board</span>`
            : html`<button class="btn sm" data-action="accept-challenge" data-skill="${s.id}" data-d="${t.d}" ${s.enabled ? '' : html`disabled`}>Accept</button>`}
        </div>`;
      })}
      <div class="sec"><h2>Related quests · ${related.length}</h2></div>
      ${related.length ? related.slice(-6).reverse().map((q) => html`<div class="line-item"><span class="grow">${q.title}</span><span class="tag">${q.status}</span></div>`) : html`<p class="small muted">None yet.</p>`}
      <div class="sec"><h2>XP history</h2></div>
      ${history.length ? history.map((e) => html`<div class="line-item"><span class="grow faint">${fmtDateTime(e.at)}</span><span class="tag xp">+${e.amount}</span></div>`) : html`<p class="small muted">No XP earned in this skill yet.</p>`}
      <div class="sec"><h2>Manage</h2></div>
      <form data-form="skill">
        <input type="hidden" name="id" value="${s.id}">
        <div class="grid2"><label class="f">Name<input name="name" maxlength="40" required value="${s.name}"></label><label class="f">Symbol<input name="icon" maxlength="4" value="${s.icon}"></label></div>
        <label class="f">Colour<input type="color" name="color" value="${s.color}"></label>
        <div class="err" data-err></div>
        <div class="q-actions"><button class="btn primary grow" type="submit">Save</button><button type="button" class="btn ${s.enabled ? 'danger' : ''} grow" data-action="toggle-skill" data-id="${s.id}">${s.enabled ? 'Disable' : 'Enable'}</button></div>
        <p class="note">${icon('info', 14)} Disabling hides it from new quests and suggestions. Its XP is kept.</p>
      </form>
    </div>`;
}

export function newSkillForm() {
  return html`
    <form data-form="skill">
      <div class="dhead"><h3>New skill</h3>${closeBtn}</div>
      <div class="dbody">
        <div class="grid2"><label class="f">Name<input name="name" maxlength="40" required placeholder="e.g. Cooking"></label><label class="f">Symbol<input name="icon" maxlength="4" value="◆"></label></div>
        <label class="f">Colour<input type="color" name="color" value="#8ab4ff"></label>
        <div class="err" data-err></div>
      </div>
      <div class="dfoot"><button type="button" class="btn ghost" data-action="close-modal">Cancel</button><button class="btn primary" type="submit">Add skill</button></div>
    </form>`;
}

// ---------- bosses ----------

function hpBar(b) {
  return html`<div class="hp" aria-label="${b.stages.filter((s) => s.status !== 'cleared').length} of ${b.stages.length} stages remaining">${b.stages.map((s) => html`<i class="${s.status}"></i>`)}</div>`;
}

function bossCard(state, b) {
  const cleared = b.stages.filter((s) => s.status === 'cleared').length;
  const current = b.stages.find((s) => s.status === 'active');
  return html`
    <article class="card boss ${b.status}" data-action="boss-detail" data-id="${b.id}" role="button" tabindex="0">
      <div class="boss-art">${icon(b.status === 'defeated' ? 'crown' : 'bosses', 34)}</div>
      <div class="grow">
        <div class="kicker">${b.status === 'defeated' ? `Defeated ${fmtDate(b.defeatedAt)}` : b.status === 'abandoned' ? 'Retreated' : `Stage ${cleared + 1} of ${b.stages.length}`}</div>
        <h3>${b.title}</h3>
        ${hpBar(b)}
        ${current && b.status === 'active' ? html`<div class="small muted" style="margin-top:6px">${icon('sword', 13)} ${current.title}</div>` : ''}
      </div>
      ${icon('chevron', 18, 'faint')}
    </article>`;
}

export function bosses(state) {
  const order = { active: 0, abandoned: 1, defeated: 2 };
  const list = [...state.bosses].sort((a, b) => order[a.status] - order[b.status]);
  return html`
    <div class="page-head">
      <div><div class="kicker">Milestone battles</div><h1>Bosses</h1></div>
      <button class="btn sm primary" data-action="new-boss">${icon('plus', 16)} Summon</button>
    </div>
    <p class="small muted" style="margin:-4px 0 12px">Turn a major goal into staged milestones. Each stage is a real step forward.</p>
    ${list.length ? list.map((b) => bossCard(state, b))
      : empty('bosses', 'No bosses yet', 'Create one from a big goal, or use “Plan goal” on the Quest board.', html`<button class="btn primary" data-action="new-boss">${icon('plus', 16)} Summon a boss</button>`)}`;
}

export function bossDetail(state, id) {
  const b = state.bosses.find((x) => x.id === id);
  const skill = skillOf(state, b.skillId);
  return html`
    <div class="dhead boss-dhead"><span class="boss-art sm">${icon('bosses', 20)}</span><h3>${b.title}</h3>${closeBtn}</div>
    <div class="dbody">
      ${b.description ? html`<p class="muted">${b.description}</p>` : ''}
      <div class="q-meta">${rank(b.difficulty)}${skill ? html`<span class="tag skill" style="--c:${skill.color}">${skillGlyph(skill, 13)} ${skill.name}</span>` : ''}<span class="tag xp">Stage +${b.stages[0].xp}</span><span class="tag xp">Defeat +${b.xpReward}</span></div>
      ${hpBar(b)}
      <ol class="stages">${b.stages.map((s, i) => {
        const linked = state.quests.filter((q) => q.bossId === b.id && q.stageId === s.id && q.status !== 'abandoned');
        const open = linked.filter((q) => q.status !== 'completed');
        const final = i === b.stages.length - 1;
        return html`<li class="${s.status}">
          <span class="st-dot">${s.status === 'cleared' ? icon('check', 14) : s.status === 'locked' ? icon('lock', 12) : i + 1}</span>
          <div class="kicker">${final ? 'Final boss' : `Stage ${i + 1}`}${s.status === 'cleared' ? ` · cleared ${fmtDate(s.clearedAt)}` : ''}</div>
          <b>${s.title}</b>
          ${s.objective ? html`<div class="small muted">${s.objective}</div>` : ''}
          ${s.note ? html`<div class="small faint">“${s.note}”</div>` : ''}
          ${linked.length ? html`<div class="st-quests">${linked.map((q) => html`<div class="${q.status === 'completed' ? 'ok' : ''}">${icon(q.status === 'completed' ? 'check' : 'target', 13)} ${q.title}</div>`)}</div>` : ''}
          ${s.status === 'active' && b.status === 'active' ? html`<div class="q-actions">
            <button class="btn sm" data-action="new-quest" data-boss="${b.id}" data-stage="${s.id}">${icon('plus', 14)} Stage quest</button>
            <button class="btn sm danger-fill" data-action="clear-stage" data-boss="${b.id}" data-stage="${s.id}" ${open.length ? html`disabled title="Finish linked quests first"` : ''}>${icon('sword', 14)} Clear stage</button>
          </div>${open.length ? html`<div class="small faint" style="margin-top:6px">Finish the linked quest${open.length > 1 ? 's' : ''} to unlock the attack.</div>` : ''}` : ''}
        </li>`;
      })}</ol>
      <div class="sec"><h2>Battle log</h2></div>
      ${b.history.slice().reverse().map((h) => html`<div class="line-item"><span class="grow">${h.action}</span><span class="faint small">${fmtDateTime(h.at)}</span></div>`)}
      <div class="q-actions">
        ${b.status === 'active' ? html`<button class="btn sm ghost" data-action="boss-status" data-id="${b.id}" data-status="abandoned">${icon('flag', 14)} Retreat (keeps XP)</button>` : ''}
        ${b.status === 'abandoned' ? html`<button class="btn sm" data-action="boss-status" data-id="${b.id}" data-status="active">${icon('sword', 14)} Resume battle</button>` : ''}
      </div>
    </div>`;
}

export function bossForm(state, preset) {
  const stages = preset?.stages?.length ? preset.stages : [{ title: '' }, { title: '' }, { title: '' }];
  return html`
    <form data-form="boss" novalidate>
      <div class="dhead boss-dhead"><span class="boss-art sm">${icon('bosses', 20)}</span><h3>Summon a boss</h3>${closeBtn}</div>
      <div class="dbody">
        <label class="f">Major goal<input name="title" required maxlength="80" placeholder="e.g. Build a functional Python project" value="${preset?.title || ''}"></label>
        <label class="f">Description<textarea name="description" maxlength="500">${preset?.description || ''}</textarea></label>
        <div class="grid2">
          <label class="f">Skill<select name="skillId"><option value="">None</option>${state.skills.filter((s) => s.enabled).map((s) => html`<option value="${s.id}" ${preset?.skillId === s.id ? html`selected` : ''}>${s.name}</option>`)}</select></label>
          <label class="f">Difficulty<select name="difficulty">${[1, 2, 3, 4, 5].map((d) => html`<option value="${d}" ${d === 3 ? html`selected` : ''}>Rank ${RANK[d]} · ${DIFFICULTY[d].label}</option>`)}</select></label>
        </div>
        <div class="f"><span>Stages <i>the last one is the final boss</i></span></div>
        <div data-stages>${stages.map((s, i) => stageRow(s, i))}</div>
        <button type="button" class="btn sm ghost" data-action="add-stage-row">${icon('plus', 14)} Add stage</button>
        <div class="err" data-err></div>
      </div>
      <div class="dfoot"><button type="button" class="btn ghost" data-action="close-modal">Cancel</button><button class="btn danger-fill" type="submit">Summon boss</button></div>
    </form>`;
}

export function stageRow(s = {}, i = 0) {
  return html`<div class="stage-row" data-stage-row>
    <div class="row"><input class="f-input grow" name="stageTitle" maxlength="80" placeholder="Stage ${i + 1} title" value="${s.title || ''}"><button type="button" class="iconbtn" data-action="remove-stage-row" aria-label="Remove stage">${icon('x', 16)}</button></div>
    <input class="f-input" name="stageObjective" maxlength="500" placeholder="Completion requirement" value="${s.objective || ''}">
  </div>`;
}

export function clearStageForm(boss, stage) {
  return html`
    <form data-form="clear-stage">
      <div class="dhead boss-dhead"><span class="boss-art sm">${icon('sword', 20)}</span><h3>Clear “${stage.title}”?</h3></div>
      <div class="dbody">
        <input type="hidden" name="bossId" value="${boss.id}"><input type="hidden" name="stageId" value="${stage.id}">
        ${stage.objective ? html`<div class="q-crit">${icon('target', 13)}<span>${stage.objective}</span></div>` : ''}
        <label class="check"><input type="checkbox" name="confirm" required><span>I have genuinely met this stage’s requirement.</span></label>
        <label class="f">Evidence / note <i>optional</i><textarea name="note" maxlength="300" placeholder="What did you finish?"></textarea></label>
        <div class="err" data-err></div>
      </div>
      <div class="dfoot"><button type="button" class="btn ghost" data-action="close-modal">Not yet</button><button class="btn danger-fill" type="submit">${icon('sword', 16)} Strike · +${stage.xp} XP</button></div>
    </form>`;
}

// ---------- achievements ----------

export function achievements(state) {
  const metrics = computeMetrics(state);
  const unlocked = new Map(state.achievements.map((a) => [a.id, a]));
  const defs = allAchievementDefs(state);
  return html`
    <div class="page-head">
      <div><div class="kicker">Hall of fame</div><h1>Badges <span class="h-count">${state.achievements.length}/${defs.length}</span></h1></div>
      <button class="btn sm" data-action="new-achievement">${icon('plus', 16)} Custom</button>
    </div>
    <div class="badges">${defs.map((d) => {
      const u = unlocked.get(d.id);
      const val = Math.min(metricValue(metrics, d), d.threshold);
      return html`<div class="badge ${u ? 'on' : ''}">
        <div class="hex ${u ? 'on' : ''}">${achievementGlyph(d)}</div>
        <h3>${d.name}</h3>
        <p>${d.description}</p>
        ${u ? html`<span class="tag good">${fmtDate(u.unlockedAt)}${u.xp ? ` · +${u.xp} XP` : ''}</span>`
          : html`${bar(val / d.threshold, 'thin goldbar')}<div class="small faint" style="margin-top:4px">${val} / ${d.threshold}</div>`}
        ${d.custom ? html`<div class="small faint" style="margin-top:4px">Custom · badge only</div>` : ''}
      </div>`;
    })}</div>
    <p class="note" style="margin-top:14px">${icon('shield', 14)} Badges reward steady, healthy progress. None reward overwork, skipped sleep or spending money.</p>`;
}

export function achievementForm(state) {
  return html`
    <form data-form="achievement">
      <div class="dhead"><h3>Custom badge</h3>${closeBtn}</div>
      <div class="dbody">
        <div class="grid2"><label class="f">Name<input name="name" required maxlength="50"></label><label class="f">Symbol<input name="icon" maxlength="4" value="★"></label></div>
        <label class="f">Description<input name="description" maxlength="200"></label>
        <label class="f">Unlock when<select name="metric">${Object.entries(ACHIEVEMENT_METRICS).map(([k, l]) => html`<option value="${k}">${l}</option>`)}</select></label>
        <div class="grid2">
          <label class="f">Reaches<input type="number" name="threshold" min="1" max="100000" value="10" required></label>
          <label class="f">Skill <i>per-skill only</i><select name="skillId">${state.skills.map((s) => html`<option value="${s.id}">${s.name}</option>`)}</select></label>
        </div>
        <p class="note">${icon('info', 14)} Custom badges grant no XP, so they can’t be used to farm levels.</p>
        <div class="err" data-err></div>
      </div>
      <div class="dfoot"><button type="button" class="btn ghost" data-action="close-modal">Cancel</button><button class="btn primary" type="submit">Create</button></div>
    </form>`;
}

// ---------- stats ----------

function columnChart(rows, valueKey, labelFn, { height = 130, unit = '' } = {}) {
  const w = 320; const padB = 18; const padT = 18;
  const max = Math.max(1, ...rows.map((r) => r[valueKey]));
  const bw = w / rows.length;
  const y = (v) => padT + (height - padB - padT) * (1 - v / max);
  return html`<svg class="chart" viewBox="0 0 ${w} ${height}" role="img" aria-label="${rows.map((r) => `${labelFn(r)}: ${r[valueKey]}${unit}`).join(', ')}">
    <line class="grid" x1="0" x2="${w}" y1="${y(max)}" y2="${y(max)}"></line>
    <line class="grid" x1="0" x2="${w}" y1="${y(max / 2)}" y2="${y(max / 2)}"></line>
    <line class="axis" x1="0" x2="${w}" y1="${y(0)}" y2="${y(0)}"></line>
    <text x="0" y="${y(max) - 5}">${max}${unit}</text>
    ${rows.map((r, i) => {
      const v = r[valueKey];
      const bh = Math.max(v ? 3 : 0, y(0) - y(v));
      return html`<g><title>${labelFn(r)}: ${v}${unit}</title>
        <rect x="${i * bw}" y="${padT}" width="${bw}" height="${height - padB - padT}" fill="transparent"></rect>
        ${v ? html`<rect class="bar-mark" x="${i * bw + bw * 0.16}" y="${y(0) - bh}" width="${bw * 0.68}" height="${bh}" rx="2"></rect>` : ''}</g>`;
    })}
    <text x="0" y="${height - 4}">${labelFn(rows[0])}</text><text x="${w}" y="${height - 4}" text-anchor="end">${labelFn(rows[rows.length - 1])}</text>
  </svg>`;
}

const tile = (ic, c, value, label) => html`<div class="tile"><span class="hud-ic" style="--c:${c}">${icon(ic, 16)}</span><b>${value}</b><small>${label}</small></div>`;

export function stats(state, ui, now) {
  const s = buildStats(state, now);
  const head = html`<div class="page-head"><div><div class="kicker">Progress report</div><h1>Statistics</h1></div></div>`;
  if (!s.hasData) {
    return html`${head}${empty('stats', 'No data yet', 'Stats appear after your first completed quest. Nothing here is estimated or invented.', html`<a class="btn primary" href="#/quests">Go to quests</a>`)}
      ${s.totals.activeQuests ? html`<div class="card"><div class="kicker">Planned, not completed</div><b>${s.totals.activeQuests} active quests · ${s.totals.plannedMinutes} min</b></div>` : ''}`;
  }
  const r = s.resolution;
  const maxCat = Math.max(1, ...s.categories.map((c) => c.count));
  return html`
    ${head}
    <div class="tiles">
      ${tile('check', '#34d399', s.totals.completed, 'Completed')}
      ${tile('bolt', '#ffc857', s.totals.lifetimeXp, 'Lifetime XP')}
      ${tile('target', '#5ce1ff', r.rate === null ? '–' : `${Math.round(r.rate * 100)}%`, 'Completion')}
      ${tile('flame', '#ff9f43', s.records.currentStreak, 'Streak')}
    </div>

    <div class="card">
      <div class="kicker">Done vs missed</div>
      <div class="split"><i style="flex:${r.completed};background:var(--good)"></i><i style="flex:${r.missed};background:var(--faint)"></i><i style="flex:${r.abandoned};background:#3a4566"></i></div>
      <div class="legend"><span><i style="background:var(--good)"></i>Done ${r.completed}</span><span><i style="background:var(--faint)"></i>Missed ${r.missed}</span><span><i style="background:#3a4566"></i>Abandoned ${r.abandoned}</span></div>
      <div class="small muted" style="margin-top:8px">${s.totals.completedMinutes} min completed · ${s.totals.activeQuests} quests (${s.totals.plannedMinutes} min) still planned. Planned work never counts as done.</div>
    </div>

    ${sectionTitle('XP earned · 30 days')}
    <div class="card">${columnChart(s.xpByDay, 'xp', (d) => fmtDate(`${d.key}T12:00:00`), { unit: ' XP' })}</div>

    ${sectionTitle('Weekly activity')}
    <div class="card">${columnChart(s.weekly, 'quests', (w) => `Wk ${fmtDate(`${w.key}T12:00:00`)}`)}</div>

    ${sectionTitle('Most active categories')}
    <div class="card">${s.categories.map((c) => html`<div class="hbar"><span>${c.name}</span><div class="bar thin"><i style="width:${(c.count / maxCat) * 100}%;background:${c.color};box-shadow:none"></i></div><b>${c.count}</b></div>`)}</div>

    ${sectionTitle('Skill levels')}
    <div class="card">${s.skills.map((k) => html`<div class="hbar" style="--c:${k.color}"><span>${k.name}</span>${bar(k.progress, 'thin skillbar')}<b>${k.level}</b></div>`)}</div>

    ${s.bosses.length ? html`${sectionTitle('Boss battles')}<div class="card">${s.bosses.map((b) => html`<div class="hbar"><span>${b.title}</span>${bar(b.cleared / b.total, 'thin hpbar')}<b>${b.cleared}/${b.total}</b></div>`)}</div>` : ''}
    ${s.goals.length ? html`${sectionTitle('Goals')}<div class="card">${s.goals.map((g) => html`<div class="hbar"><span>${g.title}</span>${bar(g.total ? g.done / g.total : 0, 'thin')}<b>${g.done}/${g.total}</b></div>`)}</div>` : ''}

    ${sectionTitle('Personal records')}
    <div class="tiles">
      ${tile('bolt', '#ffc857', s.records.bestDayXp.value, 'Best day XP')}
      ${tile('sword', '#5ce1ff', s.records.bestDayQuests.value, 'Best day quests')}
      ${tile('flame', '#ff9f43', s.records.longestStreak, 'Longest streak')}
      ${tile('star', '#8b7bff', s.records.level, 'Level reached')}
    </div>`;
}

// ---------- profile & settings ----------

export function profile(state, ui) {
  const p = state.profile;
  const st = state.settings;
  return html`
    <div class="page-head"><div><div class="kicker">Character & settings</div><h1>Profile</h1></div></div>
    <form class="card" data-form="profile">
      <div class="kicker">Character</div>
      <div class="grid2"><label class="f">Name<input name="name" maxlength="40" required value="${p.name}"></label>
        <label class="f">Avatar<select name="avatar">${[...new Set([p.avatar, ...AVATARS])].map((a) => html`<option ${a === p.avatar ? html`selected` : ''}>${a}</option>`)}</select></label></div>
      <div class="f"><span>Focus skills <i>up to 4</i></span></div>
      <div class="pick-grid">${state.skills.filter((s) => s.enabled).map((s) => html`<label class="pick" style="--c:${s.color}"><input type="checkbox" name="focus" value="${s.id}" ${p.focusSkillIds.includes(s.id) ? html`checked` : ''}><span>${skillGlyph(s, 16)}${s.name}</span></label>`)}</div>
      <div class="err" data-err></div>
      <button class="btn primary" type="submit" style="margin-top:12px">Save character</button>
    </form>

    ${sectionTitle('Goals', html`<button class="btn sm" data-action="new-goal">${icon('plus', 14)} Goal</button>`)}
    ${state.goals.length ? state.goals.map((g) => {
      const skill = skillOf(state, g.skillId);
      return html`<div class="card goal ${g.status}"><div class="row"><span class="hud-ic" style="--c:${skill?.color || '#5ce1ff'}">${icon('flag', 16)}</span><div class="grow"><b>${g.title}</b><div class="small muted">${skill ? `${skill.name} · ` : ''}${g.status}</div></div></div>
        <div class="q-actions">${g.status === 'active' ? html`<button class="btn sm" data-action="goal-status" data-id="${g.id}" data-status="achieved">${icon('check', 14)} Achieved</button><button class="btn sm ghost" data-action="goal-status" data-id="${g.id}" data-status="archived">Archive</button>`
          : html`<button class="btn sm ghost" data-action="goal-status" data-id="${g.id}" data-status="active">Reopen</button>`}</div></div>`;
    }) : html`<p class="small muted">Goals steer your recommendations. Link quests and bosses to them.</p>`}

    ${sectionTitle('Gameplay')}
    <form class="card" data-form="settings">
      <div class="f"><span>Challenge mode</span></div>
      ${modeSeg(st.difficultyMode)}
      <p class="note">${icon('shield', 14)} Missed days never cost XP in any mode.</p>
      <label class="f">Time per day <b class="num" data-out="dm2">${st.dailyMinutes}</b> min<input type="range" name="dailyMinutes" min="10" max="600" step="5" value="${st.dailyMinutes}" data-mirror="dm2"></label>
      <div class="f"><span>XP curve <i>XP to next level = base × level^exponent</i></span></div>
      <div class="grid2"><label class="f">Base<input type="number" name="curveBase" min="10" max="10000" value="${st.curve.base}"></label><label class="f">Exponent<input type="number" name="curveExp" min="1" max="3" step="0.05" value="${st.curve.exponent}"></label></div>
      <label class="check"><input type="checkbox" name="notify" ${st.notifications.enabled ? html`checked` : ''}><span>Daily reminder<small>One gentle nudge, only if you have open quests. Off by default. No server, no tracking.</small></span></label>
      <label class="f">Reminder time<input type="time" name="notifyTime" value="${st.notifications.time}"></label>
      <label class="check"><input type="checkbox" name="reduceMotion" ${st.reduceMotion ? html`checked` : ''}><span>Reduce motion</span></label>
      <div class="err" data-err></div>
      <button class="btn primary" type="submit">Save settings</button>
    </form>

    ${sectionTitle('AI assistant · optional')}
    <form class="card" data-form="ai">
      <label class="f">Provider<select name="provider"><option value="local" ${st.ai.provider === 'local' ? html`selected` : ''}>Local rules only (offline, no AI)</option><option value="anthropic" ${st.ai.provider === 'anthropic' ? html`selected` : ''}>Anthropic Claude (your API key)</option></select></label>
      <label class="f">Model<input name="model" maxlength="60" value="${st.ai.model}"></label>
      <label class="f">API key ${ui.hasKey ? html`<span class="tag good chip">saved</span>` : ''}<input name="apiKey" type="password" autocomplete="off" placeholder="${ui.hasKey ? 'Leave blank to keep the saved key' : 'sk-ant-…'}"></label>
      <label class="f">Timeout (seconds)<input type="number" name="timeout" min="5" max="120" value="${st.ai.timeoutMs / 1000}"></label>
      <p class="note">${icon('lock', 14)} The key stays on this device: never exported, never logged. AI drafts are validated and you choose what to add.</p>
      <div class="err" data-err></div>
      <div class="q-actions"><button class="btn primary" type="submit">Save AI settings</button>${ui.hasKey ? html`<button type="button" class="btn danger" data-action="forget-key">Forget key</button>` : ''}</div>
    </form>

    ${sectionTitle('Your data')}
    <div class="card">
      <p class="small muted" style="margin-top:0">Everything lives on this device. No account, no tracking, no ads, no purchases.</p>
      <div class="data-actions">
        <button class="btn" data-action="export">${icon('download', 16)} Export</button>
        <label class="btn">${icon('upload', 16)} Import<input type="file" accept="application/json,.json" data-action="import" class="sr-only"></label>
        <button class="btn danger" data-action="delete-all">${icon('trash', 16)} Delete all</button>
      </div>
      <p class="small faint">Schema v${state.schemaVersion} · ${state.ledger.length} XP records · since ${fmtDate(p.createdAt)}</p>
    </div>`;
}

export function goalForm(state) {
  return html`
    <form data-form="goal">
      <div class="dhead"><h3>New goal</h3>${closeBtn}</div>
      <div class="dbody">
        <label class="f">Goal<input name="title" required maxlength="80" placeholder="e.g. Get comfortable speaking in public"></label>
        <label class="f">Why it matters<textarea name="description" maxlength="500"></textarea></label>
        <label class="f">Skill<select name="skillId"><option value="">None</option>${state.skills.filter((s) => s.enabled).map((s) => html`<option value="${s.id}">${s.name}</option>`)}</select></label>
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
        <p class="muted">This permanently removes your character, quests, XP history, badges and saved API key from this device. Consider exporting first.</p>
        <label class="f">Type DELETE to confirm<input name="confirm" autocomplete="off" required></label>
        <div class="err" data-err></div>
      </div>
      <div class="dfoot"><button type="button" class="btn ghost" data-action="close-modal">Cancel</button><button class="btn danger-fill" type="submit">Delete everything</button></div>
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
  const xp = events.filter((e) => e.type === 'xp').reduce((n, e) => n + e.amount, 0);
  return html`
    <div class="celebrate ${boss ? 'boss-win' : ''}">
      <div class="rays"></div>
      ${boss ? html`<div class="cel-ic">${icon('crown', 46)}</div><div class="kicker">Boss defeated</div><h2 class="cel-title">${boss.title}</h2>` : ''}
      ${lvl ? html`<div class="kicker">Level up</div><div class="cel-hex"><span>${lvl.to}</span></div><p class="muted">You reached <b>${rankTitle(lvl.to)}</b> level ${lvl.to}. Real progress, earned.</p>` : ''}
      ${xp ? html`<div class="tag xp lg">+${xp} XP</div>` : ''}
      <button class="btn primary block lg" data-action="close-modal">Continue</button>
    </div>`;
}

// Shared view helpers: formatting, icons, charts, shell. Pure functions returning html``.

import { html, trusted } from '../html.js';

// ---------- formatting ----------

let fmtCtx = { currency: 'INR', locale: 'en-IN' };
export const setFormat = (settings) => { fmtCtx = { currency: settings.currency, locale: settings.locale }; };

export function money(x, { compact = false } = {}) {
  if (x === null || x === undefined || !Number.isFinite(x)) return '—';
  try {
    return new Intl.NumberFormat(fmtCtx.locale, { style: 'currency', currency: fmtCtx.currency, maximumFractionDigits: compact ? 1 : Math.abs(x) < 100 && !Number.isInteger(x) ? 2 : 0, notation: compact && Math.abs(x) >= 1e5 ? 'compact' : 'standard' }).format(x);
  } catch { return x.toFixed(0); }
}
export const num = (x, d = 1) => (x === null || x === undefined || !Number.isFinite(x) ? '—' : new Intl.NumberFormat(fmtCtx.locale, { maximumFractionDigits: d }).format(x));
export const pct = (x, d = 1) => (x === null || x === undefined || !Number.isFinite(x) ? '—' : `${x > 0 ? '+' : ''}${num(x, d)}%`);
export const date = (t) => new Date(t).toLocaleDateString(fmtCtx.locale, { year: 'numeric', month: 'short', day: 'numeric' });

/** Formats a value by its declared unit (see unitFor in engine/scenario.js). */
export function fmtValue(unit, x) {
  if (x === null || x === undefined || (typeof x === 'number' && !Number.isFinite(x))) return '—';
  switch (unit) {
    case 'money': return money(x);
    case 'pct': return `${num(x, 2)}%`;
    case 'hours': return `${num(x, 1)} h`;
    case 'weeks': return `${num(x, 1)} wk`;
    case 'months': return `${num(x, 1)} mo`;
    case 'count': return num(x, 1);
    case 'date': return date(x);
    default: return num(x, 2);
  }
}

// ---------- icons ----------

const P = {
  home: '<path d="M3 11l9-8 9 8"/><path d="M5 10v10h14V10"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  flask: '<path d="M9 3h6M10 3v6L4.5 19a1.5 1.5 0 0 0 1.3 2h12.4a1.5 1.5 0 0 0 1.3-2L14 9V3"/><path d="M7 15h10"/>',
  compare: '<path d="M8 3v18M16 3v18"/><path d="M3 8h5M16 16h5M3 13h5M16 11h5"/>',
  history: '<path d="M3 12a9 9 0 1 0 3-6.7L3 8"/><path d="M3 3v5h5M12 7v5l3 2"/>',
  chip: '<rect x="6" y="6" width="12" height="12" rx="2"/><path d="M9 2v4M15 2v4M9 18v4M15 18v4M2 9h4M2 15h4M18 9h4M18 15h4"/>',
  settings: '<circle cx="12" cy="12" r="3"/><path d="M12 2v3M12 19v3M4.2 4.2l2.1 2.1M17.7 17.7l2.1 2.1M2 12h3M19 12h3M4.2 19.8l2.1-2.1M17.7 6.3l2.1-2.1"/>',
  tree: '<circle cx="12" cy="5" r="2"/><circle cx="6" cy="19" r="2"/><circle cx="18" cy="19" r="2"/><path d="M12 7v5M12 12l-6 5M12 12l6 5"/>',
  business: '<path d="M3 21h18M5 21V8l7-5 7 5v13"/><path d="M9 21v-6h6v6"/>',
  career: '<path d="M2 9l10-5 10 5-10 5z"/><path d="M6 11v5c3 2 9 2 12 0v-5"/>',
  custom: '<path d="M4 7h16M4 12h10M4 17h6"/><circle cx="18" cy="16" r="3"/>',
  download: '<path d="M12 3v12M7 10l5 5 5-5M4 21h16"/>',
  upload: '<path d="M12 17V5M7 10l5-5 5 5M4 21h16"/>',
  trash: '<path d="M4 7h16M9 7V4h6v3M6 7l1 14h10l1-14"/>',
  copy: '<rect x="8" y="8" width="12" height="12" rx="2"/><path d="M16 8V5a1 1 0 0 0-1-1H5a1 1 0 0 0-1 1v10a1 1 0 0 0 1 1h3"/>',
  edit: '<path d="M4 20h4L19 9l-4-4L4 16z"/>',
  x: '<path d="M6 6l12 12M18 6L6 18"/>',
  check: '<path d="M5 12.5l4.5 4.5L19 7.5"/>',
  info: '<circle cx="12" cy="12" r="9"/><path d="M12 11v6M12 7.5v.5"/>',
  warn: '<path d="M12 3l10 18H2z"/><path d="M12 10v5M12 18v.5"/>',
  sparkle: '<path d="M12 3l2.2 6.8L21 12l-6.8 2.2L12 21l-2.2-6.8L3 12l6.8-2.2z"/>',
  dice: '<rect x="4" y="4" width="16" height="16" rx="3"/><circle cx="9" cy="9" r="1.2"/><circle cx="15" cy="15" r="1.2"/><circle cx="15" cy="9" r="1.2"/><circle cx="9" cy="15" r="1.2"/>',
  play: '<path d="M7 4l13 8-13 8z"/>',
  stop: '<rect x="6" y="6" width="12" height="12" rx="1"/>',
  chevron: '<path d="M9 6l6 6-6 6"/>',
  lock: '<rect x="5" y="11" width="14" height="10" rx="2"/><path d="M8 11V8a4 4 0 0 1 8 0v3"/>',
  file: '<path d="M6 3h8l5 5v13H6z"/><path d="M14 3v5h5"/>',
};
export const icon = (name, size = 18) => html`<svg class="i" width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${trusted(P[name] || P.info)}</svg>`;

export const TYPE_ICON = { business: 'business', career: 'career', custom: 'custom' };

// ---------- small components ----------

export const SOURCE_STYLE = { fact: 'src-fact', assumption: 'src-assume', example: 'src-example', ai: 'src-ai' };
export const SOURCE_SHORT = { fact: 'Fact', assumption: 'Assumption', example: 'Example', ai: 'AI · confirm' };

export const empty = (ic, title, text, action = '') => html`<div class="empty"><div class="empty-ic">${icon(ic, 26)}</div><b>${title}</b><p>${text}</p>${action}</div>`;
export const closeBtn = html`<button type="button" class="iconbtn" data-action="close-modal" aria-label="Close">${icon('x')}</button>`;
export const notice = (kind, text) => html`<div class="notice ${kind}">${icon(kind === 'warn' ? 'warn' : 'info', 16)}<div>${text}</div></div>`;

export function kpi(label, value, sub = '', tone = '') {
  return html`<div class="kpi ${tone}"><span>${label}</span><b>${value}</b>${sub ? html`<small>${sub}</small>` : ''}</div>`;
}

// ---------- charts (SVG, no dependencies) ----------

const W = 340;

/** series: [{ name, color, values: number[] }], labels: string[] */
export function lineChart(series, labels, { height = 170, format = (v) => num(v, 0), title = '' } = {}) {
  const all = series.flatMap((s) => s.values).filter(Number.isFinite);
  if (!all.length) return '';
  const lo = Math.min(0, ...all); const hi = Math.max(0, ...all);
  const pad = { l: 4, r: 4, t: 18, b: 18 };
  const n = labels.length;
  const x = (i) => pad.l + (n === 1 ? (W - pad.l - pad.r) / 2 : (i * (W - pad.l - pad.r)) / (n - 1));
  const y = (v) => pad.t + (height - pad.t - pad.b) * (1 - (v - lo) / (hi - lo || 1));
  const path = (vals) => vals.map((v, i) => `${i ? 'L' : 'M'}${x(i).toFixed(1)},${y(v).toFixed(1)}`).join('');
  return html`<figure class="chart">
    ${title ? html`<figcaption>${title}</figcaption>` : ''}
    <svg viewBox="0 0 ${W} ${height}" role="img" aria-label="${title}: ${series.map((s) => `${s.name} from ${format(s.values[0])} to ${format(s.values[s.values.length - 1])}`).join('; ')}">
      <line class="axis" x1="0" x2="${W}" y1="${y(0)}" y2="${y(0)}"></line>
      <text x="${W}" y="12" text-anchor="end">${format(hi)}</text>
      ${lo < 0 ? html`<text x="${W}" y="${height - 4}" text-anchor="end">${format(lo)}</text>` : ''}
      ${series.map((s, si) => html`
        ${si === 0 ? html`<path d="${path(s.values)}L${x(n - 1)},${y(0)}L${x(0)},${y(0)}Z" fill="${s.color}" opacity=".12"></path>` : ''}
        <path d="${path(s.values)}" fill="none" stroke="${s.color}" stroke-width="2" stroke-linejoin="round" ${s.dash ? html`stroke-dasharray="4 4"` : ''}></path>
        ${s.values.map((v, i) => html`<circle cx="${x(i)}" cy="${y(v)}" r="${n > 40 ? 0 : 3}" fill="${s.color}"><title>${labels[i]} · ${s.name}: ${format(v)}</title></circle>`)}`)}
      <text x="${pad.l}" y="${height - 4}">${labels[0]}</text>
      <text x="${W / 2}" y="${height - 4}" text-anchor="middle">${labels[Math.floor((n - 1) / 2)]}</text>
    </svg>
    ${series.length > 1 ? html`<div class="legend">${series.map((s) => html`<span><i style="background:${s.color}"></i>${s.name}</span>`)}</div>` : ''}
  </figure>`;
}

export function barChart(values, labels, { height = 140, format = (v) => num(v, 0), title = '' } = {}) {
  if (!values.length) return '';
  const lo = Math.min(0, ...values); const hi = Math.max(0, ...values);
  const t = 16; const b = 16;
  const y = (v) => t + (height - t - b) * (1 - (v - lo) / (hi - lo || 1));
  const bw = W / values.length;
  return html`<figure class="chart">
    ${title ? html`<figcaption>${title}</figcaption>` : ''}
    <svg viewBox="0 0 ${W} ${height}" role="img" aria-label="${title}">
      <line class="axis" x1="0" x2="${W}" y1="${y(0)}" y2="${y(0)}"></line>
      ${values.map((v, i) => html`<rect class="${v >= 0 ? 'pos' : 'neg'}" x="${i * bw + bw * 0.15}" width="${bw * 0.7}" y="${Math.min(y(v), y(0))}" height="${Math.max(1, Math.abs(y(v) - y(0)))}" rx="2"><title>${labels[i]}: ${format(v)}</title></rect>`)}
      <text x="${W}" y="11" text-anchor="end">${format(hi)}</text>
      ${lo < 0 ? html`<text x="${W}" y="${height - 3}" text-anchor="end">${format(lo)}</text>` : ''}
      <text x="0" y="${height - 3}">${labels[0]}</text>
    </svg></figure>`;
}

/** rows: [{ label, low, high }], base value. Bars show the range each input moves the result. */
export function tornado(rows, base, format) {
  if (!rows.length) return '';
  const lo = Math.min(base, ...rows.map((r) => Math.min(r.low, r.high)));
  const hi = Math.max(base, ...rows.map((r) => Math.max(r.low, r.high)));
  const sx = (v) => ((v - lo) / (hi - lo || 1)) * 100;
  return html`<div class="tornado">
    ${rows.map((r) => html`<div class="t-row"><span class="t-label">${r.label}</span>
      <div class="t-track"><i class="t-base" style="left:${sx(base)}%"></i>
        <i class="t-bar" title="${format(r.low)} to ${format(r.high)}" style="left:${Math.min(sx(r.low), sx(r.high))}%;width:${Math.max(0.8, Math.abs(sx(r.high) - sx(r.low)))}%"></i></div>
      <span class="t-val">${format(r.low)} → ${format(r.high)}</span></div>`)}
  </div>`;
}

export function histogram(bins, threshold, format) {
  const max = Math.max(...bins.map((b) => b.count), 1);
  const height = 130;
  const bw = W / bins.length;
  return html`<figure class="chart"><svg viewBox="0 0 ${W} ${height}" role="img" aria-label="Distribution of simulated outcomes">
    ${bins.map((b, i) => html`<rect class="${b.to <= threshold ? 'neg' : 'pos'}" x="${i * bw + 1}" width="${bw - 2}" y="${height - 16 - (b.count / max) * (height - 30)}" height="${(b.count / max) * (height - 30)}" rx="1.5"><title>${format(b.from)} to ${format(b.to)}: ${b.count} trials</title></rect>`)}
    <text x="0" y="${height - 3}">${format(bins[0].from)}</text>
    <text x="${W}" y="${height - 3}" text-anchor="end">${format(bins[bins.length - 1].to)}</text>
  </svg></figure>`;
}

// ---------- shell ----------

export const NAV = [['home', 'home', 'Home'], ['create', 'plus', 'Create'], ['lab', 'flask', 'Lab'], ['compare', 'compare', 'Compare'], ['history', 'history', 'History']];

export function shell(route, aiLabel, body) {
  const cur = (r) => (route === r ? html`aria-current="page"` : '');
  return html`
    <header class="topbar">
      <a class="brand" href="#/home" aria-label="WHAT IF? home"><span class="logo-mark">?</span><span>WHAT IF<em>?</em></span></a>
      <a class="ai-chip ${aiLabel.ready ? 'on' : ''}" href="#/models" title="${aiLabel.text}">${icon('chip', 15)}<span>${aiLabel.short}</span></a>
      <a class="iconbtn" href="#/settings" ${cur('settings')} aria-label="Settings">${icon('settings')}</a>
    </header>
    <main id="main" tabindex="-1">${body}</main>
    <nav class="nav" aria-label="Main">${NAV.map(([id, ic, label]) => html`<a href="#/${id}" ${cur(id)}>${icon(ic, 21)}<span>${label}</span></a>`)}</nav>`;
}

export const pageHead = (kicker, title, actions = '') => html`<div class="page-head"><div><div class="kicker">${kicker}</div><h1>${title}</h1></div>${actions ? html`<div class="row">${actions}</div>` : ''}</div>`;

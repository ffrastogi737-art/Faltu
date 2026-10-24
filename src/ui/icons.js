// Inline SVG icon set (24px grid, stroke = currentColor) so every glyph matches and renders offline.
import { html, trusted } from './html.js';

const P = {
  home: '<path d="M3 11l9-8 9 8"/><path d="M5 10v10h14V10"/><path d="M10 20v-6h4v6"/>',
  quests: '<path d="M7 3h11a2 2 0 0 1 2 2v12"/><path d="M5 7a2 2 0 0 1 2-2v14a2 2 0 0 0 2 2h9a2 2 0 0 0 2-2v-2H9"/><path d="M10 9h6M10 13h6"/>',
  skills: '<circle cx="12" cy="5" r="2.5"/><circle cx="5" cy="19" r="2.5"/><circle cx="19" cy="19" r="2.5"/><path d="M12 7.5v4M12 11.5l-5.2 5.4M12 11.5l5.2 5.4"/>',
  bosses: '<path d="M12 3a8 8 0 0 0-8 8c0 2.8 1.4 4.6 3 5.6V21h10v-4.4c1.6-1 3-2.8 3-5.6a8 8 0 0 0-8-8z"/><circle cx="9" cy="11.5" r="1.6"/><circle cx="15" cy="11.5" r="1.6"/><path d="M10.5 21v-2.5M13.5 21v-2.5"/>',
  stats: '<path d="M3 21h18"/><rect x="5" y="11" width="3" height="7" rx="1"/><rect x="10.5" y="5" width="3" height="13" rx="1"/><rect x="16" y="13" width="3" height="5" rx="1"/>',
  achievements: '<path d="M8 4h8v5a4 4 0 0 1-8 0V4z"/><path d="M8 6H5a3 3 0 0 0 3 4.5M16 6h3a3 3 0 0 1-3 4.5"/><path d="M12 13v4M8 21h8M9.5 17h5"/>',
  profile: '<path d="M4 6h9M17 6h3M4 12h3M11 12h9M4 18h11M19 18h1"/><circle cx="15" cy="6" r="2"/><circle cx="9" cy="12" r="2"/><circle cx="17" cy="18" r="2"/>',
  check: '<path d="M5 12.5l4.5 4.5L19 7.5"/>',
  clock: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  sparkle: '<path d="M12 3l2.2 6.8L21 12l-6.8 2.2L12 21l-2.2-6.8L3 12l6.8-2.2z"/>',
  x: '<path d="M6 6l12 12M18 6L6 18"/>',
  lock: '<rect x="5" y="11" width="14" height="10" rx="2"/><path d="M8 11V8a4 4 0 0 1 8 0v3"/>',
  flame: '<path d="M12 3c1 4 5 5.5 5 10a5 5 0 0 1-10 0c0-2.5 1.5-3.5 2-5 1 1.5 2 2 2 2s-.5-4 1-7z"/>',
  bolt: '<path d="M13 2L4 14h7l-1 8 9-12h-7z"/>',
  target: '<circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="5"/><circle cx="12" cy="12" r="1"/>',
  sword: '<path d="M14 4h6v6L9.5 20.5l-6-6z"/><path d="M5.5 12.5l6 6M3 21l2.5-2.5"/>',
  edit: '<path d="M4 20h4L19 9l-4-4L4 16z"/><path d="M14 6l4 4"/>',
  postpone: '<rect x="3" y="5" width="18" height="16" rx="2"/><path d="M3 10h18M8 3v4M16 3v4M10 15.5h5M13 13l2.5 2.5L13 18"/>',
  abandon: '<circle cx="12" cy="12" r="9"/><path d="M9 9l6 6M15 9l-6 6"/>',
  undo: '<path d="M9 14L4 9l5-5"/><path d="M4 9h11a5 5 0 0 1 0 10h-3"/>',
  download: '<path d="M12 3v12M7 10l5 5 5-5M4 21h16"/>',
  upload: '<path d="M12 17V5M7 10l5-5 5 5M4 21h16"/>',
  trash: '<path d="M4 7h16M9 7V4h6v3M6 7l1 14h10l1-14"/>',
  chevron: '<path d="M9 6l6 6-6 6"/>',
  shield: '<path d="M12 3l8 3v6c0 5-3.5 8-8 9-4.5-1-8-4-8-9V6z"/>',
  crown: '<path d="M3 8l4.5 4L12 5l4.5 7L21 8l-2 11H5z"/>',
  star: '<path d="M12 3l2.8 5.8 6.2.9-4.5 4.4 1 6.3L12 17.5 6.5 20.4l1-6.3L3 9.7l6.2-.9z"/>',
  arrowUp: '<path d="M12 20V5M6 11l6-6 6 6"/>',
  cap: '<path d="M2 9l10-5 10 5-10 5z"/><path d="M6 11v5c3 2 9 2 12 0v-5"/>',
  building: '<rect x="4" y="3" width="16" height="18" rx="1"/><path d="M9 7h2M13 7h2M9 11h2M13 11h2M10 21v-4h4v4"/>',
  calendar: '<rect x="3" y="5" width="18" height="16" rx="2"/><path d="M3 10h18M8 3v4M16 3v4M8.5 15l2.5 2.5 4.5-4.5"/>',
  flag: '<path d="M5 21V4M5 4h11l-2 4 2 4H5"/>',
  info: '<circle cx="12" cy="12" r="9"/><path d="M12 11v6M12 7.5v.5"/>',
  // skill glyphs
  programming: '<path d="M8 7l-5 5 5 5M16 7l5 5-5 5M14 4l-4 16"/>',
  fitness: '<path d="M6 7v10M3 9.5v5M18 7v10M21 9.5v5M6 12h12"/>',
  learning: '<path d="M3 5h6a3 3 0 0 1 3 3v12a2 2 0 0 0-2-2H3z"/><path d="M21 5h-6a3 3 0 0 0-3 3v12a2 2 0 0 1 2-2h7z"/>',
  creativity: '<path d="M12 3a9 9 0 0 0 0 18c1.5 0 2-1 2-2s-1-1.5-1-2.5 1-1.5 2-1.5h2a4 4 0 0 0 4-4c0-4.4-4-8-9-8z"/><circle cx="7.5" cy="11" r="1.2"/><circle cx="10" cy="7" r="1.2"/><circle cx="15" cy="7.5" r="1.2"/>',
  communication: '<path d="M4 5h16v11H9l-5 4z"/><path d="M8 9h8M8 12h5"/>',
  finance: '<circle cx="12" cy="12" r="9"/><path d="M15 9.5c-.5-1-1.6-1.5-3-1.5-1.7 0-3 .9-3 2s1.3 1.7 3 2 3 .9 3 2-1.3 2-3 2c-1.4 0-2.5-.5-3-1.5M12 6v2M12 16v2"/>',
  problem: '<path d="M4 4h6v2.5a1.5 1.5 0 1 0 3 0V4h7v7h-2.5a1.5 1.5 0 1 0 0 3H20v6h-7v-2.5a1.5 1.5 0 1 0-3 0V20H4v-6h2.5a1.5 1.5 0 1 0 0-3H4z"/>',
  discipline: '<path d="M12 3l8 3v6c0 5-3.5 8-8 9-4.5-1-8-4-8-9V6z"/><path d="M8.5 12l2.5 2.5 4.5-5"/>',
};

export function icon(name, size = 20, cls = '') {
  return html`<svg class="i ${cls}" width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${trusted(P[name] || P.star)}</svg>`;
}

/** Default skills get a drawn glyph; custom skills show the user's own symbol. */
export function skillGlyph(skill, size = 20) {
  if (P[skill.id]) return icon(skill.id, size);
  return html`<span class="glyph" style="font-size:${Math.round(size * 0.9)}px">${skill.icon}</span>`;
}

const ACH = {
  first_quest: 'sword', seven_quests: 'quests', first_skill_level: 'arrowUp', first_boss: 'crown',
  learning_milestone: 'cap', project_completed: 'building', personal_best: 'achievements', consistent_7: 'calendar', level_5: 'star',
};
export function achievementGlyph(def, size = 26) {
  if (ACH[def.id]) return icon(ACH[def.id], size);
  return html`<span class="glyph" style="font-size:${Math.round(size * 0.9)}px">${def.icon}</span>`;
}

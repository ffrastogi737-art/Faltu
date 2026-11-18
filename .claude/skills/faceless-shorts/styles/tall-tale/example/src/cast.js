// The GTA crew: original cartoon characters (no game art), built from the toon kit. One sheet to look at.
import { drawToon } from './core/toon.js';
await document.fonts.load('900 40px Inter');
export const CREW = {
  rookie:  { name: 'ROOKIE RAJ',   body: '#FF8A3D', pattern: 'plain', hat: 'backcap', hatCol: '#2F5DA8', hair: 'short', hairCol: '#2B1F1A', extra: ['headset', 'freckles'], headsetCol: '#E23B5C', mood: 'happy' },
  cop:     { name: 'OFFICER DAN',  body: '#3A63B8', neck: 'tie', neckCol: '#F2C230', hat: 'police', hatCol: '#1F3A78', extra: ['mustache'], mustacheCol: '#5A4636', mood: 'angry' },
  tony:    { name: 'BIG TONY',     body: '#7A2FD0', neck: 'chain', hair: 'slick', hairCol: '#16121A', beard: 'stubble', extra: ['sunglasses'], mood: 'smug' },
  lucy:    { name: 'LUCY',         body: '#E23B8E', hair: 'long', hairCol: '#5A2A1C', extra: ['sunglasses', 'earring', 'blush'], mood: 'sly' },
  hank:    { name: 'COWBOY HANK',  body: '#C0833C', pattern: 'vest', patCol: '#5A3A22', hat: 'cowboy', hatCol: '#8A5A32', band: '#3A2A22', beard: 'full', beardCol: '#7A5A3A', mood: 'proud' },
  gus:     { name: 'GRANDPA GUS',  body: '#6FA8A0', pattern: 'check', patCol: '#2E6B66', hair: 'sides', hairCol: '#D9D9E0', beard: 'full', beardCol: '#E6E6EE', extra: ['glasses'], mood: 'tired' },
  rex:     { name: 'BIKER REX',    body: '#2B2B33', pattern: 'vest', patCol: '#6B2A1C', hat: 'bandana', hatCol: '#D8343F', beard: 'goatee', beardCol: '#2A1C18', extra: ['scar'], mood: 'angry' },
  dee:     { name: 'DIVA DEE',     body: '#2FBF8F', hair: 'afro', hairCol: '#2A1A14', extra: ['sunglasses', 'earring'], neck: 'scarf', neckCol: '#F2C230', mood: 'laugh' },
  max:     { name: 'MOHAWK MAX',   body: '#D8343F', pattern: 'stripes', patCol: '#8F1F29', hair: 'mohawk', hairCol: '#3BD0C9', extra: ['earring', 'scar'], mood: 'shock' },
  pete:    { name: 'PARKA PETE',   body: '#8F8A5C', hat: 'hood', hatCol: '#B9B284', extra: ['snout', 'blush'], mood: 'tired' },
  moe:     { name: 'MAYOR MOE',    body: '#1F1C33', neck: 'bowtie', neckCol: '#D8343F', dots: 1, hat: 'tophat', hatCol: '#2A2638', band: '#D8343F', extra: ['monocle', 'mustache'], mood: 'smug' },
  nia:     { name: 'NEWBIE NIA',   body: '#F2C230', pattern: 'overalls', patCol: '#3E5FA8', hat: 'baseball', hatCol: '#E23B5C', band: '#FFFFFF', hair: 'ponytail', hairCol: '#6B3A24', extra: ['freckles'], mood: 'happy' },
};
if (location.pathname.endsWith('cast.html')) {
  const cv = document.getElementById('cv'), g = cv.getContext('2d'); const W = 1920, H = 1080;
  const sky = g.createLinearGradient(0, 0, 0, H); sky.addColorStop(0, '#3FA8FF'); sky.addColorStop(0.5, '#BFE6FF'); sky.addColorStop(0.5, '#E9A56A'); sky.addColorStop(1, '#D98A4C'); g.fillStyle = sky; g.fillRect(0, 0, W, H);
  g.fillStyle = '#FFFFFF'; [[200, 120, 120], [700, 80, 90], [1300, 140, 130], [1700, 90, 100]].forEach(([x, y, r]) => { g.beginPath(); g.ellipse(x, y, r, r * 0.4, 0, 0, 7); g.ellipse(x + r * 0.5, y - 14, r * 0.6, r * 0.34, 0, 0, 7); g.fill(); });
  g.font = '900 54px Inter'; g.textAlign = 'center'; g.lineJoin = 'round'; g.lineWidth = 14; g.strokeStyle = '#111'; g.strokeText('THE GTA CREW · original characters', W / 2, 62); g.fillStyle = '#FFE600'; g.fillText('THE GTA CREW · original characters', W / 2, 62);
  const keys = Object.keys(CREW), cols = 6, cw = W / cols, rh = 490, K = 0.4;
  keys.forEach((k, i) => { const c = CREW[k], col = i % cols, row = Math.floor(i / cols), x = col * cw + cw / 2, y = 90 + row * rh;
    g.save(); g.translate(x - 256 * K, y + 20); g.scale(K, K); drawToon(g, c, { mood: c.mood, armL: [14, 8], armR: [14, 8] }); g.restore();
    g.font = '900 30px Inter'; g.strokeText(c.name, x, y + 452); g.fillStyle = '#fff'; g.fillText(c.name, x, y + 452); });
  document.title = 'ready';
}

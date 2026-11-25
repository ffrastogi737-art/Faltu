// TERMINAL style (ported 25 Nov 2026 on the comic-pop engine): a bright-accent terminal window on an indigo gradient.
// vis.k: H hook (image + command + stamp) · L command lines · P proof image + credit · S big stat · Q closing question
import { ctx, W, H, lerp, seg, eo, eob, rnd, rr } from './core/lib.js';
import { L, Le, Wd } from './core/timing.js';
const MINT = '#5CFFB0', AMBER = '#FFC83D', PINK = '#FF5CA8', CYAN = '#5CD6FF', WIN = '#0E1126', INK = '#05060F', MONO = "'DejaVu Sans Mono','Liberation Mono',monospace";
const IMG = {};
export async function preload(script) {
  const names = [...new Set(script.lines.map((l) => l.vis.img).filter(Boolean))];
  await Promise.all(names.map((n) => new Promise((res, rej) => { const im = new Image(); im.onload = () => { IMG[n] = im; res(); }; im.onerror = () => rej(new Error('img ' + n)); im.src = `assets/${n}.jpg`; })));
}
function bg(t, k) {
  const g = ctx.createLinearGradient(0, 0, W, H); const P = [['#2B1B6B', '#0F1D4F'], ['#4B1D6B', '#16234F'], ['#133B63', '#2B1B6B']][k % 3]; g.addColorStop(0, P[0]); g.addColorStop(1, P[1]);
  ctx.fillStyle = g; ctx.fillRect(-300, -300, W + 600, H + 600);
  ctx.fillStyle = 'rgba(255,255,255,0.05)'; for (let y = 0; y < H; y += 8) ctx.fillRect(0, y + ((t * 20) % 8), W, 2);
  for (let i = 0; i < 18; i++) { const x = (rnd(i) * W + t * 12) % W, y = (rnd(i + 40) * H * 0.8 + t * (18 + i)) % (H * 0.8); ctx.fillStyle = 'rgba(92,255,176,0.18)'; ctx.font = `700 34px ${MONO}`; ctx.fillText(String.fromCharCode(0x30 + (i * 7) % 2), x, y + 100); }
}
function win(x, y, w, h, title, sc = 1, rot = 0) {
  if (sc <= 0) return; ctx.save(); ctx.translate(x + w / 2, y + h / 2); ctx.scale(sc, sc); ctx.rotate(rot); ctx.translate(-w / 2, -h / 2);
  rr(14, 18, w, h, 26); ctx.fillStyle = '#000'; ctx.fill(); rr(0, 0, w, h, 26); ctx.fillStyle = WIN; ctx.fill(); ctx.lineWidth = 6; ctx.strokeStyle = MINT; ctx.stroke();
  ctx.save(); rr(0, 0, w, h, 26); ctx.clip(); ctx.fillStyle = '#1B2150'; ctx.fillRect(0, 0, w, 70); ctx.restore();
  [[PINK, 40], [AMBER, 84], [MINT, 128]].forEach(([c, dx]) => { ctx.beginPath(); ctx.arc(dx, 35, 15, 0, 7); ctx.fillStyle = c; ctx.fill(); });
  ctx.font = `700 30px ${MONO}`; ctx.fillStyle = '#9AA6FF'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText(title, w / 2 + 40, 36); ctx.restore();
}
function mono(text, x, y, size, col, a = 1, maxW = 800, bold = 700) {
  ctx.save(); ctx.globalAlpha = a; ctx.font = `${bold} ${size}px ${MONO}`; const w = ctx.measureText(text).width; if (w > maxW) { size *= maxW / w; ctx.font = `${bold} ${size}px ${MONO}`; }
  ctx.textAlign = 'left'; ctx.textBaseline = 'middle'; ctx.fillStyle = col; ctx.fillText(text, x, y); ctx.restore();
}
function typed(text, p) { return text.slice(0, Math.floor(text.length * Math.min(1, Math.max(0, p)))); }
function cover(im, x, y, w, h, r = 18, z = 1, ox = 0) {
  ctx.save(); rr(x, y, w, h, r); ctx.clip(); const s = Math.max(w / im.width, h / im.height) * z, dw = im.width * s, dh = im.height * s; ctx.drawImage(im, x + (w - dw) / 2 + ox, y + (h - dh) / 2, dw, dh); ctx.restore();
  rr(x, y, w, h, r); ctx.lineWidth = 6; ctx.strokeStyle = MINT; ctx.stroke();
}
function pill(text, x, y, col, tc, sc = 1, size = 38) {
  if (sc <= 0) return; ctx.save(); ctx.translate(x, y); ctx.scale(sc, sc); ctx.font = `800 ${size}px Inter`; const w = ctx.measureText(text).width + size * 1.2, h = size * 1.7;
  rr(-w / 2 + 6, -h / 2 + 8, w, h, h / 2); ctx.fillStyle = '#000'; ctx.fill(); rr(-w / 2, -h / 2, w, h, h / 2); ctx.fillStyle = col; ctx.fill();
  ctx.fillStyle = tc; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText(text, 0, 3); ctx.restore();
}
function stampT(text, x, y, col, sc, rot = -0.12, size = 96) {
  if (sc <= 0) return; ctx.save(); ctx.translate(x, y); ctx.rotate(rot); ctx.scale(sc, sc); ctx.font = `900 ${size}px Inter`; const w = ctx.measureText(text).width + 70;
  rr(-w / 2, -size * 0.8, w, size * 1.6, 20); ctx.lineWidth = 14; ctx.strokeStyle = '#000'; ctx.stroke(); ctx.fillStyle = col; ctx.fill(); ctx.fillStyle = '#05060F'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText(text, 0, 6); ctx.restore();
}
function big(text, x, y, size, col, sc = 1, maxW = 940) {
  if (sc <= 0) return; ctx.save(); ctx.translate(x, y); ctx.scale(sc, sc); ctx.font = `900 ${size}px Inter`; const w = ctx.measureText(text).width; if (w > maxW) size *= maxW / w;
  ctx.font = `900 ${size}px Inter`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.lineJoin = 'round'; ctx.lineWidth = size * 0.16; ctx.strokeStyle = '#000'; ctx.strokeText(text, 0, 0); ctx.fillStyle = col; ctx.fillText(text, 0, 0); ctx.restore();
}
const caret = (t) => (Math.floor(t * 2.4) % 2 ? '█' : ' ');

export function buildShots(script) {
  const S = [], CUES = [], cue = (t, type, o = {}) => CUES.push({ t: +Math.max(0, t).toFixed(3), type, ...o });
  const lines = script.lines; let hold = 0; const cut = (i) => (i === 0 ? 0 : Math.max(L(i) - 0.08, hold));
  lines.forEach((ln, i) => {
    const v = ln.vis, st = cut(i), ls = L(i) - st, le = Le(i) - st; if (i > 0) cue(st, 'swoosh');
    let draw;
    if (v.k === 'H') {
      draw = (lt, d, t) => { bg(t, i); win(70, 170, 940, 1100, 'rdr2_game_files — zsh', eob(seg(lt, 0, 0.3)));
        const a = seg(lt, 0.1, 0.45); if (a > 0) { ctx.save(); ctx.globalAlpha = a; cover(IMG[v.img], 110, 270, 860, 480, 16, 1 + 0.06 * seg(lt, 0, d)); ctx.restore(); }
        mono('$ ' + typed(v.cmd, seg(lt, 0.15, 0.9)) + (lt < 1 ? caret(lt) : ''), 120, 830, 44, MINT, 1, 840);
        const o = seg(lt, 0.9, 1.1); v.out.forEach((s, j) => mono(s, 120, 930 + j * 90, 78, AMBER, o, 840, 900));
        mono('# unused texture, never seen in-game', 120, 1060, 34, '#7C86C8', seg(lt, 1.3, 1.5), 840);
        stampT(v.tag, 770, 1190, PINK, eob(seg(lt, 1.2, 1.5)), -0.1, 70); };
      cue(st + 0.9, 'hit'); cue(st + 0.1, 'pop');
    } else if (v.k === 'L') {
      const nout = v.out.length, tt = Math.min(0.95, (le - ls) * 0.4);
      draw = (lt, d, t) => { bg(t, i); win(70, 300, 940, 900, 'rdr2_game_files — zsh', eob(seg(lt, 0, 0.3)));
        mono('$ ' + typed(v.cmd, seg(lt, 0.2, 0.2 + tt)) + (lt < 0.2 + tt + 0.3 ? caret(lt) : ''), 115, 410, 44, MINT, 1, 850);
        v.out.forEach((s, j) => { const a = seg(lt, ls + 0.1 + j * Math.max(0.25, (le - ls) / (nout + 0.5)) * 0.8, ls + 0.3 + j * 0.5); const hi = v.hi === j, col = v.err ? (j ? AMBER : PINK) : hi ? AMBER : '#E6EAFF';
          mono((v.err ? '' : '> ') + s, 115, 550 + j * 150, hi ? 66 : 58, col, a, 850, 900); if (hi && a > 0.3) { ctx.save(); ctx.globalAlpha = a * 0.25; ctx.fillStyle = AMBER; rr(100, 550 + j * 150 - 56, 880, 112, 14); ctx.fill(); ctx.restore(); } });
        mono('$ ' + caret(t), 115, 560 + nout * 150 + 20, 44, MINT, seg(lt, ls + 0.8, ls + 1)); };
      for (let j = 0; j < nout; j++) cue(st + ls + 0.1 + j * 0.45, j === v.hi ? 'ding' : 'pop');
      if (v.err) cue(st + ls + 0.2, 'hit');
    } else if (v.k === 'P') {
      draw = (lt, d, t) => { bg(t, i); win(70, 200, 940, 1020, 'proof.png — viewer', eob(seg(lt, 0, 0.3)));
        const a = seg(lt, 0.1, 0.4); ctx.save(); ctx.globalAlpha = a; cover(IMG[v.img], 110, 300, 860, 600, 16, 1 + 0.08 * seg(lt, 0, d), -20 * seg(lt, 0, d)); ctx.restore();
        pill('SOURCE: ' + v.src, 540, 960, '#FFFFFF', '#05060F', eob(seg(lt, 0.3, 0.6)), 34);
        pill(v.label, 540, 1090, AMBER, '#05060F', eob(seg(lt, ls, ls + 0.3)), 44); };
      cue(st + 0.15, 'pop'); cue(st + ls, 'ding');
    } else if (v.k === 'S') {
      const pAt = (() => { try { return Wd(v.big.split(' ')[0].toLowerCase().slice(0, 4) === '2018' ? 'twenty' : 'fan', i) - st; } catch { return ls + 0.4; } })();
      draw = (lt, d, t) => { bg(t, i); win(70, 380, 940, 700, 'terminal', eob(seg(lt, 0, 0.3)));
        mono('$ echo "' + v.label + '"', 115, 480, 34, MINT, 1, 850);
        big(v.big, 540, 720, 200, AMBER, eob(seg(lt, pAt - 0.05, pAt + 0.2)), 820); mono('exit code: 0', 115, 1000, 38, '#7C86C8', seg(lt, pAt + 0.4, pAt + 0.6)); };
      cue(st + 0.05, 'riser', { dur: Math.max(0.3, pAt - 0.05) }); cue(st + pAt, 'boom'); hold = st + pAt + 0.7;
    } else if (v.k === 'Q') {
      draw = (lt, d, t) => { bg(t, i); win(70, 330, 940, 760, 'rdr2_game_files — zsh', eob(seg(lt, 0, 0.3)));
        mono('$ ask_viewers --question', 115, 440, 42, MINT, 1, 850); big(v.head, 540, 680, 150, '#FFFFFF', eob(seg(lt, 0.15, 0.45)), 860); big(v.sub, 540, 880, 78, PINK, eob(seg(lt, 0.5, 0.8)), 860); mono('$ ' + caret(t), 115, 1010, 44, MINT); };
      cue(st + 0.12, 'boing', { gain: 0.7 });
    }
    S.push({ id: `S${String(i).padStart(2, '0')}`, at: st, cam: [540, 800], zoom: 0.05, note: `${v.k} ${v.cmd || v.head || v.big || ''}`, draw });
  });
  return { shots: S, cues: CUES };
}

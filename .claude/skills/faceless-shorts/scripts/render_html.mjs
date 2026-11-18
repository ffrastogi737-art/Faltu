// Render ANY seekable HTML animation to MP4, in parallel segments (for LONG videos and Nafay-library styles).
// The page must expose window.seek(t) (draws film time t, pure function of t) and window.DURATION (seconds).
// Our own kit pages (src/main.js) expose both too, so this also renders our 16:9 long videos ~N times faster.
//
//   node render_html.mjs <project dir> <out.mp4> [--jobs 3] [--fps 30] [--size 1920x1080] [--audio data/mix.wav]
//                        [--from 0 --to 60] [--sfx] [--query "&capture=1"] [--q 0.93]
//   --audio   mux this file (relative to the project dir); default data/mix.wav if present
//   --sfx     the page's own sound kit: SFX.render(scoreSound, DURATION, 48000, {voiceover: true}) is written to
//             data/sfx.wav and mixed (-6 dB) under --audio (Nafay library pages ship that API)
//   --size    output size; frames are scaled with lanczos if the canvas differs (e.g. 720x1280 -> 1080x1920)
// Frames come from the first <canvas> (toDataURL JPEG); without a canvas, from a page screenshot.
// No npm packages. CHROME=/path overrides the browser.
import { spawn, spawnSync } from 'node:child_process';
import http from 'node:http';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const argv = process.argv.slice(2), opt = {}, pos = [];
for (let i = 0; i < argv.length; i++) { if (argv[i].startsWith('--')) { const k = argv[i].slice(2); opt[k] = argv[i + 1] && !argv[i + 1].startsWith('--') ? argv[++i] : true; } else pos.push(argv[i]); }
if (pos.length < 2) { console.log('usage: node render_html.mjs <project dir> <out.mp4> [--jobs 3] [--fps 30] [--size WxH] [--audio f] [--from s --to s] [--sfx]'); process.exit(1); }
const ROOT = path.resolve(pos[0]), OUT = path.resolve(pos[1]), JOBS = +(opt.jobs || 3), FPS = +(opt.fps || 30), Q = +(opt.q || 0.93);
const CHROME = [process.env.CHROME, '/opt/pw-browsers/chromium', '/usr/bin/google-chrome', '/usr/bin/chromium', '/usr/bin/chromium-browser',
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'].find((p) => p && fs.existsSync(p) && fs.statSync(p).isFile())
  || (() => { try { const d = '/opt/pw-browsers'; for (const s of fs.readdirSync(d)) { const p = path.join(d, s, 'chrome-linux/chrome'); if (fs.existsSync(p)) return p; } } catch {} })();
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.json': 'application/json', '.otf': 'font/otf', '.ttf': 'font/ttf',
  '.woff': 'font/woff', '.woff2': 'font/woff2', '.wav': 'audio/wav', '.mp3': 'audio/mpeg', '.png': 'image/png', '.jpg': 'image/jpeg', '.svg': 'image/svg+xml', '.css': 'text/css' };

const srv = await new Promise((res) => { const s = http.createServer((req, r) => {
  const u = decodeURIComponent(req.url.split('?')[0]), f = path.join(ROOT, u === '/' ? 'index.html' : u);
  if (!f.startsWith(ROOT) || !fs.existsSync(f) || fs.statSync(f).isDirectory()) { r.writeHead(404); r.end(); return; }
  r.writeHead(200, { 'Content-Type': MIME[path.extname(f)] || 'application/octet-stream', 'Cache-Control': 'no-store' }); fs.createReadStream(f).pipe(r);
}); s.listen(0, '127.0.0.1', () => res(s)); });
const PORT = srv.address().port, PAGE = opt.page || 'index.html';

async function openPage(w, h) {
  if (!CHROME) throw new Error('Chrome not found (set CHROME=)');
  const prof = fs.mkdtempSync(path.join(os.tmpdir(), 'rh-chrome-'));
  const chrome = spawn(CHROME, ['--headless=new', '--remote-debugging-port=0', `--user-data-dir=${prof}`, '--no-first-run', '--no-default-browser-check', '--hide-scrollbars',
    `--window-size=${w},${h}`, '--ignore-gpu-blocklist', '--enable-unsafe-swiftshader', '--autoplay-policy=no-user-gesture-required', ...(process.getuid?.() === 0 ? ['--no-sandbox'] : []),
    '--disable-background-timer-throttling', '--disable-renderer-backgrounding', 'about:blank'], { stdio: 'ignore' });
  let dbg; for (let i = 0; i < 200 && !dbg; i++) { try { dbg = fs.readFileSync(path.join(prof, 'DevToolsActivePort'), 'utf8').split('\n')[0].trim(); } catch { await sleep(100); } }
  if (!dbg) throw new Error('Chrome did not start');
  const tgt = await (await fetch(`http://127.0.0.1:${dbg}/json/new?${encodeURIComponent(`http://127.0.0.1:${PORT}/${PAGE}?capture=1${opt.query || ''}`)}`, { method: 'PUT' })).json();
  const ws = new WebSocket(tgt.webSocketDebuggerUrl); await new Promise((res, rej) => { ws.onopen = res; ws.onerror = rej; });
  let id = 0; const pend = new Map(), logs = [];
  ws.onmessage = (e) => { const m = JSON.parse(e.data);
    if (m.id && pend.has(m.id)) { const p = pend.get(m.id); pend.delete(m.id); m.error ? p.rej(new Error(m.error.message)) : p.res(m.result); }
    else if (m.method === 'Runtime.exceptionThrown') logs.push('EXCEPTION ' + (m.params.exceptionDetails.exception?.description || m.params.exceptionDetails.text)); };
  const send = (method, params = {}) => new Promise((res, rej) => { const i = ++id; pend.set(i, { res, rej }); ws.send(JSON.stringify({ id: i, method, params })); });
  const ev = async (expr) => { const x = await send('Runtime.evaluate', { expression: expr, returnByValue: true, awaitPromise: true }); if (x.exceptionDetails) throw new Error(x.exceptionDetails.exception?.description || x.exceptionDetails.text); return x.result.value; };
  await send('Runtime.enable'); await send('Page.enable');
  for (let i = 0; ; i++) {
    const st = await ev(`(() => { if (window.OP && OP.bootError) return 'ERR:' + OP.bootError; if (window.OP && 'ready' in OP && !OP.ready) return false; return typeof window.seek === 'function' && +window.DURATION > 0; })()`).catch(() => false);
    if (st === true) break; if (typeof st === 'string') throw new Error('boot failed: ' + st);
    if (i > 1200) throw new Error('page never exposed window.seek + window.DURATION\n' + logs.join('\n')); await sleep(100);
  }
  await ev('document.fonts ? document.fonts.ready.then(() => 1) : 1');
  const close = () => { try { ws.close(); } catch {} chrome.kill('SIGKILL'); setTimeout(() => { try { fs.rmSync(prof, { recursive: true, force: true }); } catch {} }, 300); };
  return { ev, send, logs, close };
}
const GRAB = `(async (t) => { await window.seek(t); const c = document.querySelector('canvas'); return c ? c.toDataURL('image/jpeg', ${Q}) : null; })`;

// probe: duration + canvas size
const probe = await openPage(1920, 1080);
const DUR = +(await probe.ev('window.DURATION')), cs = await probe.ev(`(() => { const c = document.querySelector('canvas'); return c ? [c.width, c.height] : [innerWidth, innerHeight]; })()`);
const [OW, OH] = opt.size ? String(opt.size).split('x').map(Number) : cs;
const t0 = +(opt.from || 0), t1 = Math.min(+(opt.to || DUR), DUR), N = Math.round((t1 - t0) * FPS);
console.log(`duration ${DUR.toFixed(2)} s · canvas ${cs.join('x')} → ${OW}x${OH} · ${N} frames · ${JOBS} jobs`);
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'rh-seg-'));

if (opt.sfx) {            // the page's own sound kit (Nafay library API)
  const ok = await probe.ev(`(async () => { if (!window.SFX || !SFX.render || !window.scoreSound) return 'none';
    const b = await SFX.render(window.scoreSound, window.DURATION, 48000, { voiceover: true }); const chs = [];
    for (let c = 0; c < b.numberOfChannels; c++) chs.push(Array.from(b.getChannelData(c))); return chs; })()`).catch((e) => 'ERR ' + e.message);
  if (Array.isArray(ok)) { const n = ok[0].length, f = new Float32Array(n * ok.length); for (let i = 0; i < n; i++) for (let c = 0; c < ok.length; c++) f[i * ok.length + c] = ok[c][i];
    fs.writeFileSync(path.join(tmp, 'sfx.f32'), Buffer.from(f.buffer)); fs.mkdirSync(path.join(ROOT, 'data'), { recursive: true });
    spawnSync('ffmpeg', ['-v', 'error', '-y', '-f', 'f32le', '-ar', '48000', '-ac', String(ok.length), '-i', path.join(tmp, 'sfx.f32'), path.join(ROOT, 'data/sfx.wav')]); console.log('data/sfx.wav written');
  } else console.log('no page SFX:', ok);
}
probe.close();

const started = Date.now(); let done = 0;
const per = Math.ceil(N / JOBS), segs = [];
await Promise.all(Array.from({ length: JOBS }, async (_, j) => {
  const a = j * per, b = Math.min(N, a + per); if (a >= b) return; const seg = path.join(tmp, `seg${j}.mp4`); segs[j] = seg;
  const P = await openPage(cs[0], cs[1]);
  const ff = spawn('ffmpeg', ['-v', 'error', '-y', '-f', 'image2pipe', '-framerate', String(FPS), '-i', '-', ...(OW !== cs[0] || OH !== cs[1] ? ['-vf', `scale=${OW}:${OH}:flags=lanczos`] : []),
    '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '18', '-pix_fmt', 'yuv420p', '-r', String(FPS), seg], { stdio: ['pipe', 'inherit', 'inherit'] });
  try {
    for (let i = a; i < b; i++) {
      const t = t0 + i / FPS; let d = await P.ev(`${GRAB}(${t})`);
      if (!d) d = 'data:image/jpeg;base64,' + (await P.send('Page.captureScreenshot', { format: 'jpeg', quality: Math.round(Q * 100) })).data;
      if (!ff.stdin.write(Buffer.from(d.slice(d.indexOf(',') + 1), 'base64'))) await new Promise((r) => ff.stdin.once('drain', r));
      if (++done % 300 === 0) { const el = (Date.now() - started) / 1000; process.stdout.write(`\r${done}/${N} frames · ${(done / el).toFixed(1)} fps · eta ${((N - done) / (done / el) / 60).toFixed(1)} min   `); }
    }
  } finally { ff.stdin.end(); await new Promise((r) => ff.on('close', r)); P.close(); }
}));
fs.writeFileSync(path.join(tmp, 'list.txt'), segs.filter(Boolean).map((s) => `file '${s}'`).join('\n'));
const audio = opt.audio ? path.resolve(ROOT, opt.audio) : (fs.existsSync(path.join(ROOT, 'data/mix.wav')) ? path.join(ROOT, 'data/mix.wav') : null), sfx = path.join(ROOT, 'data/sfx.wav');
const ain = audio && fs.existsSync(audio) ? ['-ss', String(t0), '-t', String(t1 - t0), '-i', audio] : ['-f', 'lavfi', '-t', String(t1 - t0), '-i', 'anullsrc=r=48000:cl=stereo'];
const useSfx = opt.sfx && fs.existsSync(sfx), sin = useSfx ? ['-ss', String(t0), '-t', String(t1 - t0), '-i', sfx] : [];
fs.mkdirSync(path.dirname(OUT), { recursive: true });
const r = spawnSync('ffmpeg', ['-v', 'error', '-y', '-f', 'concat', '-safe', '0', '-i', path.join(tmp, 'list.txt'), ...ain, ...sin,
  ...(useSfx ? ['-filter_complex', '[2:a]volume=0.5[s];[1:a][s]amix=inputs=2:normalize=0[a]', '-map', '0:v', '-map', '[a]'] : ['-map', '0:v', '-map', '1:a']),
  '-c:v', 'copy', '-c:a', 'aac', '-b:a', '192k', '-shortest', '-movflags', '+faststart', OUT]);
fs.rmSync(tmp, { recursive: true, force: true }); srv.close();
if (r.status) { console.error('ffmpeg mux failed: ' + r.stderr); process.exit(1); }
console.log(`\n${OUT} · ${N} frames · ${((Date.now() - started) / 1000).toFixed(0)} s${audio ? '' : ' · SILENT'}`);
process.exit(0);

// Zero-dependency static server. Sends COOP/COEP so the llama.cpp runtime can use multiple threads.
// Usage: node scripts/serve.js [port]   (HOST=0.0.0.0 to reach it from a phone on the LAN)
import { createServer } from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { extname, join, normalize, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(fileURLToPath(new URL('..', import.meta.url)));
const TYPES = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8',
  '.json': 'application/json', '.webmanifest': 'application/manifest+json', '.svg': 'image/svg+xml', '.png': 'image/png',
  '.woff2': 'font/woff2', '.wasm': 'application/wasm', '.gguf': 'application/octet-stream',
};
// .models is only exposed for local automated tests (SERVE_TEST_MODELS=1)
const deny = (p) => /^\/(\.git|node_modules|test|scripts|android)(\/|$)/.test(p) || (/^\/\.models(\/|$)/.test(p) && !process.env.SERVE_TEST_MODELS);

export function startServer(port = Number(process.argv[2]) || 8090, host = process.env.HOST || '127.0.0.1') {
  const server = createServer(async (req, res) => {
    try {
      const path = normalize(decodeURIComponent(new URL(req.url, 'http://x').pathname));
      if (deny(path)) { res.writeHead(404).end(); return; }
      let file = join(ROOT, path);
      if (!file.startsWith(ROOT)) { res.writeHead(403).end(); return; }
      const st = await stat(file).catch(() => null);
      if (st?.isDirectory()) file = join(file, 'index.html');
      const body = await readFile(file);
      res.writeHead(200, {
        'Content-Type': TYPES[extname(file)] || 'application/octet-stream',
        'Cache-Control': 'no-cache',
        'Cross-Origin-Opener-Policy': 'same-origin',
        'Cross-Origin-Embedder-Policy': 'require-corp',
      });
      res.end(body);
    } catch {
      res.writeHead(404, { 'Content-Type': 'text/plain' }).end('Not found');
    }
  });
  return new Promise((ok) => server.listen(port, host, () => ok(server)));
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  startServer().then((s) => console.log(`WHAT IF? running at http://${s.address().address}:${s.address().port}`));
}

import { query } from './db.js';

// Files are stored in the `media` table and served at /uploads/<path>. Names are unique, so caching is forever.
export async function putFile(path, data, contentType) {
  await query('INSERT INTO media (path, content_type, data) VALUES ($1,$2,$3) ON CONFLICT (path) DO UPDATE SET content_type = $2, data = $3', [path, contentType, data]);
  return `/uploads/${path}`;
}

export async function deleteFiles(urls) {
  const paths = urls.filter((u) => u?.startsWith('/uploads/')).map((u) => u.slice('/uploads/'.length));
  if (paths.length) await query('DELETE FROM media WHERE path = ANY($1)', [paths]);
}

// Express handler for GET /uploads/*. Supports byte ranges so phone browsers can play product videos.
export async function serveUpload(req, res, next) {
  try {
    const path = req.params[0]; // already URL-decoded by express
    const { rows } = await query('SELECT content_type, octet_length(data) AS size FROM media WHERE path = $1', [path]);
    if (!rows[0]) return res.sendStatus(404);
    const { content_type: type, size } = rows[0];
    res.set({ 'Content-Type': type, 'Cache-Control': 'public, max-age=31536000, immutable', 'Accept-Ranges': 'bytes', 'X-Content-Type-Options': 'nosniff',
      'Content-Security-Policy': "default-src 'none'; style-src 'unsafe-inline'; img-src 'self' data:" }); // an uploaded file can never run script
    const m = /^bytes=(\d*)-(\d*)$/.exec(req.get('range') || '');
    if (m && (m[1] || m[2])) {
      const start = m[1] ? Number(m[1]) : Math.max(0, size - Number(m[2]));
      const end = m[1] && m[2] ? Math.min(Number(m[2]), size - 1) : size - 1;
      if (start > end || start >= size) return res.set('Content-Range', `bytes */${size}`).sendStatus(416);
      const { rows: [r] } = await query('SELECT substring(data FROM $2 FOR $3) AS chunk FROM media WHERE path = $1', [path, start + 1, end - start + 1]);
      return res.status(206).set('Content-Range', `bytes ${start}-${end}/${size}`).send(r.chunk);
    }
    const { rows: [r] } = await query('SELECT data FROM media WHERE path = $1', [path]);
    res.send(r.data);
  } catch (err) {
    next(err);
  }
}

import webpush from 'web-push';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import pg from 'pg';
import { query } from './db.js';
import { readToken } from './auth.js';

// Postgres LISTEN/NOTIFY -> SSE + Web Push. The DB triggers fire no matter which app
// (this API or the admin app) changed the order, so customers always hear about it.

function loadVapid() {
  if (process.env.VAPID_PUBLIC_KEY && process.env.VAPID_PRIVATE_KEY) {
    return { publicKey: process.env.VAPID_PUBLIC_KEY, privateKey: process.env.VAPID_PRIVATE_KEY };
  }
  const file = new URL('../.vapid.json', import.meta.url);
  if (existsSync(file)) return JSON.parse(readFileSync(file, 'utf8'));
  const keys = webpush.generateVAPIDKeys();
  writeFileSync(file, JSON.stringify(keys));
  return keys;
}

const clients = new Set(); // { res, customerId }

function send(res, event, data) {
  res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
}

async function pushTo(notification) {
  const { rows } = notification.customer_id
    ? await query('SELECT id, endpoint, keys FROM push_subscriptions WHERE customer_id = $1', [notification.customer_id])
    : await query('SELECT id, endpoint, keys FROM push_subscriptions');
  const payload = JSON.stringify({ title: notification.title, body: notification.body, url: notification.link || '/', tag: `n${notification.id}` });
  await Promise.all(rows.map(async (s) => {
    try {
      await webpush.sendNotification({ endpoint: s.endpoint, keys: s.keys }, payload, { TTL: 86400 });
    } catch (err) {
      if (err.statusCode === 404 || err.statusCode === 410) await query('DELETE FROM push_subscriptions WHERE id = $1', [s.id]);
      else console.warn('push failed', err.statusCode || err.message);
    }
  }));
}

async function handle(channel, payload) {
  if (channel === 'settings') {
    for (const c of clients) send(c.res, 'settings', {});
    return;
  }
  const data = JSON.parse(payload);
  for (const c of clients) {
    if (data.customer_id === null ? channel === 'notification' : c.customerId === data.customer_id) send(c.res, channel, data);
  }
  if (channel === 'notification' && realtime.vapidPublicKey) {
    const n = (await query('SELECT * FROM notifications WHERE id = $1', [data.id])).rows[0];
    if (n) await pushTo(n);
  }
}

export const realtime = {
  vapidPublicKey: null,
  listener: null,

  async start() {
    const vapid = loadVapid();
    webpush.setVapidDetails(process.env.VAPID_SUBJECT || 'mailto:shop@example.com', vapid.publicKey, vapid.privateKey);
    this.vapidPublicKey = vapid.publicKey;
    const retry = () => setTimeout(() => connect().catch((err) => (console.warn('reconnect failed', err.message), retry())), 3000);
    const connect = async () => {
      const client = new pg.Client({ connectionString: process.env.DATABASE_URL || 'postgres://jewel:jewel@127.0.0.1:5432/jewellery' });
      client.on('notification', (m) => handle(m.channel, m.payload).catch((e) => console.error('realtime', e)));
      client.on('error', (e) => {
        console.warn('LISTEN connection lost, reconnecting', e.message);
        retry();
      });
      await client.connect();
      await client.query('LISTEN order_update; LISTEN notification; LISTEN settings');
      this.listener = client;
    };
    await connect();
    setInterval(() => { for (const c of clients) c.res.write(': ping\n\n'); }, 25e3).unref();
  },

  async stop() {
    for (const c of clients) c.res.end();
    await this.listener?.end();
  },

  subscribe(req, res) {
    res.set({ 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-store', Connection: 'keep-alive', 'X-Accel-Buffering': 'no' });
    res.flushHeaders();
    res.write('retry: 5000\n\n');
    const c = { res, customerId: readToken(String(req.query.token || '')) };
    clients.add(c);
    req.on('close', () => clients.delete(c));
  },
};

import express from 'express';
import { randomBytes } from 'node:crypto';
import { resolve } from 'node:path';
import { query, tx } from './db.js';
import { authenticate, hashPassword, issueToken, requireAuth, verifyPassword } from './auth.js';
import { computeTotals, httpError, priceItems, upiDiscountPercent, VISIBLE } from './pricing.js';
import { upiLink } from './upi.js';
import * as v from './validate.js';
import { realtime } from './realtime.js';
import { adminRouter } from './admin.js';
import { iconVariant } from './media.js';
import { putFile, serveUpload } from './storage.js';


export const wrap = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);

export async function getSettings(db = { query }) {
  return (await db.query('SELECT * FROM store_settings WHERE id = 1')).rows[0];
}

function publicSettings(s, offers) {
  return {
    shopName: s.shop_name,
    brandName: s.brand_display_name || s.shop_name,
    tagline: s.tagline,
    description: s.description,
    logoUrl: s.logo_url,
    appIconUrl: s.app_icon_url,
    splashLogoUrl: s.splash_logo_url,
    contact: {
      phone: s.support_phone, email: s.contact_email, address: s.address, city: s.city, state: s.state, pincode: s.pincode,
      openingHours: s.opening_hours, social: s.social_links,
    },
    upiEnabled: s.upi_enabled && Boolean(s.upi_id),
    codEnabled: s.cod_enabled,
    upiDiscountPercent: upiDiscountPercent(s, Infinity),
    upiDiscountMinOrderPaise: s.upi_discount_min_order_paise,
    upiDiscountMaxPaise: s.upi_discount_max_paise,
    paymentInstructions: s.payment_instructions,
    deliveryChargePaise: s.delivery_charge_paise,
    freeDeliveryMinPaise: s.free_delivery_min_paise,
    minOrderPaise: s.min_order_paise,
    deliveryAreasNote: s.delivery_areas_note,
    whatsappNumber: s.whatsapp_number,
    supportPhone: s.support_phone,
    replacementWindowHours: s.replacement_window_hours,
    replacementPolicy: s.replacement_policy,
    cancellableStatuses: s.cancellable_statuses,
    banners: offers,
    updatedAt: s.updated_at,
  };
}

// Live promotional banners for the customer home page.
async function activeOffers() {
  const { rows } = await query(
    `SELECT kind, title, subtitle, cta, link, image_url AS image FROM offers
      WHERE active AND (starts_at IS NULL OR starts_at <= now()) AND (ends_at IS NULL OR ends_at > now())
      ORDER BY sort_order, id`,
  );
  return rows;
}

const PRODUCT_COLS = `p.id, p.sku, p.slug, p.name, p.images, p.stock, p.tags, p.original_price_paise, p.selling_price_paise,
  p.created_at, c.slug AS category_slug, c.name AS category_name`;

function productCard(r) {
  const original = Math.max(r.original_price_paise, r.selling_price_paise);
  return {
    id: r.id,
    sku: r.sku,
    slug: r.slug,
    name: r.name,
    images: r.images,
    stock: r.stock,
    tags: r.tags,
    originalPricePaise: original,
    sellingPricePaise: r.selling_price_paise,
    discountPercent: original ? Math.round(((original - r.selling_price_paise) / original) * 100) : 0,
    category: r.category_slug ? { slug: r.category_slug, name: r.category_name } : null,
  };
}

// Simple fixed-window limiter for login/register brute force; per process is enough for one shop.
const attempts = new Map();
export function rateLimit(key, max = 10, windowMs = 15 * 60e3) {
  const now = Date.now();
  const a = attempts.get(key);
  if (!a || a.reset < now) return attempts.set(key, { n: 1, reset: now + windowMs }), true;
  return ++a.n <= max;
}

async function loadOrder(db, where, params) {
  const { rows } = await db.query(`SELECT * FROM orders WHERE ${where}`, params);
  return rows[0] || null;
}

export async function serializeOrder(o, settings) {
  const [items, history, replacements] = await Promise.all([
    query('SELECT id, product_id, sku, name, image_url, unit_original_paise, unit_price_paise, quantity FROM order_items WHERE order_id = $1 ORDER BY id', [o.id]),
    query('SELECT status, created_at FROM order_status_history WHERE order_id = $1 ORDER BY id', [o.id]),
    query('SELECT id, order_item_id, issue, description, photos, status, admin_note, created_at, updated_at FROM replacement_requests WHERE order_id = $1 ORDER BY id', [o.id]),
  ]);
  const deadline = o.delivered_at ? new Date(o.delivered_at.getTime() + settings.replacement_window_hours * 3600e3) : null;
  const paid = ['verified', 'verification_pending'].includes(o.payment_status);
  const payable = o.payment_method === 'upi' && ['pending', 'failed'].includes(o.payment_status) && o.status !== 'cancelled';
  return {
    orderNumber: o.order_number,
    status: o.status,
    paymentMethod: o.payment_method,
    paymentStatus: o.payment_status,
    paymentReference: o.payment_reference,
    contact: { name: o.contact_name, mobile: o.contact_mobile },
    address: o.shipping_address,
    deliveryInstructions: o.delivery_instructions,
    deliveryAgentName: o.delivery_agent_name,
    totals: {
      subtotalPaise: o.subtotal_paise,
      productDiscountPaise: o.product_discount_paise,
      upiDiscountPercent: Number(o.upi_discount_percent),
      upiDiscountPaise: o.upi_discount_paise,
      deliveryChargePaise: o.delivery_charge_paise,
      totalPaise: o.total_paise,
    },
    items: items.rows.map((i) => ({
      id: i.id,
      productId: i.product_id,
      sku: i.sku,
      name: i.name,
      imageUrl: i.image_url,
      unitOriginalPaise: i.unit_original_paise,
      unitPricePaise: i.unit_price_paise,
      quantity: i.quantity,
    })),
    timeline: history.rows.map((h) => ({ status: h.status, at: h.created_at })),
    replacements: replacements.rows.map((r) => ({
      id: r.id,
      orderItemId: r.order_item_id,
      issue: r.issue,
      description: r.description,
      photos: r.photos,
      status: r.status,
      adminNote: r.admin_note,
      createdAt: r.created_at,
      updatedAt: r.updated_at,
    })),
    canCancel: settings.cancellable_statuses.includes(o.status) && !paid,
    upiLink: payable
      ? upiLink({ upiId: settings.upi_id, payeeName: settings.upi_payee_name, shopName: settings.shop_name, orderNumber: o.order_number, amountPaise: o.total_paise, description: settings.payment_description })
      : null,
    deliveredAt: o.delivered_at,
    replacementDeadline: deadline,
    cancelReason: o.cancel_reason,
    createdAt: o.created_at,
    updatedAt: o.updated_at,
  };
}

// Owner (logged in) or guest holding the order's secret token.
async function findAccessibleOrder(req) {
  const o = await loadOrder({ query }, 'order_number = $1', [String(req.params.number)]);
  if (!o) throw httpError(404, 'Order not found');
  const guest = req.get('x-guest-token');
  const ok = (req.customerId && o.customer_id === req.customerId) || (guest && o.guest_token && guest === o.guest_token);
  if (!ok) throw httpError(404, 'Order not found');
  return o;
}

const IMAGE_TYPES = { '/9j/': 'jpg', iVBORw0: 'png', UklGR: 'webp' };
async function savePhoto(dataUrl) {
  const m = /^data:image\/(jpeg|png|webp);base64,(.+)$/.exec(dataUrl || '');
  if (!m) throw httpError(400, 'Photos must be JPEG, PNG or WebP images');
  const ext = Object.entries(IMAGE_TYPES).find(([sig]) => m[2].startsWith(sig))?.[1];
  if (!ext) throw httpError(400, 'Photo file is not a valid image');
  const buf = Buffer.from(m[2], 'base64');
  if (buf.length > 4 * 1024 * 1024) throw httpError(400, 'Each photo must be under 4 MB');
  const name = `replacements/${Date.now()}-${randomBytes(8).toString('hex')}.${ext}`;
  return putFile(name, buf, `image/${ext === 'jpg' ? 'jpeg' : ext}`);
}

export function createApp() {
  const app = express();
  app.disable('x-powered-by');
  app.set('trust proxy', 1);

  const origins = (process.env.CORS_ORIGINS || '').split(',').filter(Boolean);
  app.use((req, res, next) => {
    const origin = req.get('origin');
    if (origin && origins.includes(origin)) {
      res.set({ 'Access-Control-Allow-Origin': origin, Vary: 'Origin', 'Access-Control-Allow-Headers': 'Authorization, Content-Type, X-Guest-Token', 'Access-Control-Allow-Methods': 'GET,POST,PATCH,PUT,DELETE' });
      if (req.method === 'OPTIONS') return res.sendStatus(204);
    }
    next();
  });

  app.get(/^\/uploads\/(.+)$/, serveUpload);

  // Install manifest built from store settings, so name and icon follow the owner's branding.
  app.get('/manifest.webmanifest', wrap(async (_req, res) => {
    const s = await getSettings();
    const name = s.brand_display_name || s.shop_name;
    const icons = s.app_icon_url
      ? [{ src: iconVariant(s.app_icon_url, 192), sizes: '192x192', type: 'image/png' }, { src: s.app_icon_url, sizes: '512x512', type: 'image/png' },
        { src: s.app_icon_url, sizes: '512x512', type: 'image/png', purpose: 'maskable' }]
      : [{ src: '/icon-192.png', sizes: '192x192', type: 'image/png' }, { src: '/icon-512.png', sizes: '512x512', type: 'image/png' },
        { src: '/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' }];
    res.type('application/manifest+json').set('Cache-Control', 'no-cache').send(JSON.stringify({
      name, short_name: name.slice(0, 12), description: s.description || s.tagline, start_url: '/', scope: '/', display: 'standalone',
      background_color: '#FBF7EF', theme_color: '#FBF7EF', orientation: 'portrait', icons,
    }));
  }));
  const api = express.Router();
  app.use('/api', api);
  api.use(express.json({ limit: '25mb' }));
  api.use(authenticate);
  api.use((_req, res, next) => (res.set('Cache-Control', 'no-store'), next()));

  api.get('/health', wrap(async (_req, res) => {
    await query('SELECT 1');
    res.json({ ok: true });
  }));

  // ---------- catalog ----------
  api.get('/settings', wrap(async (_req, res) => res.json(publicSettings(await getSettings(), await activeOffers()))));

  api.get('/categories', wrap(async (_req, res) => {
    const { rows } = await query(
      `SELECT c.slug, c.name, c.image_url, count(p.id)::int AS product_count
         FROM categories c LEFT JOIN products p ON p.category_id = c.id AND ${VISIBLE}
        WHERE c.active GROUP BY c.id ORDER BY c.sort_order, c.name`,
    );
    res.json(rows.map((r) => ({ slug: r.slug, name: r.name, imageUrl: r.image_url, productCount: r.product_count })));
  }));

  api.get('/products', wrap(async (req, res) => {
    const where = [VISIBLE];
    const params = [];
    const add = (sql, val) => (params.push(val), where.push(sql.replace('?', `$${params.length}`)));
    if (req.query.category) add('c.slug = ?', String(req.query.category));
    if (req.query.tag) add('? = ANY(p.tags)', String(req.query.tag));
    if (req.query.ids) add('p.id = ANY(?)', String(req.query.ids).split(',').map(Number).filter(Number.isInteger));
    if (req.query.q) {
      const q = `%${String(req.query.q).trim().replace(/[%_\\]/g, '\\$&')}%`;
      params.push(q);
      const n = `$${params.length}`;
      where.push(`(p.name ILIKE ${n} OR p.sku ILIKE ${n} OR p.description ILIKE ${n} OR c.name ILIKE ${n})`);
    }
    if (req.query.inStock === '1') where.push('p.stock > 0');
    const sort = {
      new: 'p.created_at DESC',
      price_asc: 'p.selling_price_paise ASC',
      price_desc: 'p.selling_price_paise DESC',
      popular: 'p.sold_count DESC, p.created_at DESC',
      discount: '(p.original_price_paise - p.selling_price_paise)::float / greatest(p.original_price_paise, 1) DESC',
    }[req.query.sort] || 'p.created_at DESC';
    const limit = Math.min(Math.max(parseInt(req.query.limit) || 24, 1), 60);
    const page = Math.max(parseInt(req.query.page) || 1, 1);
    const { rows } = await query(
      `SELECT ${PRODUCT_COLS}, count(*) OVER()::int AS total FROM products p LEFT JOIN categories c ON c.id = p.category_id
        WHERE ${where.join(' AND ')} ORDER BY ${sort}, p.id DESC LIMIT ${limit} OFFSET ${(page - 1) * limit}`,
      params,
    );
    res.json({ items: rows.map(productCard), total: rows[0]?.total || 0, page, limit });
  }));

  api.get('/products/:slug', wrap(async (req, res) => {
    const { rows } = await query(
      `SELECT ${PRODUCT_COLS}, p.description, p.video_url, p.specifications, p.category_id
         FROM products p LEFT JOIN categories c ON c.id = p.category_id WHERE p.slug = $1 AND ${VISIBLE}`,
      [req.params.slug],
    );
    const p = rows[0];
    if (!p) throw httpError(404, 'Product not found');
    const related = await query(
      `SELECT ${PRODUCT_COLS} FROM products p LEFT JOIN categories c ON c.id = p.category_id
        WHERE ${VISIBLE} AND p.id <> $1 AND p.category_id IS NOT DISTINCT FROM $2
        ORDER BY p.stock > 0 DESC, p.sold_count DESC LIMIT 8`,
      [p.id, p.category_id],
    );
    res.json({ ...productCard(p), description: p.description, videoUrl: p.video_url, specifications: p.specifications, related: related.rows.map(productCard) });
  }));

  api.post('/cart/quote', wrap(async (req, res) => {
    const settings = await getSettings();
    const { lines, problems } = await priceItems({ query }, req.body?.items || []);
    res.json({
      lines: lines.map((l) => ({ productId: l.product_id, sku: l.sku, slug: l.slug, name: l.name, imageUrl: l.image_url, stock: l.stock, unitOriginalPaise: l.unit_original_paise, unitPricePaise: l.unit_price_paise, quantity: l.quantity })),
      problems,
      upi: computeTotals(lines, settings, 'upi'),
      cod: computeTotals(lines, settings, 'cod'),
    });
  }));

  // ---------- account ----------
  api.post('/auth/register', wrap(async (req, res) => {
    if (!rateLimit(`reg:${req.ip}`)) throw httpError(429, 'Too many attempts. Try again later.');
    const b = req.body || {};
    const name = v.str(b.name, 'Name', { min: 2, max: 80 });
    const m = v.mobile(b.mobile);
    const password = typeof b.password === 'string' ? b.password : '';
    if (password.length < 8 || password.length > 128) throw httpError(400, 'Password must be at least 8 characters');
    const hash = await hashPassword(password);
    const { rows } = await query(
      `INSERT INTO customers (name, mobile, email, password_hash, marketing_opt_in) VALUES ($1,$2,$3,$4,$5)
       ON CONFLICT (mobile) DO NOTHING RETURNING id, name, mobile, email, marketing_opt_in`,
      [name, m, v.email(b.email), hash, b.marketingOptIn === true],
    );
    if (!rows[0]) throw httpError(409, 'An account with this mobile number already exists. Please log in.');
    res.status(201).json({ token: issueToken(rows[0].id), customer: rows[0] });
  }));

  api.post('/auth/login', wrap(async (req, res) => {
    const m = v.mobile(req.body?.mobile);
    if (!rateLimit(`login:${req.ip}:${m}`)) throw httpError(429, 'Too many attempts. Try again in 15 minutes.');
    const { rows } = await query('SELECT id, name, mobile, email, password_hash FROM customers WHERE mobile = $1', [m]);
    const c = rows[0];
    if (!c || !(await verifyPassword(String(req.body?.password ?? ''), c.password_hash))) throw httpError(401, 'Mobile number or password is incorrect');
    res.json({ token: issueToken(c.id), customer: { id: c.id, name: c.name, mobile: c.mobile, email: c.email } });
  }));

  api.get('/me', requireAuth, wrap(async (req, res) => {
    const { rows } = await query('SELECT id, name, mobile, email, marketing_opt_in, created_at FROM customers WHERE id = $1', [req.customerId]);
    if (!rows[0]) throw httpError(401, 'Please log in');
    res.json(rows[0]);
  }));

  api.patch('/me', requireAuth, wrap(async (req, res) => {
    const { rows } = await query(`UPDATE customers SET name = $2, email = $3, marketing_opt_in = COALESCE($4, marketing_opt_in) WHERE id = $1
       RETURNING id, name, mobile, email, marketing_opt_in, created_at`, [
      req.customerId, v.str(req.body?.name, 'Name', { min: 2, max: 80 }), v.email(req.body?.email),
      typeof req.body?.marketingOptIn === 'boolean' ? req.body.marketingOptIn : null,
    ]);
    res.json(rows[0]);
  }));

  api.post('/me/password', requireAuth, wrap(async (req, res) => {
    const { current, next: nextPw } = req.body || {};
    if (typeof nextPw !== 'string' || nextPw.length < 8 || nextPw.length > 128) throw httpError(400, 'New password must be at least 8 characters');
    const { rows } = await query('SELECT password_hash FROM customers WHERE id = $1', [req.customerId]);
    if (!(await verifyPassword(String(current ?? ''), rows[0].password_hash))) throw httpError(400, 'Current password is incorrect');
    await query('UPDATE customers SET password_hash = $2 WHERE id = $1', [req.customerId, await hashPassword(nextPw)]);
    res.json({ ok: true });
  }));

  const ADDRESS_COLS = 'id, label, name, mobile, house, street, area, city, state, pincode, landmark, is_default';
  api.get('/me/addresses', requireAuth, wrap(async (req, res) => {
    res.json((await query(`SELECT ${ADDRESS_COLS} FROM addresses WHERE customer_id = $1 ORDER BY is_default DESC, id DESC`, [req.customerId])).rows);
  }));

  async function saveAddress(db, customerId, body, id = null) {
    const a = v.address(body);
    const vals = [customerId, v.str(body.label, 'Label', { max: 30 }) || 'Home', v.str(body.name, 'Name', { min: 2, max: 80 }), v.mobile(body.mobile),
      a.house, a.street, a.area, a.city, a.state, a.pincode, a.landmark, Boolean(body.is_default)];
    if (body.is_default) await db.query('UPDATE addresses SET is_default = false WHERE customer_id = $1', [customerId]);
    const { rows } = id
      ? await db.query(`UPDATE addresses SET label=$2, name=$3, mobile=$4, house=$5, street=$6, area=$7, city=$8, state=$9, pincode=$10, landmark=$11, is_default=$12
                         WHERE customer_id=$1 AND id=$13 RETURNING ${ADDRESS_COLS}`, [...vals, id])
      : await db.query(`INSERT INTO addresses (customer_id, label, name, mobile, house, street, area, city, state, pincode, landmark, is_default)
                         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,
                           $12 OR NOT EXISTS (SELECT 1 FROM addresses WHERE customer_id = $1)) RETURNING ${ADDRESS_COLS}`, vals);
    if (!rows[0]) throw httpError(404, 'Address not found');
    return rows[0];
  }

  api.post('/me/addresses', requireAuth, wrap(async (req, res) => res.status(201).json(await tx((db) => saveAddress(db, req.customerId, req.body || {})))));
  api.put('/me/addresses/:id', requireAuth, wrap(async (req, res) => res.json(await tx((db) => saveAddress(db, req.customerId, req.body || {}, Number(req.params.id))))));
  api.delete('/me/addresses/:id', requireAuth, wrap(async (req, res) => {
    await query('DELETE FROM addresses WHERE customer_id = $1 AND id = $2', [req.customerId, Number(req.params.id)]);
    res.json({ ok: true });
  }));

  api.get('/me/wishlist', requireAuth, wrap(async (req, res) => {
    const { rows } = await query(
      `SELECT ${PRODUCT_COLS} FROM wishlist w JOIN products p ON p.id = w.product_id AND ${VISIBLE}
         LEFT JOIN categories c ON c.id = p.category_id WHERE w.customer_id = $1 ORDER BY w.created_at DESC`,
      [req.customerId],
    );
    res.json(rows.map(productCard));
  }));
  api.put('/me/wishlist/:productId', requireAuth, wrap(async (req, res) => {
    await query('INSERT INTO wishlist (customer_id, product_id) SELECT $1, id FROM products WHERE id = $2 ON CONFLICT DO NOTHING', [req.customerId, Number(req.params.productId)]);
    res.json({ ok: true });
  }));
  api.delete('/me/wishlist/:productId', requireAuth, wrap(async (req, res) => {
    await query('DELETE FROM wishlist WHERE customer_id = $1 AND product_id = $2', [req.customerId, Number(req.params.productId)]);
    res.json({ ok: true });
  }));

  // ---------- orders ----------
  api.post('/orders', wrap(async (req, res) => {
    const b = req.body || {};
    const method = b.paymentMethod;
    const settings = await getSettings();
    if (method === 'upi' && !(settings.upi_enabled && settings.upi_id)) throw httpError(400, 'UPI payment is not available right now');
    if (method === 'cod' && !settings.cod_enabled) throw httpError(400, 'Cash on delivery is not available right now');
    if (method !== 'upi' && method !== 'cod') throw httpError(400, 'Choose a payment method');
    const contactName = v.str(b.contact?.name, 'Name', { min: 2, max: 80 });
    const contactMobile = v.mobile(b.contact?.mobile);
    const addr = v.address(b.address);
    const instructions = v.str(b.deliveryInstructions, 'Delivery instructions', { max: 300 });
    if (settings.delivery_pincodes.length && !settings.delivery_pincodes.includes(addr.pincode)) {
      throw httpError(400, `Sorry, we do not deliver to PIN code ${addr.pincode} yet.${settings.delivery_areas_note ? ' ' + settings.delivery_areas_note : ''}`);
    }

    const order = await tx(async (db) => {
      const { lines, problems } = await priceItems(db, b.items || [], { lock: true });
      if (!lines.length && !problems.length) throw httpError(400, 'Your cart is empty');
      if (problems.length) throw httpError(409, 'Some items are no longer available in the requested quantity', { problems });
      const t = computeTotals(lines, settings, method);
      if (t.subtotalPaise - t.productDiscountPaise < settings.min_order_paise) {
        throw httpError(400, `Minimum order value is ₹${settings.min_order_paise / 100}`);
      }
      // the customer agreed to a total on screen; never charge a different one silently
      if (b.expectedTotalPaise !== undefined && Number(b.expectedTotalPaise) !== t.totalPaise) {
        throw httpError(409, 'Prices have changed since you opened checkout. Please review the updated total.', { code: 'PRICE_CHANGED', totals: t });
      }
      const guestToken = req.customerId ? null : randomBytes(24).toString('base64url');
      const { rows } = await db.query(
        `INSERT INTO orders (customer_id, guest_token, contact_name, contact_mobile, shipping_address, delivery_instructions, payment_method,
           subtotal_paise, product_discount_paise, upi_discount_percent, upi_discount_paise, delivery_charge_paise, total_paise)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13) RETURNING *`,
        [req.customerId, guestToken, contactName, contactMobile, addr, instructions, method,
          t.subtotalPaise, t.productDiscountPaise, t.upiDiscountPercent, t.upiDiscountPaise, t.deliveryChargePaise, t.totalPaise],
      );
      await db.query(`SELECT set_config('app.stock_reason', 'order', true), set_config('app.order_id', $1, true)`, [String(rows[0].id)]);
      for (const l of lines) {
        await db.query(
          `INSERT INTO order_items (order_id, product_id, sku, name, image_url, unit_original_paise, unit_price_paise, quantity)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`,
          [rows[0].id, l.product_id, l.sku, l.name, l.image_url, l.unit_original_paise, l.unit_price_paise, l.quantity],
        );
        await db.query('UPDATE products SET stock = stock - $2, sold_count = sold_count + $2 WHERE id = $1', [l.product_id, l.quantity]);
      }
      if (req.customerId && b.saveAddress) {
        await saveAddress(db, req.customerId, { ...addr, name: contactName, mobile: contactMobile, label: b.addressLabel });
      }
      return rows[0];
    });
    res.status(201).json({ ...(await serializeOrder(order, settings)), guestToken: order.guest_token });
  }));

  api.get('/orders', requireAuth, wrap(async (req, res) => {
    const { rows } = await query(
      `SELECT o.order_number, o.status, o.payment_method, o.payment_status, o.total_paise, o.created_at, o.delivered_at,
              (SELECT json_agg(json_build_object('name', i.name, 'imageUrl', i.image_url, 'quantity', i.quantity) ORDER BY i.id)
                 FROM order_items i WHERE i.order_id = o.id) AS items
         FROM orders o WHERE o.customer_id = $1 ORDER BY o.created_at DESC LIMIT 100`,
      [req.customerId],
    );
    res.json(rows.map((o) => ({ orderNumber: o.order_number, status: o.status, paymentMethod: o.payment_method, paymentStatus: o.payment_status, totalPaise: o.total_paise, createdAt: o.created_at, deliveredAt: o.delivered_at, items: o.items || [] })));
  }));

  api.get('/orders/:number', wrap(async (req, res) => {
    res.json(await serializeOrder(await findAccessibleOrder(req), await getSettings()));
  }));

  api.post('/orders/:number/cancel', wrap(async (req, res) => {
    const found = await findAccessibleOrder(req);
    const settings = await getSettings();
    const reason = v.str(req.body?.reason, 'Reason', { max: 300 });
    const o = await tx(async (db) => {
      const cur = await loadOrder(db, 'id = $1 FOR UPDATE', [found.id]);
      if (['verified', 'verification_pending'].includes(cur.payment_status)) {
        throw httpError(409, 'This order has a UPI payment on record. Please contact the shop on WhatsApp to change it.');
      }
      if (!settings.cancellable_statuses.includes(cur.status)) throw httpError(409, 'This order can no longer be cancelled');
      return (await db.query(`UPDATE orders SET status = 'cancelled', cancel_reason = $2 WHERE id = $1 RETURNING *`, [cur.id, reason || 'Cancelled by customer'])).rows[0];
    });
    res.json(await serializeOrder(o, settings));
  }));

  // Customer says "I have paid". This only moves the order to verification; staff confirm against the bank.
  api.post('/orders/:number/payment-confirmation', wrap(async (req, res) => {
    const found = await findAccessibleOrder(req);
    const ref = String(req.body?.reference ?? '').trim();
    if (ref && !/^[A-Za-z0-9]{6,35}$/.test(ref)) throw httpError(400, 'UPI reference should be 6–35 letters or digits (the 12-digit UTR from your UPI app)');
    const { rows } = await query(
      `UPDATE orders SET payment_status = 'verification_pending', payment_reference = nullif($2, '')
        WHERE id = $1 AND payment_method = 'upi' AND payment_status IN ('pending','failed') AND status <> 'cancelled' RETURNING *`,
      [found.id, ref],
    );
    if (!rows[0]) throw httpError(409, 'This order is not awaiting UPI payment');
    res.json(await serializeOrder(rows[0], await getSettings()));
  }));

  api.post('/orders/:number/replacements', wrap(async (req, res) => {
    const o = await findAccessibleOrder(req);
    const settings = await getSettings();
    const b = req.body || {};
    if (o.status !== 'delivered' || !o.delivered_at) throw httpError(409, 'Replacement requests can be raised only for delivered orders');
    if (Date.now() > o.delivered_at.getTime() + settings.replacement_window_hours * 3600e3) {
      throw httpError(409, `The ${settings.replacement_window_hours}-hour replacement reporting window for this order has closed`);
    }
    if (!['wrong_product', 'damaged', 'manufacturing_defect'].includes(b.issue)) throw httpError(400, 'Choose an eligible issue');
    const photos = Array.isArray(b.photos) ? b.photos : [];
    if (photos.length < 1 || photos.length > 5) throw httpError(400, 'Add 1 to 5 photographs of the product');
    const item = (await query('SELECT id FROM order_items WHERE id = $1 AND order_id = $2', [Number(b.orderItemId), o.id])).rows[0];
    if (!item) throw httpError(400, 'Choose a product from this order');
    const description = v.str(b.description, 'Description', { max: 1000 });
    const urls = [];
    for (const p of photos) urls.push(await savePhoto(p));
    const { rows } = await query(
      `INSERT INTO replacement_requests (order_id, order_item_id, customer_id, issue, description, photos)
       VALUES ($1,$2,$3,$4,$5,$6) ON CONFLICT (order_item_id) DO NOTHING RETURNING id`,
      [o.id, item.id, o.customer_id, b.issue, description, urls],
    );
    if (!rows[0]) throw httpError(409, 'A replacement request already exists for this product');
    res.status(201).json(await serializeOrder(o, settings));
  }));

  // ---------- notifications ----------
  api.get('/notifications', requireAuth, wrap(async (req, res) => {
    const { rows } = await query(
      `SELECT n.id, n.type, n.title, n.body, n.link, n.created_at, r.notification_id IS NOT NULL AS read
         FROM notifications n
         JOIN customers c ON c.id = $1
         LEFT JOIN notification_reads r ON r.notification_id = n.id AND r.customer_id = $1
        WHERE n.customer_id = $1 OR (n.customer_id IS NULL AND c.marketing_opt_in AND n.created_at >= c.created_at - interval '30 days')
        ORDER BY n.created_at DESC LIMIT 60`,
      [req.customerId],
    );
    res.json({ items: rows, unread: rows.filter((r) => !r.read).length });
  }));

  api.post('/notifications/read', requireAuth, wrap(async (req, res) => {
    const ids = Array.isArray(req.body?.ids) ? req.body.ids.map(Number).filter(Number.isInteger) : null;
    await query(
      `INSERT INTO notification_reads (customer_id, notification_id)
       SELECT $1, n.id FROM notifications n WHERE (n.customer_id = $1 OR n.customer_id IS NULL) AND ($2::int[] IS NULL OR n.id = ANY($2))
       ON CONFLICT DO NOTHING`,
      [req.customerId, ids],
    );
    res.json({ ok: true });
  }));

  api.get('/push/public-key', (_req, res) => res.json({ key: realtime.vapidPublicKey }));
  api.post('/push/subscribe', requireAuth, wrap(async (req, res) => {
    const s = req.body || {};
    if (typeof s.endpoint !== 'string' || !/^https:\/\//.test(s.endpoint) || !s.keys?.p256dh || !s.keys?.auth) throw httpError(400, 'Invalid push subscription');
    await query(
      `INSERT INTO push_subscriptions (customer_id, endpoint, keys) VALUES ($1,$2,$3)
       ON CONFLICT (endpoint) DO UPDATE SET customer_id = EXCLUDED.customer_id, keys = EXCLUDED.keys`,
      [req.customerId, s.endpoint, { p256dh: String(s.keys.p256dh), auth: String(s.keys.auth) }],
    );
    res.json({ ok: true });
  }));
  api.post('/push/unsubscribe', requireAuth, wrap(async (req, res) => {
    await query('DELETE FROM push_subscriptions WHERE customer_id = $1 AND endpoint = $2', [req.customerId, String(req.body?.endpoint ?? '')]);
    res.json({ ok: true });
  }));

  // Server-sent events. EventSource cannot send headers, so the token rides in the query string.
  api.get('/events', (req, res) => realtime.subscribe(req, res));

  api.use('/admin', adminRouter());

  api.use((_req, _res, next) => next(httpError(404, 'Not found')));
  api.use((err, _req, res, _next) => {
    if (err.type === 'entity.too.large') return res.status(413).json({ error: 'Upload is too large. Try fewer or smaller photos.' });
    if (err.type === 'entity.parse.failed') return res.status(400).json({ error: 'Invalid request body' });
    if (!err.status || err.status >= 500) console.error(err);
    const { status = 500, message, problems, code, totals } = err;
    res.status(status).json({ error: status >= 500 ? 'Something went wrong. Please try again.' : message, problems, code, totals });
  });

  // Optional: serve the built admin app at /admin (ADMIN_STATIC_DIR=../admin-app/dist).
  // relative paths resolve from the working directory (e.g. ../customer-app/dist when started in backend/)
  const adminDir = process.env.ADMIN_STATIC_DIR && resolve(process.env.ADMIN_STATIC_DIR);
  const staticDir = process.env.STATIC_DIR && resolve(process.env.STATIC_DIR);
  if (adminDir) {
    app.use('/admin', express.static(adminDir, { index: false, maxAge: '1y', immutable: true }));
    app.get(/^\/admin(\/.*)?$/, (_req, res) => res.set({ 'Cache-Control': 'no-cache', 'X-Robots-Tag': 'noindex' }).sendFile('index.html', { root: adminDir }));
  }
  // Optional: serve the built customer PWA from the same origin (STATIC_DIR=../customer-app/dist).
  if (staticDir) {
    app.use(express.static(staticDir, { index: false, maxAge: '1y', immutable: true, setHeaders: (res, path) => {
      if (/(sw\.js|manifest\.webmanifest)$/.test(path)) res.set('Cache-Control', 'no-cache');
    } }));
    app.get(/.*/, (_req, res) => res.set('Cache-Control', 'no-cache').sendFile('index.html', { root: staticDir }));
  }
  return app;
}

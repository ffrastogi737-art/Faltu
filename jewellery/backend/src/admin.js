// Owner / admin / employee API, mounted at /api/admin. Same database and business rules as the
// customer API: orders, stock, notifications and pricing are never re-implemented here.
import express from 'express';
import { query, tx } from './db.js';
import { hashPassword, issueToken, readToken, verifyPassword } from './auth.js';
import { httpError } from './pricing.js';
import { getSettings, rateLimit, serializeOrder, wrap } from './app.js';
import { deleteFiles } from './storage.js';
import { saveUpload } from './media.js';
import { parseCsv, toCsv } from './csv.js';
import { realtime } from './realtime.js';
import * as v from './validate.js';
import { reports, dashboard } from './reports.js';

const ROLES = ['owner', 'admin', 'employee'];
const ORDER_STATUSES = ['new', 'confirmed', 'preparing', 'ready_for_delivery', 'out_for_delivery', 'delivered', 'cancelled'];
const REPLACEMENT_STATUSES = ['requested', 'under_review', 'approved', 'rejected', 'replacement_preparing', 'replacement_delivered', 'completed'];
const DEMO_CONFIRM = 'REMOVE DEMO DATA';

async function loadStaff(token) {
  const id = readToken(token, 'staff');
  if (!id) return null;
  const { rows } = await query('SELECT id, name, mobile, role, active FROM staff WHERE id = $1', [id]);
  return rows[0]?.active ? rows[0] : null; // deactivation takes effect immediately
}

const allow = (...roles) => (req, _res, next) => next(roles.includes(req.staff.role) ? undefined : httpError(403, 'You do not have permission for this'));

export async function audit(db, staffId, action, entity, entityId, details = {}) {
  await db.query('INSERT INTO audit_log (staff_id, action, entity, entity_id, details) VALUES ($1,$2,$3,$4,$5)', [staffId, action, entity, entityId == null ? null : String(entityId), details]);
}

// Lets the DB triggers attribute stock moves / status history to this staff member.
const actAs = (db, staffId, extra = {}) =>
  db.query(`SELECT set_config('app.staff_id', $1, true), set_config('app.stock_reason', $2, true), set_config('app.stock_note', $3, true)`,
    [String(staffId), extra.reason || '', extra.note || '']);

const int = (value, field, { min = 0, max = 1e9 } = {}) => {
  const n = Number(value);
  if (!Number.isInteger(n) || n < min || n > max) throw httpError(400, `${field} must be a whole number${min > 0 ? ` ≥ ${min}` : ''}`);
  return n;
};
const paise = (rupees, field) => {
  const n = Number(rupees);
  if (rupees === '' || rupees === null || !Number.isFinite(n) || n < 0 || n > 1e7) throw httpError(400, `${field} must be a valid amount`);
  return Math.round(n * 100);
};
const mediaUrl = (u, field) => {
  if (typeof u !== 'string' || !(/^\/uploads\/[\w./-]+$/.test(u) || /^https:\/\/\S+$/.test(u)) || u.includes('..')) throw httpError(400, `${field} is not a valid uploaded file`);
  return u;
};
const slugify = (s) => s.toLowerCase().normalize('NFKD').replace(/[^\w\s-]/g, '').trim().replace(/[\s_-]+/g, '-').slice(0, 60);
const TAGS = ['new_arrival', 'trending', 'best_seller', 'featured', 'offer'];
const range = (q) => {
  const today = new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' });
  const d = (x, fb) => (/^\d{4}-\d{2}-\d{2}$/.test(x || '') ? x : fb);
  return { from: d(q.from, today), to: d(q.to, today) };
};

function validateProduct(b) {
  const original = paise(b.originalPrice, 'Original price');
  const selling = paise(b.sellingPrice, 'Selling price');
  if (selling > original) throw httpError(400, 'Selling price cannot be more than the original price');
  const sku = v.str(b.sku, 'SKU', { min: 1, max: 40 });
  if (!/^[A-Za-z0-9._-]+$/.test(sku)) throw httpError(400, 'SKU may use letters, digits, dot, dash and underscore only');
  const images = Array.isArray(b.images) ? b.images.map((u) => mediaUrl(u, 'Image')) : [];
  if (images.length > 12) throw httpError(400, 'Up to 12 images per product');
  const specs = {};
  for (const [k, val] of Object.entries(b.specifications || {})) {
    const key = v.str(k, 'Specification name', { max: 60 });
    if (key) specs[key] = v.str(String(val ?? ''), `Specification "${key}"`, { max: 300 });
  }
  return {
    name: v.str(b.name, 'Product name', { min: 2, max: 120 }),
    sku,
    description: v.str(b.description, 'Description', { max: 5000 }),
    categoryId: b.categoryId ? int(b.categoryId, 'Category', { min: 1 }) : null,
    original,
    selling,
    stock: int(b.stock ?? 0, 'Stock', { max: 100000 }),
    images,
    videoUrl: b.videoUrl ? mediaUrl(b.videoUrl, 'Video') : null,
    specifications: specs,
    tags: Array.isArray(b.tags) ? [...new Set(b.tags.filter((t) => TAGS.includes(t)))] : [],
    active: b.active !== false,
  };
}

const ADMIN_PRODUCT_COLS = `p.id, p.sku, p.slug, p.name, p.category_id, c.name AS category_name, p.description, p.original_price_paise,
  p.selling_price_paise, p.stock, p.images, p.video_url, p.specifications, p.tags, p.sold_count, p.active, p.is_demo, p.archived_at,
  p.created_at, p.updated_at`;

// ---------- settings ----------
const UPI_ID = /^[a-zA-Z0-9.\-_]{2,256}@[a-zA-Z][a-zA-Z0-9]{1,63}$/;
const SETTINGS_FIELDS = {
  shop_name: (x) => v.str(x, 'Store name', { min: 2, max: 60 }),
  brand_display_name: (x) => v.str(x, 'Brand display name', { max: 60 }),
  tagline: (x) => v.str(x, 'Tagline', { max: 120 }),
  description: (x) => v.str(x, 'Store description', { max: 1000 }),
  logo_url: (x) => (x ? mediaUrl(x, 'Logo') : null),
  app_icon_url: (x) => {
    if (!x) return null;
    if (!/^\/uploads\/icon\/[\w-]+-512\.png$/.test(x)) throw httpError(400, 'Upload the app icon with the App icon uploader');
    return x;
  },
  splash_logo_url: (x) => (x ? mediaUrl(x, 'Splash logo') : null),
  support_phone: (x) => (x ? v.mobile(x, 'Contact number') : ''),
  whatsapp_number: (x) => {
    if (!x) return '';
    const d = String(x).replace(/\D/g, '');
    const n = d.length === 10 ? `91${d}` : d;
    if (!/^91[6-9]\d{9}$/.test(n)) throw httpError(400, 'WhatsApp number must be a 10-digit Indian mobile number');
    return n;
  },
  contact_email: (x) => v.email(x) || '',
  address: (x) => v.str(x, 'Address', { max: 300 }),
  city: (x) => v.str(x, 'City', { max: 80 }),
  state: (x) => v.str(x, 'State', { max: 80 }),
  pincode: (x) => {
    if (x && !/^\d{6}$/.test(x)) throw httpError(400, 'PIN code must be 6 digits');
    return x || '';
  },
  opening_hours: (x) => v.str(x, 'Opening hours', { max: 200 }),
  social_links: (x) => {
    const out = {};
    for (const k of ['instagram', 'facebook', 'youtube', 'website']) {
      const u = String(x?.[k] ?? '').trim();
      if (u && !/^https:\/\/\S+$/.test(u)) throw httpError(400, `${k} link must start with https://`);
      if (u) out[k] = u.slice(0, 300);
    }
    return out;
  },
  upi_id: (x) => {
    const u = String(x ?? '').trim();
    if (u && !UPI_ID.test(u)) throw httpError(400, 'UPI ID looks invalid. It should look like name@bank');
    return u;
  },
  upi_payee_name: (x) => v.str(x, 'Merchant display name', { min: 2, max: 50 }),
  payment_instructions: (x) => v.str(x, 'Payment instructions', { max: 500 }),
  payment_description: (x) => v.str(x, 'Payment description', { max: 30 }),
  upi_enabled: Boolean,
  cod_enabled: Boolean,
  upi_discount_enabled: Boolean,
  upi_discount_percent: (x) => {
    const n = Number(x);
    if (!Number.isFinite(n) || n < 0 || n > 50) throw httpError(400, 'UPI discount must be between 0% and 50%');
    return Math.round(n * 100) / 100;
  },
  upi_discount_min_order_paise: (x) => paise(x / 100, 'Minimum order for UPI discount'),
  upi_discount_max_paise: (x) => paise(x / 100, 'Maximum UPI discount'),
  upi_discount_starts_at: (x) => (x ? new Date(x).toISOString() : null),
  upi_discount_ends_at: (x) => (x ? new Date(x).toISOString() : null),
  delivery_charge_paise: (x) => paise(x / 100, 'Delivery charge'),
  free_delivery_min_paise: (x) => paise(x / 100, 'Free delivery minimum'),
  min_order_paise: (x) => paise(x / 100, 'Minimum order amount'),
  delivery_pincodes: (x) => {
    const list = (Array.isArray(x) ? x : String(x || '').split(/[\s,]+/)).map((p) => String(p).trim()).filter(Boolean);
    for (const p of list) if (!/^\d{6}$/.test(p)) throw httpError(400, `Delivery PIN code "${p}" must be 6 digits`);
    return [...new Set(list)];
  },
  delivery_areas_note: (x) => v.str(x, 'Delivery areas note', { max: 300 }),
  replacement_policy: (x) => v.str(x, 'Replacement policy', { max: 3000 }),
  replacement_window_hours: (x) => int(x, 'Reporting window', { min: 1, max: 720 }),
  cancellable_statuses: (x) => {
    const list = Array.isArray(x) ? x.filter((s) => ['new', 'confirmed', 'preparing'].includes(s)) : [];
    return list;
  },
  low_stock_threshold: (x) => int(x, 'Low stock threshold', { max: 1000 }),
  show_demo_products: Boolean,
};
const PAYMENT_KEYS = ['upi_id', 'upi_payee_name', 'upi_enabled', 'cod_enabled', 'payment_instructions', 'payment_description'];

export function adminRouter() {
  const r = express.Router();

  r.post('/auth/login', wrap(async (req, res) => {
    const m = v.mobile(req.body?.mobile);
    if (!rateLimit(`staff:${req.ip}:${m}`, 8)) throw httpError(429, 'Too many attempts. Try again in 15 minutes.');
    const { rows } = await query('SELECT * FROM staff WHERE mobile = $1', [m]);
    const s = rows[0];
    if (!s || !(await verifyPassword(String(req.body?.password ?? ''), s.password_hash))) throw httpError(401, 'Mobile number or password is incorrect');
    if (!s.active) throw httpError(403, 'This account has been deactivated. Contact the owner.');
    await audit({ query }, s.id, 'login', 'staff', s.id);
    res.json({ token: issueToken(s.id, 'staff', 14), staff: { id: s.id, name: s.name, mobile: s.mobile, role: s.role } });
  }));

  // EventSource can't send headers: token in the query string, checked here.
  r.get('/events', wrap(async (req, res) => {
    if (!(await loadStaff(String(req.query.token || '')))) throw httpError(401, 'Please log in');
    realtime.subscribe(req, res, true);
  }));

  r.use(wrap(async (req, _res, next) => {
    const h = req.get('authorization') || '';
    req.staff = h.startsWith('Bearer ') ? await loadStaff(h.slice(7)) : null;
    if (!req.staff) throw httpError(401, 'Please log in');
    next();
  }));
  const owner = allow('owner');
  const manager = allow('owner', 'admin');

  r.get('/me', (req, res) => res.json(req.staff));
  r.post('/me/password', wrap(async (req, res) => {
    const { current, next: nextPw } = req.body || {};
    if (typeof nextPw !== 'string' || nextPw.length < 8 || nextPw.length > 128) throw httpError(400, 'New password must be at least 8 characters');
    const { rows } = await query('SELECT password_hash FROM staff WHERE id = $1', [req.staff.id]);
    if (!(await verifyPassword(String(current ?? ''), rows[0].password_hash))) throw httpError(400, 'Current password is incorrect');
    await query('UPDATE staff SET password_hash = $2 WHERE id = $1', [req.staff.id, await hashPassword(nextPw)]);
    await audit({ query }, req.staff.id, 'change_password', 'staff', req.staff.id);
    res.json({ ok: true });
  }));

  // ---------- alerts (admin notifications) ----------
  r.get('/alerts', wrap(async (req, res) => {
    if (req.staff.role === 'employee') {
      const { rows } = await query(`SELECT count(*)::int AS n FROM orders WHERE assigned_employee_id = $1 AND status NOT IN ('delivered','cancelled')`, [req.staff.id]);
      return res.json({ assignedOpen: rows[0].n });
    }
    const { rows: [a] } = await query(
      `SELECT (SELECT count(*) FROM orders WHERE status = 'new')::int AS new_orders,
              (SELECT count(*) FROM orders WHERE payment_method = 'upi' AND payment_status = 'verification_pending' AND status <> 'cancelled')::int AS verification_pending,
              (SELECT count(*) FROM products WHERE active AND archived_at IS NULL AND stock <= (SELECT low_stock_threshold FROM store_settings WHERE id = 1))::int AS low_stock,
              (SELECT count(*) FROM replacement_requests WHERE status IN ('requested','under_review'))::int AS open_replacements,
              (SELECT count(*) FROM orders WHERE status = 'cancelled' AND cancelled_at > now() - interval '24 hours')::int AS cancelled_today`,
    );
    res.json(a);
  }));

  // ---------- dashboard + reports ----------
  r.get('/dashboard', owner, wrap(async (req, res) => res.json(await dashboard(range(req.query)))));
  r.get('/reports/:type', wrap(async (req, res) => {
    const report = reports[req.params.type];
    if (!report) throw httpError(404, 'Unknown report');
    if (!report.roles.includes(req.staff.role)) throw httpError(403, 'You do not have permission for this report');
    const rows = await report.run(range(req.query));
    if (req.query.format === 'csv') {
      await audit({ query }, req.staff.id, 'export', 'report', req.params.type, range(req.query));
      return res.type('text/csv').attachment(`${req.params.type}-${range(req.query).from}-to-${range(req.query).to}.csv`).send(toCsv(rows));
    }
    res.json(rows);
  }));

  // ---------- settings (owner only) ----------
  r.get('/settings', owner, wrap(async (_req, res) => res.json(await getSettings())));
  r.patch('/settings', owner, wrap(async (req, res) => {
    const changes = {};
    for (const [k, val] of Object.entries(req.body || {})) {
      if (!SETTINGS_FIELDS[k]) throw httpError(400, `Unknown setting: ${k}`);
      changes[k] = SETTINGS_FIELDS[k](val);
    }
    if (!Object.keys(changes).length) throw httpError(400, 'Nothing to save');
    const saved = await tx(async (db) => {
      const before = await getSettings(db);
      const merged = { ...before, ...changes };
      if (merged.upi_enabled && !merged.upi_id) throw httpError(400, 'Enter a UPI ID before enabling UPI payments');
      if (!merged.upi_enabled && !merged.cod_enabled) throw httpError(400, 'Keep at least one payment method enabled');
      if (merged.upi_discount_starts_at && merged.upi_discount_ends_at && new Date(merged.upi_discount_starts_at) >= new Date(merged.upi_discount_ends_at)) {
        throw httpError(400, 'UPI discount end date must be after the start date');
      }
      const keys = Object.keys(changes);
      const { rows } = await db.query(`UPDATE store_settings SET ${keys.map((k, i) => `${k} = $${i + 1}`).join(', ')} WHERE id = 1 RETURNING *`, keys.map((k) => changes[k]));
      const diff = Object.fromEntries(keys.filter((k) => JSON.stringify(before[k]) !== JSON.stringify(rows[0][k])).map((k) => [k, { from: before[k], to: rows[0][k] }]));
      if (Object.keys(diff).length) {
        const area = keys.some((k) => PAYMENT_KEYS.includes(k)) ? 'payment_settings' : keys.some((k) => k.startsWith('upi_discount')) ? 'upi_discount' : 'store_settings';
        await audit(db, req.staff.id, 'update', area, 1, diff);
      }
      return rows[0];
    });
    res.json(saved);
  }));

  // ---------- uploads ----------
  r.post('/uploads', express.raw({ type: () => true, limit: '60mb' }), wrap(async (req, res) => {
    const kind = String(req.query.kind || '');
    if (['logo', 'icon', 'splash'].includes(kind) ? req.staff.role !== 'owner' : req.staff.role === 'employee') throw httpError(403, 'You do not have permission to upload this');
    res.status(201).json(await saveUpload(kind, req.body));
  }));

  // ---------- categories ----------
  r.get('/categories', manager, wrap(async (_req, res) => {
    const { rows } = await query(
      `SELECT c.*, count(p.id)::int AS product_count FROM categories c LEFT JOIN products p ON p.category_id = c.id AND p.archived_at IS NULL
        GROUP BY c.id ORDER BY c.sort_order, c.name`,
    );
    res.json(rows);
  }));
  const categoryBody = (b) => ({
    name: v.str(b.name, 'Category name', { min: 2, max: 60 }),
    slug: slugify(v.str(b.slug || b.name, 'Slug', { min: 2, max: 60 })),
    image: b.imageUrl ? mediaUrl(b.imageUrl, 'Category image') : null,
    active: b.active !== false,
  });
  r.post('/categories', manager, wrap(async (req, res) => {
    const c = categoryBody(req.body || {});
    const { rows } = await query(
      `INSERT INTO categories (name, slug, image_url, active, sort_order) VALUES ($1,$2,$3,$4,(SELECT COALESCE(max(sort_order),0)+1 FROM categories))
       ON CONFLICT (slug) DO NOTHING RETURNING *`, [c.name, c.slug, c.image, c.active]);
    if (!rows[0]) throw httpError(409, 'A category with this name already exists');
    await audit({ query }, req.staff.id, 'create', 'category', rows[0].id, { name: c.name });
    res.status(201).json(rows[0]);
  }));
  r.put('/categories/:id', manager, wrap(async (req, res) => {
    const c = categoryBody(req.body || {});
    const { rows } = await query('UPDATE categories SET name=$2, slug=$3, image_url=$4, active=$5 WHERE id=$1 RETURNING *', [Number(req.params.id), c.name, c.slug, c.image, c.active])
      .catch((e) => { throw e.code === '23505' ? httpError(409, 'A category with this name already exists') : e; });
    if (!rows[0]) throw httpError(404, 'Category not found');
    await audit({ query }, req.staff.id, 'update', 'category', rows[0].id, c);
    res.json(rows[0]);
  }));
  r.delete('/categories/:id', manager, wrap(async (req, res) => {
    const { rows: [{ n }] } = await query('SELECT count(*)::int AS n FROM products WHERE category_id = $1', [Number(req.params.id)]);
    if (n) throw httpError(409, `Move or delete the ${n} product(s) in this category first, or deactivate it instead`);
    await query('DELETE FROM categories WHERE id = $1', [Number(req.params.id)]);
    await audit({ query }, req.staff.id, 'delete', 'category', req.params.id);
    res.json({ ok: true });
  }));
  r.post('/categories/reorder', manager, wrap(async (req, res) => {
    const ids = Array.isArray(req.body?.ids) ? req.body.ids.map(Number).filter(Number.isInteger) : [];
    await tx(async (db) => { for (const [i, id] of ids.entries()) await db.query('UPDATE categories SET sort_order = $2 WHERE id = $1', [id, i]); });
    res.json({ ok: true });
  }));

  // ---------- products ----------
  r.get('/products', manager, wrap(async (req, res) => {
    const where = [];
    const params = [];
    const add = (sql, val) => { params.push(val); where.push(sql.replaceAll('?', `$${params.length}`)); };
    const status = req.query.status || 'current';
    if (status === 'archived') where.push('p.archived_at IS NOT NULL');
    else {
      where.push('p.archived_at IS NULL');
      if (status === 'active') where.push('p.active');
      if (status === 'inactive') where.push('NOT p.active');
      if (status === 'demo') where.push('p.is_demo');
      if (status === 'low') where.push('p.stock <= (SELECT low_stock_threshold FROM store_settings WHERE id = 1)');
    }
    if (req.query.category) add('p.category_id = ?', Number(req.query.category));
    if (req.query.q) add(`(p.name ILIKE ? OR p.sku ILIKE ?)`, `%${String(req.query.q).replace(/[%_\\]/g, '\\$&')}%`);
    const page = Math.max(1, parseInt(req.query.page) || 1);
    const { rows } = await query(
      `SELECT ${ADMIN_PRODUCT_COLS}, count(*) OVER()::int AS total FROM products p LEFT JOIN categories c ON c.id = p.category_id
        WHERE ${where.join(' AND ')} ORDER BY p.updated_at DESC, p.id DESC LIMIT 50 OFFSET ${(page - 1) * 50}`, params);
    res.json({ items: rows, total: rows[0]?.total || 0, page });
  }));

  r.get('/products/:id', manager, wrap(async (req, res) => {
    const { rows } = await query(`SELECT ${ADMIN_PRODUCT_COLS} FROM products p LEFT JOIN categories c ON c.id = p.category_id WHERE p.id = $1`, [Number(req.params.id)]);
    if (!rows[0]) throw httpError(404, 'Product not found');
    const moves = await query(
      `SELECT m.*, s.name AS staff_name, o.order_number FROM inventory_movements m LEFT JOIN staff s ON s.id = m.staff_id
         LEFT JOIN orders o ON o.id = m.order_id WHERE m.product_id = $1 ORDER BY m.id DESC LIMIT 100`, [rows[0].id]);
    const { rows: [{ n }] } = await query('SELECT count(*)::int AS n FROM order_items WHERE product_id = $1', [rows[0].id]);
    res.json({ ...rows[0], movements: moves.rows, orderCount: n });
  }));

  const saveProduct = (id) => wrap(async (req, res) => {
    const p = validateProduct(req.body || {});
    const saved = await tx(async (db) => {
      await actAs(db, req.staff.id, { reason: id ? 'adjustment' : 'opening', note: 'Product form' });
      const vals = [p.name, p.sku, p.description, p.categoryId, p.original, p.selling, p.stock, p.images, p.videoUrl, p.specifications, p.tags, p.active];
      // stock is not overwritten on edit (an order placed meanwhile would be lost); use POST /products/:id/stock
      const q = id
        ? db.query(`UPDATE products SET name=$1, sku=$2, description=$3, category_id=$4, original_price_paise=$5, selling_price_paise=$6,
                     images=$7, video_url=$8, specifications=$9, tags=$10, active=$11 WHERE id=$12 RETURNING id`, [...vals.filter((_, i) => i !== 6), id])
        : db.query(`INSERT INTO products (name, sku, description, category_id, original_price_paise, selling_price_paise, stock, images, video_url,
                     specifications, tags, active, slug) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13) RETURNING id`,
          [...vals, `${slugify(p.name)}-${slugify(p.sku)}`]);
      const { rows } = await q.catch((e) => { throw e.code === '23505' ? httpError(409, `SKU ${p.sku} is already used by another product`) : e; });
      if (!rows[0]) throw httpError(404, 'Product not found');
      await audit(db, req.staff.id, id ? 'update' : 'create', 'product', rows[0].id, { sku: p.sku, name: p.name, sellingPaise: p.selling, stock: p.stock });
      return rows[0];
    });
    res.status(id ? 200 : 201).json(saved);
  });
  r.post('/products', manager, saveProduct(null));
  r.put('/products/:id', manager, (req, res, next) => saveProduct(int(req.params.id, 'id', { min: 1 }))(req, res, next));

  r.post('/products/:id/archive', manager, wrap(async (req, res) => {
    const archive = req.body?.archived !== false;
    const { rows } = await query(`UPDATE products SET archived_at = ${archive ? 'now()' : 'NULL'}, active = ${archive ? 'false' : 'active'} WHERE id = $1 RETURNING id`, [Number(req.params.id)]);
    if (!rows[0]) throw httpError(404, 'Product not found');
    await audit({ query }, req.staff.id, archive ? 'archive' : 'unarchive', 'product', req.params.id);
    res.json({ ok: true });
  }));

  // Real products that were ever ordered can only be archived, so order history keeps its product link.
  r.delete('/products/:id', manager, wrap(async (req, res) => {
    const id = Number(req.params.id);
    const { rows: [{ n }] } = await query('SELECT count(*)::int AS n FROM order_items WHERE product_id = $1', [id]);
    if (n) throw httpError(409, `This product appears in ${n} order(s). Archive it instead so order history stays intact.`);
    const { rows } = await query('DELETE FROM products WHERE id = $1 RETURNING sku, name', [id]);
    if (!rows[0]) throw httpError(404, 'Product not found');
    await audit({ query }, req.staff.id, 'delete', 'product', id, rows[0]);
    res.json({ ok: true });
  }));

  // ---------- inventory ----------
  r.post('/products/:id/stock', manager, wrap(async (req, res) => {
    const change = int(req.body?.change, 'Stock change', { min: -100000, max: 100000 });
    if (change === 0) throw httpError(400, 'Stock change cannot be zero');
    const reason = ['restock', 'damaged', 'correction', 'adjustment'].includes(req.body?.reason) ? req.body.reason : 'adjustment';
    const note = v.str(req.body?.note, 'Note', { max: 200 });
    const row = await tx(async (db) => {
      await actAs(db, req.staff.id, { reason, note });
      // guarded update: stock can never go negative, even with concurrent orders
      const { rows } = await db.query('UPDATE products SET stock = stock + $2 WHERE id = $1 AND stock + $2 >= 0 RETURNING id, sku, stock', [Number(req.params.id), change]);
      if (!rows[0]) throw httpError(409, 'Not enough stock to remove that many');
      return rows[0];
    });
    res.json(row);
  }));
  r.get('/inventory/movements', manager, wrap(async (req, res) => {
    const page = Math.max(1, parseInt(req.query.page) || 1);
    const { rows } = await query(
      `SELECT m.*, s.name AS staff_name, o.order_number FROM inventory_movements m LEFT JOIN staff s ON s.id = m.staff_id
         LEFT JOIN orders o ON o.id = m.order_id ${req.query.productId ? 'WHERE m.product_id = $1' : ''}
        ORDER BY m.id DESC LIMIT 100 OFFSET ${(page - 1) * 100}`, req.query.productId ? [Number(req.query.productId)] : []);
    res.json(rows);
  }));

  // ---------- bulk import ----------
  r.post('/products/import', manager, wrap(async (req, res) => {
    const text = String(req.body?.csv ?? '');
    if (text.length > 2e6) throw httpError(400, 'CSV is too large (max 2 MB)');
    const rows = parseCsv(text.replace(/^﻿/, ''));
    if (rows.length < 2) throw httpError(400, 'The CSV needs a header row and at least one product');
    const header = rows[0].map((h) => h.trim().toLowerCase().replace(/[^a-z]/g, ''));
    const col = (...names) => header.findIndex((h) => names.includes(h));
    const idx = { name: col('productname', 'name'), sku: col('sku'), category: col('category'), original: col('originalprice', 'mrp'), selling: col('sellingprice', 'price'), stock: col('stock', 'quantity'), description: col('description') };
    const missing = Object.entries(idx).filter(([k, i]) => i < 0 && k !== 'description').map(([k]) => k);
    if (missing.length) throw httpError(400, `Missing column(s): ${missing.join(', ')}. Expected: Product Name, SKU, Category, Original Price, Selling Price, Stock, Description`);
    const cats = (await query('SELECT id, slug, lower(name) AS name FROM categories')).rows;
    const existing = new Set((await query('SELECT lower(sku) AS sku FROM products')).rows.map((x) => x.sku));
    const seen = new Set();
    const results = rows.slice(1).map((cells, i) => {
      const get = (k) => (idx[k] >= 0 ? (cells[idx[k]] ?? '').trim() : '');
      const errors = [];
      const out = { row: i + 2, name: get('name'), sku: get('sku'), category: get('category') };
      try {
        const cat = cats.find((c) => c.name === out.category.toLowerCase() || c.slug === slugify(out.category));
        if (!cat) errors.push(`Unknown category "${out.category}"`);
        const p = validateProduct({ name: out.name, sku: out.sku, originalPrice: get('original').replace(/[₹,\s]/g, ''), sellingPrice: get('selling').replace(/[₹,\s]/g, ''), stock: get('stock') || 0, description: get('description'), categoryId: cat?.id });
        Object.assign(out, { product: p });
      } catch (e) {
        errors.push(e.message);
      }
      const key = out.sku.toLowerCase();
      if (key && existing.has(key)) errors.push('SKU already exists in the catalogue'), out.duplicate = true;
      if (key && seen.has(key)) errors.push('SKU repeated in this file'), out.duplicate = true;
      seen.add(key);
      return { ...out, errors, valid: errors.length === 0 };
    });
    const valid = results.filter((x) => x.valid);
    let imported = 0;
    if (req.body?.commit === true && valid.length) {
      await tx(async (db) => {
        await actAs(db, req.staff.id, { reason: 'opening', note: 'CSV import' });
        for (const { product: p } of valid) {
          await db.query(
            `INSERT INTO products (name, sku, slug, description, category_id, original_price_paise, selling_price_paise, stock, active)
             VALUES ($1,$2,$3,$4,$5,$6,$7,$8,true)`, [p.name, p.sku, `${slugify(p.name)}-${slugify(p.sku)}`, p.description, p.categoryId, p.original, p.selling, p.stock]);
          imported++;
        }
        await audit(db, req.staff.id, 'import', 'product', null, { imported });
      });
    }
    res.json({
      totalRows: results.length,
      validCount: valid.length,
      invalidCount: results.length - valid.length,
      duplicateSkus: results.filter((x) => x.duplicate).map((x) => x.sku),
      imported,
      rows: results.map(({ product, ...rest }) => ({ ...rest, originalPaise: product?.original, sellingPaise: product?.selling, stock: product?.stock })),
    });
  }));

  // ---------- demo data (owner) ----------
  r.get('/demo', owner, wrap(async (_req, res) => {
    const { rows: [d] } = await query(
      `SELECT count(*)::int AS demo_products,
              count(*) FILTER (WHERE EXISTS (SELECT 1 FROM order_items i WHERE i.product_id = p.id))::int AS demo_with_orders,
              (SELECT count(*) FROM products WHERE NOT is_demo)::int AS real_products,
              (SELECT count(*) FROM categories WHERE image_url LIKE '/uploads/products/cat-%.svg')::int AS demo_category_images,
              (SELECT show_demo_products FROM store_settings WHERE id = 1) AS shown_to_customers,
              (SELECT upi_id FROM store_settings WHERE id = 1) AS upi_id
         FROM products p WHERE is_demo`);
    const list = await query('SELECT id, sku, name, images[1] AS image, stock FROM products WHERE is_demo ORDER BY id LIMIT 200');
    res.json({ ...d, upiIsPlaceholder: d.upi_id === 'aabhajewels@upi', products: list.rows });
  }));
  r.post('/demo/remove', owner, wrap(async (req, res) => {
    if (req.body?.confirm !== DEMO_CONFIRM) throw httpError(400, `Type ${DEMO_CONFIRM} to confirm`);
    const result = await tx(async (db) => {
      // order_items keep their own name/SKU/price snapshot, so past orders stay complete
      const del = await db.query('DELETE FROM products WHERE is_demo RETURNING id, images');
      const catImgs = await db.query(`UPDATE categories SET image_url = NULL WHERE image_url LIKE '/uploads/products/cat-%.svg' RETURNING id`);
      await audit(db, req.staff.id, 'remove_demo_data', 'product', null, { products: del.rowCount, categoryImages: catImgs.rowCount });
      return { products: del.rowCount, categoryImages: catImgs.rowCount, files: del.rows.flatMap((p) => p.images) };
    });
    // generated art no order still points at can go
    const keep = new Set((await query('SELECT DISTINCT image_url FROM order_items WHERE image_url IS NOT NULL')).rows.map((x) => x.image_url));
    await deleteFiles(result.files.filter((f) => f.endsWith('.svg') && f.startsWith('/uploads/products/') && !keep.has(f)));
    res.json({ removedProducts: result.products, clearedCategoryImages: result.categoryImages });
  }));

  // ---------- orders ----------
  const ORDER_LIST_COLS = `o.id, o.order_number, o.status, o.payment_method, o.payment_status, o.payment_reference, o.bank_reference, o.total_paise,
    o.contact_name, o.contact_mobile, o.shipping_address, o.created_at, o.delivered_at, o.picked_up_at, o.cod_collected_paise, o.cod_collected_at,
    o.assigned_employee_id, e.name AS employee_name,
    (SELECT sum(quantity)::int FROM order_items i WHERE i.order_id = o.id) AS item_count`;
  r.get('/orders', manager, wrap(async (req, res) => {
    const where = ['true'];
    const params = [];
    const add = (sql, val) => { params.push(val); where.push(sql.replaceAll('?', `$${params.length}`)); };
    if (ORDER_STATUSES.includes(req.query.status)) add('o.status = ?', req.query.status);
    if (req.query.status === 'open') where.push(`o.status NOT IN ('delivered','cancelled')`);
    if (['upi', 'cod'].includes(req.query.method)) add('o.payment_method = ?', req.query.method);
    if (['pending', 'verification_pending', 'verified', 'failed'].includes(req.query.payment)) add('o.payment_status = ?', req.query.payment);
    if (req.query.codPending === '1') where.push(`o.payment_method = 'cod' AND o.cod_collected_at IS NULL AND o.status <> 'cancelled'`);
    if (req.query.employee) add('o.assigned_employee_id = ?', Number(req.query.employee));
    if (req.query.from) add(`(o.created_at AT TIME ZONE 'Asia/Kolkata')::date >= ?::date`, range(req.query).from);
    if (req.query.to) add(`(o.created_at AT TIME ZONE 'Asia/Kolkata')::date <= ?::date`, range(req.query).to);
    if (req.query.q) add('(o.order_number ILIKE ? OR o.contact_name ILIKE ? OR o.contact_mobile ILIKE ? OR o.payment_reference ILIKE ?)', `%${String(req.query.q).replace(/[%_\\]/g, '\\$&')}%`);
    const page = Math.max(1, parseInt(req.query.page) || 1);
    const { rows } = await query(
      `SELECT ${ORDER_LIST_COLS}, count(*) OVER()::int AS total FROM orders o LEFT JOIN staff e ON e.id = o.assigned_employee_id
        WHERE ${where.join(' AND ')} ORDER BY o.created_at DESC LIMIT 50 OFFSET ${(page - 1) * 50}`, params);
    res.json({ items: rows, total: rows[0]?.total || 0, page });
  }));

  r.get('/my-orders', allow('employee', 'admin', 'owner'), wrap(async (req, res) => {
    const { rows } = await query(
      `SELECT ${ORDER_LIST_COLS} FROM orders o LEFT JOIN staff e ON e.id = o.assigned_employee_id
        WHERE o.assigned_employee_id = $1 AND (o.status NOT IN ('delivered','cancelled') OR o.delivered_at > now() - interval '7 days')
        ORDER BY o.status = 'delivered', o.created_at`, [req.staff.id]);
    res.json(rows);
  }));

  async function orderFor(req, db = { query }, lock = false) {
    const { rows } = await db.query(`SELECT * FROM orders WHERE order_number = $1 ${lock ? 'FOR UPDATE' : ''}`, [String(req.params.number)]);
    const o = rows[0];
    if (!o) throw httpError(404, 'Order not found');
    if (req.staff.role === 'employee' && o.assigned_employee_id !== req.staff.id) throw httpError(404, 'Order not found');
    return o;
  }

  r.get('/orders/:number', wrap(async (req, res) => {
    const o = await orderFor(req);
    const [base, extra] = await Promise.all([
      serializeOrder(o, await getSettings()),
      query(
        `SELECT e.name AS employee_name, e.mobile AS employee_mobile, d.name AS delivered_by_name, c.name AS cod_by_name, pv.name AS verified_by_name,
                cu.id AS customer_id, cu.name AS customer_name, cu.mobile AS customer_mobile, cu.email AS customer_email,
                (SELECT json_agg(json_build_object('status', h.status, 'at', h.created_at, 'by', s.name) ORDER BY h.id)
                   FROM order_status_history h LEFT JOIN staff s ON s.id = h.staff_id WHERE h.order_id = $1) AS history
           FROM orders o LEFT JOIN staff e ON e.id = o.assigned_employee_id LEFT JOIN staff d ON d.id = o.delivered_by
           LEFT JOIN staff c ON c.id = o.cod_collected_by LEFT JOIN staff pv ON pv.id = o.payment_verified_by
           LEFT JOIN customers cu ON cu.id = o.customer_id WHERE o.id = $1`, [o.id]),
    ]);
    const x = extra.rows[0];
    res.json({
      ...base,
      upiLink: undefined,
      assignedEmployee: o.assigned_employee_id ? { id: o.assigned_employee_id, name: x.employee_name, mobile: x.employee_mobile } : null,
      pickedUpAt: o.picked_up_at,
      deliveredBy: x.delivered_by_name,
      cod: o.payment_method === 'cod' ? { expectedPaise: o.total_paise, collectedPaise: o.cod_collected_paise, collectedAt: o.cod_collected_at, collectedBy: x.cod_by_name } : null,
      payment: { bankReference: o.bank_reference, verifiedBy: x.verified_by_name, verifiedAt: o.payment_verified_at, note: o.payment_note },
      customer: req.staff.role === 'employee' || !x.customer_id ? null : { id: x.customer_id, name: x.customer_name, mobile: x.customer_mobile, email: x.customer_email },
      history: x.history || [],
      isGuest: !o.customer_id,
    });
  }));

  const NEXT = { new: ['confirmed'], confirmed: ['preparing'], preparing: ['ready_for_delivery'], ready_for_delivery: ['out_for_delivery'], out_for_delivery: ['delivered'] };
  r.post('/orders/:number/status', wrap(async (req, res) => {
    const status = req.body?.status;
    if (!ORDER_STATUSES.includes(status)) throw httpError(400, 'Unknown status');
    const reason = v.str(req.body?.reason, 'Reason', { max: 300 });
    await tx(async (db) => {
      const o = await orderFor(req, db, true);
      if (['delivered', 'cancelled'].includes(o.status)) throw httpError(409, `Order is already ${o.status}`);
      if (req.staff.role === 'employee') {
        // employees only drive the last mile of their own orders; no OTP needed
        if (!['out_for_delivery', 'delivered'].includes(status)) throw httpError(403, 'Employees can only mark orders out for delivery or delivered');
        if (status === 'delivered' && o.status !== 'out_for_delivery') throw httpError(409, 'Mark the order Out for Delivery first');
        if (status === 'out_for_delivery' && !['ready_for_delivery', 'preparing', 'confirmed'].includes(o.status)) throw httpError(409, 'This order is not ready yet');
      } else if (status !== 'cancelled' && ORDER_STATUSES.indexOf(status) <= ORDER_STATUSES.indexOf(o.status)) {
        throw httpError(409, 'Orders can only move forward');
      }
      if (status === 'cancelled' && !reason) throw httpError(400, 'Give a reason for cancelling');
      await actAs(db, req.staff.id);
      await db.query(
        `UPDATE orders SET status = $2, delivered_by = CASE WHEN $2 = 'delivered' THEN $3 ELSE delivered_by END,
                cancel_reason = CASE WHEN $2 = 'cancelled' THEN $4 ELSE cancel_reason END WHERE id = $1`,
        [o.id, status, req.staff.id, reason ? `${reason} (by shop)` : null]);
      await audit(db, req.staff.id, 'status', 'order', o.order_number, { from: o.status, to: status, reason });
    });
    res.json({ ok: true, next: NEXT[status] || [] });
  }));

  r.post('/orders/:number/pickup', wrap(async (req, res) => {
    await tx(async (db) => {
      const o = await orderFor(req, db, true);
      if (['delivered', 'cancelled'].includes(o.status)) throw httpError(409, `Order is already ${o.status}`);
      if (!o.assigned_employee_id) throw httpError(409, 'Assign the order to an employee first');
      await db.query('UPDATE orders SET picked_up_at = COALESCE(picked_up_at, now()) WHERE id = $1', [o.id]);
      await audit(db, req.staff.id, 'pickup', 'order', o.order_number);
    });
    res.json({ ok: true });
  }));

  r.post('/orders/:number/assign', manager, wrap(async (req, res) => {
    const employeeId = req.body?.employeeId ? int(req.body.employeeId, 'Employee', { min: 1 }) : null;
    await tx(async (db) => {
      const o = await orderFor(req, db, true);
      if (['delivered', 'cancelled'].includes(o.status)) throw httpError(409, `Order is already ${o.status}`);
      let name = null;
      if (employeeId) {
        const e = (await db.query(`SELECT name FROM staff WHERE id = $1 AND active AND role = 'employee'`, [employeeId])).rows[0];
        if (!e) throw httpError(400, 'Choose an active delivery employee');
        name = e.name;
      }
      // delivery_agent_name is what the customer app shows
      await db.query('UPDATE orders SET assigned_employee_id = $2, delivery_agent_name = $3, picked_up_at = CASE WHEN $2 IS DISTINCT FROM assigned_employee_id THEN NULL ELSE picked_up_at END WHERE id = $1', [o.id, employeeId, name]);
      await audit(db, req.staff.id, o.assigned_employee_id ? 'reassign' : 'assign', 'order', o.order_number, { from: o.assigned_employee_id, to: employeeId });
    });
    res.json({ ok: true });
  }));

  // Only the owner confirms money, and only after seeing the credit in the bank / UPI merchant account.
  r.post('/orders/:number/payment', owner, wrap(async (req, res) => {
    const status = req.body?.status;
    if (!['verified', 'failed'].includes(status)) throw httpError(400, 'Choose verified or failed');
    const ref = String(req.body?.bankReference ?? '').trim();
    const note = v.str(req.body?.note, 'Note', { max: 300 });
    if (status === 'verified') {
      if (!/^[A-Za-z0-9]{6,35}$/.test(ref)) throw httpError(400, 'Enter the UTR / transaction reference shown in your bank or UPI merchant account');
      if (req.body?.confirmBankCredit !== true) throw httpError(400, 'Confirm that you have checked the credit in your bank account');
    } else if (!note) throw httpError(400, 'Add a note explaining why the payment failed');
    await tx(async (db) => {
      const o = await orderFor(req, db, true);
      if (o.payment_method !== 'upi') throw httpError(409, 'This is not a UPI order');
      if (o.payment_status === 'verified') throw httpError(409, 'Payment is already verified');
      if (status === 'verified') {
        const dup = await db.query('SELECT order_number FROM orders WHERE bank_reference = $1 AND id <> $2', [ref, o.id]);
        if (dup.rows[0]) throw httpError(409, `This bank reference is already used for order ${dup.rows[0].order_number}`);
      }
      await db.query(
        `UPDATE orders SET payment_status = $2, bank_reference = nullif($3, ''), payment_note = $4, payment_verified_by = $5, payment_verified_at = now() WHERE id = $1`,
        [o.id, status, ref, note, req.staff.id]);
      await audit(db, req.staff.id, `payment_${status}`, 'order', o.order_number, { amountPaise: o.total_paise, bankReference: ref, customerReference: o.payment_reference });
    });
    res.json({ ok: true });
  }));

  r.post('/orders/:number/cod', wrap(async (req, res) => {
    const amount = paise(req.body?.amount, 'Collected amount');
    const note = v.str(req.body?.note, 'Note', { max: 300 });
    await tx(async (db) => {
      const o = await orderFor(req, db, true);
      if (o.payment_method !== 'cod') throw httpError(409, 'This is not a cash on delivery order');
      if (!['out_for_delivery', 'delivered'].includes(o.status)) throw httpError(409, 'Record cash only when the order is out for delivery or delivered');
      if (o.cod_collected_at) throw httpError(409, 'Cash collection is already recorded for this order');
      if (amount !== o.total_paise && !note) throw httpError(400, `Amount differs from the expected ₹${o.total_paise / 100}. Add a note explaining why.`);
      await db.query(
        `UPDATE orders SET cod_collected_paise = $2, cod_collected_at = now(), cod_collected_by = $3, payment_note = $4,
                payment_status = CASE WHEN $2 >= total_paise THEN 'verified' ELSE payment_status END WHERE id = $1`,
        [o.id, amount, req.staff.id, note]);
      await audit(db, req.staff.id, 'cod_collected', 'order', o.order_number, { expectedPaise: o.total_paise, collectedPaise: amount, note });
    });
    res.json({ ok: true });
  }));

  // ---------- replacements ----------
  r.get('/replacements', manager, wrap(async (req, res) => {
    const st = REPLACEMENT_STATUSES.includes(req.query.status) ? req.query.status : null;
    const { rows } = await query(
      `SELECT r.id, r.status, r.issue, r.description, r.photos, r.admin_note, r.created_at, r.updated_at, o.order_number, o.contact_name, o.contact_mobile,
              o.delivered_at, i.name AS product_name, i.sku, i.image_url, i.quantity
         FROM replacement_requests r JOIN orders o ON o.id = r.order_id JOIN order_items i ON i.id = r.order_item_id
        WHERE ($1::text IS NULL AND r.status IN ('requested','under_review')) OR r.status = $1 OR $1 = 'all'
        ORDER BY r.created_at DESC LIMIT 200`, [req.query.status === 'all' ? 'all' : st]);
    res.json(rows);
  }));
  r.post('/replacements/:id/status', manager, wrap(async (req, res) => {
    const status = req.body?.status;
    if (!REPLACEMENT_STATUSES.includes(status)) throw httpError(400, 'Unknown status');
    const note = v.str(req.body?.note, 'Note', { max: 500 });
    if (status === 'rejected' && !note) throw httpError(400, 'Give the customer a reason for rejecting');
    const { rows } = await query('UPDATE replacement_requests SET status = $2, admin_note = COALESCE(nullif($3, \'\'), admin_note) WHERE id = $1 RETURNING id', [Number(req.params.id), status, note]);
    if (!rows[0]) throw httpError(404, 'Request not found');
    await audit({ query }, req.staff.id, 'replacement_status', 'replacement', req.params.id, { status, note });
    res.json({ ok: true });
  }));

  // ---------- customers ----------
  const CUSTOMER_SQL = `SELECT c.id, c.name, c.mobile, c.email, c.created_at, c.marketing_opt_in,
      count(o.id) FILTER (WHERE o.status <> 'cancelled')::int AS orders,
      COALESCE(sum(o.total_paise) FILTER (WHERE o.status <> 'cancelled'), 0)::int AS spent_paise,
      max(o.created_at) AS last_order_at,
      (SELECT concat_ws(', ', a.house, a.area, a.city, a.pincode) FROM addresses a WHERE a.customer_id = c.id ORDER BY a.is_default DESC, a.id DESC LIMIT 1) AS address
    FROM customers c LEFT JOIN orders o ON o.customer_id = c.id`;
  r.get('/customers', manager, wrap(async (req, res) => {
    const q = req.query.q ? `%${String(req.query.q).replace(/[%_\\]/g, '\\$&')}%` : null;
    const { rows } = await query(
      `${CUSTOMER_SQL} WHERE ($1::text IS NULL OR c.name ILIKE $1 OR c.mobile ILIKE $1 OR c.email ILIKE $1)
        GROUP BY c.id HAVING ($2 = false OR count(o.id) FILTER (WHERE o.status <> 'cancelled') >= 2)
        ORDER BY max(o.created_at) DESC NULLS LAST, c.id DESC LIMIT 500`, [q, req.query.repeat === '1']);
    res.json(rows);
  }));
  r.get('/customers/:id', manager, wrap(async (req, res) => {
    const id = Number(req.params.id);
    const c = (await query(`${CUSTOMER_SQL} WHERE c.id = $1 GROUP BY c.id`, [id])).rows[0];
    if (!c) throw httpError(404, 'Customer not found');
    const [orders, addresses] = await Promise.all([
      query('SELECT order_number, status, payment_method, payment_status, total_paise, created_at FROM orders WHERE customer_id = $1 ORDER BY created_at DESC', [id]),
      query('SELECT label, name, mobile, house, street, area, city, state, pincode, landmark FROM addresses WHERE customer_id = $1', [id]),
    ]);
    res.json({ ...c, orders: orders.rows, addresses: addresses.rows });
  }));
  r.get('/customers-export.csv', owner, wrap(async (req, res) => {
    const { rows } = await query(`${CUSTOMER_SQL} GROUP BY c.id ORDER BY c.id`);
    await audit({ query }, req.staff.id, 'export', 'customers', null, { rows: rows.length });
    res.type('text/csv').attachment('customers.csv').send(toCsv(rows.map((c) => ({ ...c, spent_rupees: c.spent_paise / 100 })),
      ['id', 'name', 'mobile', 'email', 'address', 'created_at', 'orders', 'spent_rupees', 'last_order_at', 'marketing_opt_in']));
  }));

  // ---------- staff ----------
  r.get('/staff', manager, wrap(async (req, res) => {
    const { rows } = await query(
      `SELECT s.id, s.name, s.mobile, s.role, s.active, s.created_at,
              (SELECT count(*) FROM orders o WHERE o.assigned_employee_id = s.id AND o.status NOT IN ('delivered','cancelled'))::int AS open_orders,
              (SELECT count(*) FROM orders o WHERE o.delivered_by = s.id)::int AS delivered
         FROM staff s ${req.staff.role === 'owner' ? '' : `WHERE s.role = 'employee'`} ORDER BY s.active DESC, s.role, s.name`);
    res.json(rows);
  }));
  const staffBody = (b, { password = true } = {}) => {
    const out = { name: v.str(b.name, 'Name', { min: 2, max: 80 }), mobile: v.mobile(b.mobile), role: b.role };
    if (!ROLES.includes(out.role)) throw httpError(400, 'Choose a role');
    if (password && (typeof b.password !== 'string' || b.password.length < 8)) throw httpError(400, 'Password must be at least 8 characters');
    return out;
  };
  r.post('/staff', owner, wrap(async (req, res) => {
    const s = staffBody(req.body || {});
    const { rows } = await query('INSERT INTO staff (name, mobile, role, password_hash) VALUES ($1,$2,$3,$4) ON CONFLICT (mobile) DO NOTHING RETURNING id, name, mobile, role, active',
      [s.name, s.mobile, s.role, await hashPassword(req.body.password)]);
    if (!rows[0]) throw httpError(409, 'A staff account with this mobile number already exists');
    await audit({ query }, req.staff.id, 'create', 'staff', rows[0].id, { name: s.name, role: s.role });
    res.status(201).json(rows[0]);
  }));
  r.put('/staff/:id', owner, wrap(async (req, res) => {
    const id = Number(req.params.id);
    const s = staffBody(req.body || {}, { password: false });
    const active = req.body.active !== false;
    const row = await tx(async (db) => {
      if (id === req.staff.id && (!active || s.role !== 'owner')) throw httpError(400, 'You cannot deactivate or demote your own owner account');
      const { rows } = await db.query('UPDATE staff SET name=$2, mobile=$3, role=$4, active=$5 WHERE id=$1 RETURNING id, name, mobile, role, active', [id, s.name, s.mobile, s.role, active])
        .catch((e) => { throw e.code === '23505' ? httpError(409, 'Another staff account uses this mobile number') : e; });
      if (!rows[0]) throw httpError(404, 'Staff member not found');
      const { rows: [{ n }] } = await db.query(`SELECT count(*)::int AS n FROM staff WHERE role = 'owner' AND active`);
      if (!n) throw httpError(400, 'At least one active owner is required');
      if (!active) await db.query(`UPDATE orders SET assigned_employee_id = NULL, delivery_agent_name = NULL WHERE assigned_employee_id = $1 AND status NOT IN ('delivered','cancelled')`, [id]);
      await audit(db, req.staff.id, 'update', 'staff', id, { ...s, active });
      return rows[0];
    });
    res.json(row);
  }));
  r.post('/staff/:id/password', owner, wrap(async (req, res) => {
    const pw = req.body?.password;
    if (typeof pw !== 'string' || pw.length < 8 || pw.length > 128) throw httpError(400, 'Password must be at least 8 characters');
    const { rowCount } = await query('UPDATE staff SET password_hash = $2 WHERE id = $1', [Number(req.params.id), await hashPassword(pw)]);
    if (!rowCount) throw httpError(404, 'Staff member not found');
    await audit({ query }, req.staff.id, 'reset_password', 'staff', req.params.id);
    res.json({ ok: true });
  }));
  r.get('/staff/:id/history', manager, wrap(async (req, res) => {
    const id = Number(req.params.id);
    const [deliveries, activity] = await Promise.all([
      query(`SELECT order_number, status, payment_method, total_paise, cod_collected_paise, picked_up_at, delivered_at, contact_name
               FROM orders WHERE assigned_employee_id = $1 OR delivered_by = $1 ORDER BY created_at DESC LIMIT 200`, [id]),
      query('SELECT action, entity, entity_id, details, created_at FROM audit_log WHERE staff_id = $1 ORDER BY id DESC LIMIT 200', [id]),
    ]);
    res.json({ deliveries: deliveries.rows, activity: req.staff.role === 'owner' ? activity.rows : [] });
  }));

  // ---------- offers + promotional notifications (owner) ----------
  r.get('/offers', owner, wrap(async (_req, res) => res.json((await query('SELECT * FROM offers ORDER BY sort_order, id')).rows)));
  const offerBody = (b) => {
    const starts = b.startsAt ? new Date(b.startsAt) : null;
    const ends = b.endsAt ? new Date(b.endsAt) : null;
    if ((starts && isNaN(starts)) || (ends && isNaN(ends))) throw httpError(400, 'Offer dates are not valid');
    if (starts && ends && starts >= ends) throw httpError(400, 'Offer end must be after its start');
    const link = v.str(b.link, 'Link', { max: 200 });
    if (link && !link.startsWith('/')) throw httpError(400, 'Link must be a page in the shop, e.g. /category/earrings');
    return [['festival', 'new_collection', 'special'].includes(b.kind) ? b.kind : 'special', v.str(b.title, 'Title', { min: 2, max: 80 }),
      v.str(b.subtitle, 'Subtitle', { max: 160 }), v.str(b.cta, 'Button text', { max: 30 }), link, b.imageUrl ? mediaUrl(b.imageUrl, 'Banner image') : null,
      starts, ends, b.active !== false, int(b.sortOrder ?? 0, 'Order', { max: 1000 })];
  };
  r.post('/offers', owner, wrap(async (req, res) => {
    const { rows } = await query(`INSERT INTO offers (kind, title, subtitle, cta, link, image_url, starts_at, ends_at, active, sort_order)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) RETURNING *`, offerBody(req.body || {}));
    await audit({ query }, req.staff.id, 'create', 'offer', rows[0].id, { title: rows[0].title });
    res.status(201).json(rows[0]);
  }));
  r.put('/offers/:id', owner, wrap(async (req, res) => {
    const { rows } = await query(`UPDATE offers SET kind=$1, title=$2, subtitle=$3, cta=$4, link=$5, image_url=$6, starts_at=$7, ends_at=$8, active=$9, sort_order=$10
      WHERE id=$11 RETURNING *`, [...offerBody(req.body || {}), Number(req.params.id)]);
    if (!rows[0]) throw httpError(404, 'Offer not found');
    await audit({ query }, req.staff.id, 'update', 'offer', rows[0].id, { title: rows[0].title, active: rows[0].active });
    res.json(rows[0]);
  }));
  r.delete('/offers/:id', owner, wrap(async (req, res) => {
    await query('DELETE FROM offers WHERE id = $1', [Number(req.params.id)]);
    await audit({ query }, req.staff.id, 'delete', 'offer', req.params.id);
    res.json({ ok: true });
  }));
  r.post('/products/tags', manager, wrap(async (req, res) => {
    const tag = req.body?.tag;
    if (!TAGS.includes(tag)) throw httpError(400, 'Unknown promotion tag');
    const ids = Array.isArray(req.body?.productIds) ? req.body.productIds.map(Number).filter(Number.isInteger) : [];
    await query(req.body?.on === false ? 'UPDATE products SET tags = array_remove(tags, $1) WHERE id = ANY($2)' : 'UPDATE products SET tags = array_append(array_remove(tags, $1), $1) WHERE id = ANY($2)', [tag, ids]);
    await audit({ query }, req.staff.id, 'tag', 'product', null, { tag, on: req.body?.on !== false, ids });
    res.json({ ok: true });
  }));

  // Broadcast goes through the customer notification table; consent is enforced where it is read/pushed.
  r.post('/notifications/broadcast', owner, wrap(async (req, res) => {
    const type = ['promo', 'new_arrivals', 'festival'].includes(req.body?.type) ? req.body.type : 'promo';
    const link = v.str(req.body?.link, 'Link', { max: 200 });
    if (link && !link.startsWith('/')) throw httpError(400, 'Link must be a page in the shop, e.g. /collection/new');
    const { rows } = await query(`INSERT INTO notifications (customer_id, type, title, body, link) VALUES (NULL, $1, $2, $3, nullif($4, '')) RETURNING *`,
      [type === 'promo' ? 'promo' : type, v.str(req.body?.title, 'Title', { min: 3, max: 80 }), v.str(req.body?.body, 'Message', { max: 200 }), link]);
    const { rows: [{ n }] } = await query('SELECT count(*)::int AS n FROM customers WHERE marketing_opt_in');
    await audit({ query }, req.staff.id, 'broadcast', 'notification', rows[0].id, { title: rows[0].title, recipients: n });
    res.status(201).json({ ...rows[0], recipients: n });
  }));
  r.get('/notifications/broadcasts', owner, wrap(async (_req, res) => {
    res.json((await query('SELECT * FROM notifications WHERE customer_id IS NULL ORDER BY id DESC LIMIT 100')).rows);
  }));

  r.get('/audit', owner, wrap(async (req, res) => {
    const page = Math.max(1, parseInt(req.query.page) || 1);
    const { rows } = await query(
      `SELECT a.*, s.name AS staff_name, s.role AS staff_role FROM audit_log a LEFT JOIN staff s ON s.id = a.staff_id
        ${req.query.entity ? 'WHERE a.entity = $1' : ''} ORDER BY a.id DESC LIMIT 100 OFFSET ${(page - 1) * 100}`, req.query.entity ? [String(req.query.entity)] : []);
    res.json(rows);
  }));

  return r;
}

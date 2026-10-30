// Pure price maths in integer paise. The server is the only place totals are decided.

export function computeTotals(lines, settings, paymentMethod) {
  const subtotal = lines.reduce((s, l) => s + l.unit_original_paise * l.quantity, 0);
  const selling = lines.reduce((s, l) => s + l.unit_price_paise * l.quantity, 0);
  const productDiscount = subtotal - selling;
  const delivery =
    lines.length === 0 || (settings.free_delivery_min_paise > 0 && selling >= settings.free_delivery_min_paise)
      ? 0
      : settings.delivery_charge_paise;
  const pct = paymentMethod === 'upi' ? upiDiscountPercent(settings, selling) : 0;
  const cap = settings.upi_discount_max_paise || Infinity;
  const upiDiscount = Math.min(Math.round((selling * pct) / 100), cap);
  return {
    subtotalPaise: subtotal,
    productDiscountPaise: productDiscount,
    upiDiscountPercent: pct,
    upiDiscountPaise: upiDiscount,
    deliveryChargePaise: delivery,
    totalPaise: selling - upiDiscount + delivery,
  };
}

// The prepaid UPI discount % that applies right now to a cart worth `selling` paise (0 when off).
export function upiDiscountPercent(settings, selling, now = new Date()) {
  if (settings.upi_discount_enabled === false) return 0;
  if (selling < (settings.upi_discount_min_order_paise || 0)) return 0;
  if (settings.upi_discount_starts_at && now < new Date(settings.upi_discount_starts_at)) return 0;
  if (settings.upi_discount_ends_at && now > new Date(settings.upi_discount_ends_at)) return 0;
  return Number(settings.upi_discount_percent);
}

// What customers may see and buy: active, not archived, and demo items only while the owner shows them.
export const VISIBLE = `(p.active AND p.archived_at IS NULL AND (NOT p.is_demo OR (SELECT show_demo_products FROM store_settings WHERE id = 1)))`;

// Loads current prices + stock for the requested items. `db` is the pool or a tx client;
// pass lock=true inside the order transaction so stock can't be sold twice.
export async function priceItems(db, items, { lock = false } = {}) {
  const qty = new Map();
  for (const it of items) {
    const id = Number(it.productId);
    const q = Number(it.quantity);
    if (!Number.isInteger(id) || !Number.isInteger(q) || q < 1 || q > 50) throw httpError(400, 'Invalid cart item');
    qty.set(id, (qty.get(id) || 0) + q);
  }
  if (qty.size === 0) return { lines: [], problems: [] };
  const { rows } = await db.query(
    `SELECT id, sku, slug, name, images, stock, ${VISIBLE} AS active, original_price_paise, selling_price_paise
       FROM products p WHERE id = ANY($1) ORDER BY id ${lock ? 'FOR UPDATE OF p' : ''}`,
    [[...qty.keys()]],
  );
  const byId = new Map(rows.map((r) => [r.id, r]));
  const lines = [];
  const problems = [];
  for (const [id, quantity] of qty) {
    const p = byId.get(id);
    if (!p || !p.active) {
      problems.push({ productId: id, issue: 'unavailable', available: 0 });
      continue;
    }
    if (p.stock < quantity) problems.push({ productId: id, issue: p.stock === 0 ? 'out_of_stock' : 'insufficient_stock', available: p.stock });
    lines.push({
      product_id: p.id,
      sku: p.sku,
      slug: p.slug,
      name: p.name,
      image_url: p.images[0] || null,
      stock: p.stock,
      unit_original_paise: Math.max(p.original_price_paise, p.selling_price_paise),
      unit_price_paise: p.selling_price_paise,
      quantity,
    });
  }
  return { lines, problems };
}

export function httpError(status, message, extra) {
  return Object.assign(new Error(message), { status, ...extra });
}

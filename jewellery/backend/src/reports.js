import { query } from './db.js';

// Business days are Indian Standard Time days, not UTC.
const DAY = `(o.created_at AT TIME ZONE 'Asia/Kolkata')::date`;
const IN_RANGE = `${DAY} BETWEEN $1::date AND $2::date`;

// Money actually received: verified UPI, or cash an employee recorded. Unverified UPI never counts.
const COLLECTED = `CASE WHEN o.payment_method = 'upi' AND o.payment_status = 'verified' THEN o.total_paise
                        WHEN o.payment_method = 'cod' THEN COALESCE(o.cod_collected_paise, 0) ELSE 0 END`;

const SALES_COLS = `count(*) FILTER (WHERE o.status <> 'cancelled')::int AS orders,
  COALESCE(sum(o.subtotal_paise) FILTER (WHERE o.status <> 'cancelled'), 0)::bigint AS gross_paise,
  COALESCE(sum(o.product_discount_paise) FILTER (WHERE o.status <> 'cancelled'), 0)::bigint AS product_discount_paise,
  COALESCE(sum(o.upi_discount_paise) FILTER (WHERE o.status <> 'cancelled'), 0)::bigint AS upi_discount_paise,
  COALESCE(sum(o.delivery_charge_paise) FILTER (WHERE o.status <> 'cancelled'), 0)::bigint AS delivery_paise,
  COALESCE(sum(o.total_paise) FILTER (WHERE o.status <> 'cancelled'), 0)::bigint AS net_paise,
  COALESCE(sum(${COLLECTED}), 0)::bigint AS collected_paise`;

const num = (row) => Object.fromEntries(Object.entries(row).map(([k, v]) => [k, typeof v === 'string' && /_paise$/.test(k) ? Number(v) : v]));

async function series(unit, from, to) {
  const { rows } = await query(
    `WITH periods AS (SELECT generate_series(date_trunc('${unit}', $1::date), date_trunc('${unit}', $2::date), interval '1 ${unit}')::date AS period)
     SELECT to_char(p.period, 'YYYY-MM-DD') AS period, ${SALES_COLS}
       FROM periods p LEFT JOIN orders o ON date_trunc('${unit}', ${DAY})::date = p.period
      GROUP BY p.period ORDER BY p.period`, [from, to]);
  return rows.map(num);
}

export async function dashboard({ from, to }) {
  const today = new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' });
  const [summary, headline, customers, lowStock, daily, weekly, monthly, best, categories] = await Promise.all([
    query(
      `SELECT ${SALES_COLS},
              count(*)::int AS all_orders,
              ${['new', 'confirmed', 'preparing', 'ready_for_delivery', 'out_for_delivery', 'delivered', 'cancelled'].map((s) => `count(*) FILTER (WHERE o.status = '${s}')::int AS status_${s}`).join(', ')},
              count(*) FILTER (WHERE o.status NOT IN ('delivered','cancelled'))::int AS pending_orders,
              count(*) FILTER (WHERE o.payment_method = 'upi' AND o.status <> 'cancelled')::int AS upi_orders,
              count(*) FILTER (WHERE o.payment_method = 'cod' AND o.status <> 'cancelled')::int AS cod_orders,
              count(*) FILTER (WHERE o.payment_method = 'upi' AND o.payment_status = 'verified')::int AS upi_verified,
              COALESCE(sum(o.total_paise) FILTER (WHERE o.payment_method = 'upi' AND o.payment_status = 'verified'), 0)::bigint AS upi_collected_paise,
              COALESCE(sum(o.cod_collected_paise) FILTER (WHERE o.payment_method = 'cod'), 0)::bigint AS cod_collected_paise,
              COALESCE(sum(o.total_paise) FILTER (WHERE o.payment_method = 'cod' AND o.cod_collected_at IS NULL AND o.status <> 'cancelled'), 0)::bigint AS pending_cod_paise,
              count(*) FILTER (WHERE o.payment_method = 'cod' AND o.cod_collected_at IS NULL AND o.status <> 'cancelled')::int AS pending_cod_orders,
              COALESCE(sum(o.total_paise) FILTER (WHERE o.payment_method = 'upi' AND o.payment_status IN ('pending','verification_pending') AND o.status <> 'cancelled'), 0)::bigint AS pending_upi_paise,
              count(*) FILTER (WHERE o.payment_method = 'upi' AND o.payment_status = 'verification_pending' AND o.status <> 'cancelled')::int AS upi_verification_pending
         FROM orders o WHERE ${IN_RANGE}`, [from, to]),
    query(
      `SELECT COALESCE(sum(total_paise) FILTER (WHERE status <> 'cancelled'), 0)::bigint AS total_sales_paise,
              COALESCE(sum(total_paise) FILTER (WHERE status <> 'cancelled' AND ${DAY} = $1::date), 0)::bigint AS today_sales_paise,
              COALESCE(sum(total_paise) FILTER (WHERE status <> 'cancelled' AND date_trunc('month', ${DAY}) = date_trunc('month', $1::date)), 0)::bigint AS month_sales_paise,
              count(*)::int AS total_orders,
              count(*) FILTER (WHERE ${DAY} = $1::date)::int AS today_orders
         FROM orders o`, [today]),
    query(`SELECT count(*)::int AS total,
                  (SELECT count(*) FROM (SELECT customer_id FROM orders WHERE customer_id IS NOT NULL AND status <> 'cancelled' GROUP BY customer_id HAVING count(*) >= 2) x)::int AS repeat
             FROM customers`),
    query(`SELECT id, sku, name, stock FROM products WHERE active AND archived_at IS NULL AND stock <= (SELECT low_stock_threshold FROM store_settings WHERE id = 1) ORDER BY stock, name LIMIT 20`),
    series('day', from, to),
    series('week', new Date(Date.parse(to) - 11 * 7 * 864e5).toISOString().slice(0, 10), to),
    series('month', new Date(Date.parse(to) - 335 * 864e5).toISOString().slice(0, 10), to),
    query(
      `SELECT i.sku, i.name, sum(i.quantity)::int AS quantity, sum(i.quantity * i.unit_price_paise)::bigint AS revenue_paise
         FROM order_items i JOIN orders o ON o.id = i.order_id WHERE o.status <> 'cancelled' AND ${IN_RANGE}
        GROUP BY i.sku, i.name ORDER BY quantity DESC, revenue_paise DESC LIMIT 10`, [from, to]),
    query(
      `SELECT COALESCE(c.name, 'Uncategorised') AS category, sum(i.quantity)::int AS quantity, sum(i.quantity * i.unit_price_paise)::bigint AS revenue_paise
         FROM order_items i JOIN orders o ON o.id = i.order_id LEFT JOIN products p ON p.id = i.product_id LEFT JOIN categories c ON c.id = p.category_id
        WHERE o.status <> 'cancelled' AND ${IN_RANGE} GROUP BY 1 ORDER BY revenue_paise DESC`, [from, to]),
  ]);
  return {
    range: { from, to },
    summary: num(summary.rows[0]),
    headline: num(headline.rows[0]),
    customers: customers.rows[0],
    lowStock: lowStock.rows,
    daily,
    weekly,
    monthly,
    bestSellers: best.rows.map(num),
    categories: categories.rows.map(num),
  };
}

const rupee = (p) => (p == null ? null : Number(p) / 100);
const salesReport = (unit) => async ({ from, to }) => (await series(unit, from, to)).map((r) => ({
  period: r.period, orders: r.orders, gross: rupee(r.gross_paise), product_discount: rupee(r.product_discount_paise), upi_discount: rupee(r.upi_discount_paise),
  delivery: rupee(r.delivery_paise), net_order_value: rupee(r.net_paise), collected: rupee(r.collected_paise),
}));

// type -> { roles, run }. Amounts are rupees so the CSV opens cleanly in a spreadsheet.
export const reports = {
  'daily-sales': { roles: ['owner'], run: salesReport('day') },
  'weekly-sales': { roles: ['owner'], run: salesReport('week') },
  'monthly-sales': { roles: ['owner'], run: salesReport('month') },
  'upi-collection': {
    roles: ['owner'],
    run: async ({ from, to }) => (await query(
      `SELECT o.order_number, o.created_at, o.contact_name, o.total_paise, o.payment_status, o.payment_reference, o.bank_reference, s.name AS verified_by, o.payment_verified_at
         FROM orders o LEFT JOIN staff s ON s.id = o.payment_verified_by WHERE o.payment_method = 'upi' AND ${IN_RANGE} ORDER BY o.created_at`, [from, to]))
      .rows.map(({ total_paise, ...r }) => ({ ...r, amount: rupee(total_paise) })),
  },
  'cod-collection': {
    roles: ['owner'],
    run: async ({ from, to }) => (await query(
      `SELECT o.order_number, o.created_at, o.status, o.contact_name, o.total_paise, o.cod_collected_paise, o.cod_collected_at, s.name AS collected_by, e.name AS employee
         FROM orders o LEFT JOIN staff s ON s.id = o.cod_collected_by LEFT JOIN staff e ON e.id = o.assigned_employee_id
        WHERE o.payment_method = 'cod' AND ${IN_RANGE} ORDER BY o.created_at`, [from, to]))
      .rows.map(({ total_paise, cod_collected_paise, ...r }) => ({ ...r, expected: rupee(total_paise), collected: rupee(cod_collected_paise) })),
  },
  'upi-discount': {
    roles: ['owner'],
    run: async ({ from, to }) => (await query(
      `SELECT o.order_number, o.created_at, o.status, o.subtotal_paise - o.product_discount_paise AS product_total_paise, o.upi_discount_percent, o.upi_discount_paise, o.total_paise
         FROM orders o WHERE o.payment_method = 'upi' AND ${IN_RANGE} ORDER BY o.created_at`, [from, to]))
      .rows.map((r) => ({ order_number: r.order_number, created_at: r.created_at, status: r.status, product_total: rupee(r.product_total_paise), discount_percent: r.upi_discount_percent, discount: rupee(r.upi_discount_paise), paid: rupee(r.total_paise) })),
  },
  'product-sales': {
    roles: ['owner'],
    run: async ({ from, to }) => (await query(
      `SELECT i.sku, i.name, sum(i.quantity)::int AS quantity, sum(i.quantity * i.unit_price_paise)::bigint AS revenue_paise
         FROM order_items i JOIN orders o ON o.id = i.order_id WHERE o.status <> 'cancelled' AND ${IN_RANGE} GROUP BY i.sku, i.name ORDER BY quantity DESC`, [from, to]))
      .rows.map(({ revenue_paise, ...r }) => ({ ...r, revenue: rupee(revenue_paise) })),
  },
  inventory: {
    roles: ['owner', 'admin'],
    run: async () => (await query(
      `SELECT p.sku, p.name, c.name AS category, p.stock, p.active, p.is_demo, p.archived_at IS NOT NULL AS archived,
              p.stock <= s.low_stock_threshold AS low_stock, p.selling_price_paise, p.stock * p.selling_price_paise AS stock_value_paise
         FROM products p LEFT JOIN categories c ON c.id = p.category_id, store_settings s ORDER BY p.stock, p.name`))
      .rows.map(({ selling_price_paise, stock_value_paise, ...r }) => ({ ...r, selling_price: rupee(selling_price_paise), stock_value: rupee(stock_value_paise) })),
  },
  'employee-delivery': {
    roles: ['owner'],
    run: async ({ from, to }) => (await query(
      `SELECT s.name AS employee, s.mobile, count(o.id)::int AS assigned,
              count(o.id) FILTER (WHERE o.status = 'delivered')::int AS delivered,
              COALESCE(sum(o.cod_collected_paise) FILTER (WHERE o.cod_collected_by = s.id), 0)::bigint AS cod_collected_paise
         FROM staff s LEFT JOIN orders o ON o.assigned_employee_id = s.id AND ${IN_RANGE}
        WHERE s.role = 'employee' GROUP BY s.id ORDER BY delivered DESC`, [from, to]))
      .rows.map(({ cod_collected_paise, ...r }) => ({ ...r, cod_collected: rupee(cod_collected_paise) })),
  },
  replacements: {
    roles: ['owner', 'admin'],
    run: async ({ from, to }) => (await query(
      `SELECT r.id, o.order_number, i.sku, i.name AS product, r.issue, r.status, r.admin_note, r.created_at, r.updated_at
         FROM replacement_requests r JOIN orders o ON o.id = r.order_id JOIN order_items i ON i.id = r.order_item_id
        WHERE (r.created_at AT TIME ZONE 'Asia/Kolkata')::date BETWEEN $1::date AND $2::date ORDER BY r.created_at`, [from, to])).rows,
  },
};

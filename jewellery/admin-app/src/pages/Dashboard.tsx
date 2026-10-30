import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Bars, Columns, SERIES } from '../components/Charts';
import { Card, DateRange, ErrorBox, Loading, PageHeader, PRESETS, Stat, type Range } from '../components/ui';
import { api } from '../lib/api';
import { ORDER_STATUS, rupees } from '../lib/format';
import { useLoad, useSession } from '../lib/session';

type SalesRow = { period: string; orders: number; net_paise: number; collected_paise: number };
type Dash = {
  summary: Record<string, number>;
  headline: Record<string, number>;
  customers: { total: number; repeat: number };
  lowStock: { id: number; sku: string; name: string; stock: number }[];
  daily: SalesRow[];
  weekly: SalesRow[];
  monthly: SalesRow[];
  bestSellers: { sku: string; name: string; quantity: number; revenue_paise: number }[];
  categories: { category: string; quantity: number; revenue_paise: number }[];
};

const label = (iso: string, unit: 'day' | 'week' | 'month') =>
  new Date(iso + 'T00:00:00').toLocaleDateString('en-IN', unit === 'month' ? { month: 'short', year: '2-digit' } : { day: 'numeric', month: 'short' });

function Setup() {
  const { data } = useLoad(() => Promise.all([api<any>('/admin/demo'), api<any>('/admin/settings')]), [], false);
  if (!data) return null;
  const [demo, s] = data;
  const todo = [
    demo.upiIsPlaceholder && ['Replace the demo UPI ID with your real merchant UPI ID', '/settings?tab=payments'],
    s.upi_payee_name === 'Demo Jewellery Store' && ['Set your real merchant display name', '/settings?tab=payments'],
    demo.demo_products > 0 && [`${demo.demo_products} demo products are in the catalogue`, '/demo-data'],
    !s.logo_url && ['Upload your store logo', '/settings?tab=branding'],
    !s.app_icon_url && ['Upload a square app icon', '/settings?tab=branding'],
  ].filter(Boolean) as [string, string][];
  if (!todo.length) return null;
  return (
    <div className="mb-5 rounded-xl border border-warn/30 bg-warn/5 p-4">
      <p className="text-[13px] font-semibold text-warn">Finish setting up your store</p>
      <ul className="mt-2 space-y-1 text-[13px]">
        {todo.map(([t, to]) => <li key={t}>• <Link to={to} className="underline underline-offset-2">{t}</Link></li>)}
      </ul>
    </div>
  );
}

export default function Dashboard() {
  const { alerts } = useSession();
  const [range, setRange] = useState<Range>(PRESETS[3][1]());
  const { data: d, error, loading, reload } = useLoad(() => api<Dash>(`/admin/dashboard?from=${range.from}&to=${range.to}`), [range.from, range.to]);

  return (
    <div>
      <PageHeader title="Dashboard" subtitle="Sales are order values excluding cancelled orders. Money collected counts only verified UPI and recorded cash." />
      <Setup />
      <div className="mb-5"><DateRange value={range} onChange={setRange} /></div>
      {error && <ErrorBox message={error} onRetry={reload} />}
      {loading && !d && <Loading />}
      {d && (
        <div className="space-y-5">
          <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
            <Stat label="Total sales (all time)" value={rupees(d.headline.total_sales_paise)} hint={`${d.headline.total_orders} orders`} />
            <Stat label="Today's sales" value={rupees(d.headline.today_sales_paise)} hint={`${d.headline.today_orders} orders today`} />
            <Stat label="This month" value={rupees(d.headline.month_sales_paise)} />
            <Stat label="Customers" value={d.customers.total} hint={`${d.customers.repeat} repeat customers`} />
          </div>

          <Card title={`Money · ${range.from === range.to ? range.from : `${range.from} → ${range.to}`}`}>
            <div className="grid gap-x-8 gap-y-2 text-[13.5px] md:grid-cols-2">
              <dl className="space-y-2">
                {[['Gross sales (MRP)', d.summary.gross_paise], ['Product discounts', -d.summary.product_discount_paise], ['UPI discounts given', -d.summary.upi_discount_paise], ['Delivery charges', d.summary.delivery_paise]].map(([l, v]) => (
                  <div key={l as string} className="flex justify-between"><dt className="text-muted">{l}</dt><dd className="tabular-nums">{(v as number) < 0 ? `− ${rupees(-(v as number))}` : rupees(v as number)}</dd></div>
                ))}
                <div className="flex justify-between border-t border-line pt-2 font-semibold"><dt>Net order value</dt><dd className="tabular-nums">{rupees(d.summary.net_paise)}</dd></div>
              </dl>
              <dl className="space-y-2">
                <div className="flex justify-between font-semibold text-good"><dt>Actual money collected</dt><dd className="tabular-nums">{rupees(d.summary.collected_paise)}</dd></div>
                <div className="flex justify-between"><dt className="text-muted">· UPI verified ({d.summary.upi_verified})</dt><dd className="tabular-nums">{rupees(d.summary.upi_collected_paise)}</dd></div>
                <div className="flex justify-between"><dt className="text-muted">· Cash collected</dt><dd className="tabular-nums">{rupees(d.summary.cod_collected_paise)}</dd></div>
                <div className="flex justify-between text-warn"><dt>Pending COD collection ({d.summary.pending_cod_orders})</dt><dd className="tabular-nums">{rupees(d.summary.pending_cod_paise)}</dd></div>
                <div className="flex justify-between text-warn"><dt><Link to="/payments" className="underline underline-offset-2">Pending UPI verification ({d.summary.upi_verification_pending})</Link></dt><dd className="tabular-nums">{rupees(d.summary.pending_upi_paise)}</dd></div>
              </dl>
            </div>
          </Card>

          <div className="grid grid-cols-2 gap-3 md:grid-cols-4 xl:grid-cols-6">
            <Stat label="Orders" value={d.summary.all_orders} />
            <Stat label="Pending" value={d.summary.pending_orders} tone={d.summary.pending_orders ? 'warn' : undefined} />
            <Stat label="Confirmed" value={d.summary.status_confirmed} />
            <Stat label="Delivered" value={d.summary.status_delivered} tone="good" />
            <Stat label="Cancelled" value={d.summary.status_cancelled} tone={d.summary.status_cancelled ? 'bad' : undefined} />
            <Stat label="Low stock" value={alerts.low_stock ?? d.lowStock.length} tone={d.lowStock.length ? 'warn' : undefined} hint={<Link to="/inventory" className="underline">View</Link>} />
          </div>

          <div className="grid gap-5 lg:grid-cols-2">
            <Card title="Daily sales"><Columns title="Daily net sales" points={d.daily.map((r) => ({ label: label(r.period, 'day'), value: r.net_paise, detail: `${r.orders} orders` }))} /></Card>
            <Card title="Weekly sales (12 weeks)"><Columns title="Weekly net sales" points={d.weekly.map((r) => ({ label: label(r.period, 'week'), value: r.net_paise, detail: `${r.orders} orders` }))} /></Card>
            <Card title="Monthly sales (12 months)"><Columns title="Monthly net sales" points={d.monthly.map((r) => ({ label: label(r.period, 'month'), value: r.net_paise, detail: `${r.orders} orders` }))} /></Card>
            <Card title="Order statistics">
              <Bars rows={Object.keys(ORDER_STATUS).map((s) => ({ label: ORDER_STATUS[s], value: d.summary[`status_${s}`], display: String(d.summary[`status_${s}`]) }))} />
            </Card>
            <Card title="Payment statistics">
              <Bars rows={[
                { label: `UPI orders`, value: d.summary.upi_orders, display: `${d.summary.upi_orders} · ${d.summary.upi_verified} verified`, color: SERIES.blue },
                { label: `COD orders`, value: d.summary.cod_orders, display: `${d.summary.cod_orders} · ${d.summary.pending_cod_orders} cash pending`, color: SERIES.gold },
              ]} />
              <p className="mt-3 text-[12px] text-muted">UPI discounts given: <b className="text-ink">{rupees(d.summary.upi_discount_paise)}</b></p>
            </Card>
            <Card title="Best selling products">
              <Bars rows={d.bestSellers.map((b) => ({ label: b.name, value: b.quantity, display: `${b.quantity} sold · ${rupees(b.revenue_paise)}` }))} />
            </Card>
            <Card title="Category performance">
              <Bars rows={d.categories.map((c) => ({ label: c.category, value: Number(c.revenue_paise), display: `${rupees(c.revenue_paise)} · ${c.quantity} pcs` }))} />
            </Card>
            <Card title="Low stock products" actions={<Link to="/inventory" className="text-[12px] underline">Inventory</Link>}>
              {d.lowStock.length ? (
                <ul className="divide-y divide-line text-[13px]">
                  {d.lowStock.map((p) => <li key={p.id} className="flex justify-between py-1.5"><Link to={`/products/${p.id}`} className="hover:underline">{p.name} <span className="text-muted">· {p.sku}</span></Link><span className={p.stock === 0 ? 'font-semibold text-bad' : 'text-warn'}>{p.stock} left</span></li>)}
                </ul>
              ) : <p className="text-[13px] text-muted">All products are above the low stock level.</p>}
            </Card>
          </div>
        </div>
      )}
    </div>
  );
}

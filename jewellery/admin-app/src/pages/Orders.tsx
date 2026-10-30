import { useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { Badge, Card, Empty, ErrorBox, Loading, orderTone, PageHeader, paymentTone, Table } from '../components/ui';
import { api } from '../lib/api';
import { dateTime, ORDER_STATUS, PAYMENT_STATUS, rupees } from '../lib/format';
import { useLoad } from '../lib/session';

export type OrderRow = {
  order_number: string; status: string; payment_method: 'upi' | 'cod'; payment_status: string; payment_reference: string | null; bank_reference: string | null;
  total_paise: number; contact_name: string; contact_mobile: string; shipping_address: { area: string; city: string; pincode: string; house: string; street: string; landmark: string };
  created_at: string; employee_name: string | null; item_count: number; cod_collected_paise: number | null; cod_collected_at: string | null; picked_up_at: string | null; delivered_at: string | null;
};

export function OrderTable({ rows, show = 'all' }: { rows: OrderRow[]; show?: 'all' | 'payment' | 'cod' }) {
  return (
    <Table>
      <thead><tr><th>Order</th><th>Customer</th><th>Items</th><th className="text-right">Amount</th><th>Status</th><th>Payment</th>{show === 'payment' && <th>Customer ref</th>}{show === 'cod' && <th>Collected</th>}<th>Delivery</th></tr></thead>
      <tbody>
        {rows.map((o) => (
          <tr key={o.order_number} className="hover:bg-gold-soft/40">
            <td><Link to={`/orders/${o.order_number}`} className="font-medium text-gold-dark hover:underline">#{o.order_number}</Link><span className="block text-[11px] text-muted">{dateTime(o.created_at)}</span></td>
            <td>{o.contact_name}<span className="block text-[11px] text-muted">{o.contact_mobile} · {o.shipping_address.city}</span></td>
            <td className="tabular-nums">{o.item_count}</td>
            <td className="text-right font-medium tabular-nums">{rupees(o.total_paise)}</td>
            <td><Badge tone={orderTone(o.status)}>{ORDER_STATUS[o.status]}</Badge></td>
            <td><Badge tone={paymentTone(o.payment_status)}>{o.payment_method.toUpperCase()} · {PAYMENT_STATUS[o.payment_status]}</Badge></td>
            {show === 'payment' && <td className="font-mono text-[12px]">{o.payment_reference || '—'}</td>}
            {show === 'cod' && <td className="tabular-nums">{o.cod_collected_at ? rupees(o.cod_collected_paise) : <span className="text-warn">Not yet</span>}</td>}
            <td className="text-[12px]">{o.employee_name || <span className="text-muted">Unassigned</span>}</td>
          </tr>
        ))}
      </tbody>
    </Table>
  );
}

export default function Orders() {
  const [params, setParams] = useSearchParams();
  const [q, setQ] = useState(params.get('q') || '');
  const qs = params.toString();
  const { data, error, loading, reload } = useLoad(() => api<{ items: OrderRow[]; total: number }>(`/admin/orders?${qs}`), [qs]);
  const set = (k: string, v: string) => { const n = new URLSearchParams(params); if (v) n.set(k, v); else n.delete(k); if (k !== 'page') n.delete('page'); setParams(n, { replace: true }); };
  const page = Number(params.get('page') || 1);
  return (
    <div>
      <PageHeader title="Orders" subtitle="Every order placed in the customer app, live." />
      <Card>
        <div className="mb-4 grid gap-2 sm:grid-cols-2 lg:grid-cols-[2fr_1fr_1fr_1fr_1fr_1fr]">
          <form onSubmit={(e) => { e.preventDefault(); set('q', q.trim()); }}><input type="search" placeholder="Order no., name, mobile, UPI ref" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Search orders" /></form>
          <select aria-label="Status" value={params.get('status') || ''} onChange={(e) => set('status', e.target.value)}>
            <option value="">All statuses</option><option value="open">Open (not delivered)</option>
            {Object.entries(ORDER_STATUS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
          </select>
          <select aria-label="Payment method" value={params.get('method') || ''} onChange={(e) => set('method', e.target.value)}>
            <option value="">UPI + COD</option><option value="upi">UPI</option><option value="cod">COD</option>
          </select>
          <select aria-label="Payment status" value={params.get('payment') || ''} onChange={(e) => set('payment', e.target.value)}>
            <option value="">Any payment</option>{Object.entries(PAYMENT_STATUS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
          </select>
          <input type="date" aria-label="From date" value={params.get('from') || ''} onChange={(e) => set('from', e.target.value)} />
          <input type="date" aria-label="To date" value={params.get('to') || ''} onChange={(e) => set('to', e.target.value)} />
        </div>
        {error && <ErrorBox message={error} onRetry={reload} />}
        {loading && !data ? <Loading /> : data && !data.items.length ? <Empty icon="bag" title="No orders match" /> : data && <OrderTable rows={data.items} />}
        {data && data.total > 50 && (
          <div className="mt-4 flex items-center justify-between text-[13px]">
            <span className="text-muted">{data.total} orders</span>
            <span className="flex gap-2">
              <button className="btn-ghost" disabled={page <= 1} onClick={() => set('page', String(page - 1))}>Previous</button>
              <button className="btn-ghost" disabled={page * 50 >= data.total} onClick={() => set('page', String(page + 1))}>Next</button>
            </span>
          </div>
        )}
      </Card>
    </div>
  );
}

import { Link } from 'react-router-dom';
import { Icon } from '../components/Icon';
import { Badge, Empty, ErrorBox, Loading, orderTone, PageHeader } from '../components/ui';
import { api } from '../lib/api';
import { dateTime, ORDER_STATUS, rupees } from '../lib/format';
import { useLoad } from '../lib/session';
import type { OrderRow } from './Orders';

// Employee home: big tap targets, address and amount first. No delivery OTP by design.
export default function Deliveries() {
  const { data, error, loading, reload } = useLoad(() => api<OrderRow[]>('/admin/my-orders'), []);
  const open = data?.filter((o) => !['delivered', 'cancelled'].includes(o.status)) || [];
  const done = data?.filter((o) => o.status === 'delivered') || [];
  const card = (o: OrderRow) => {
    const a = o.shipping_address;
    return (
      <li key={o.order_number}>
        <Link to={`/orders/${o.order_number}`} className="card block p-4 transition hover:border-gold">
          <div className="flex items-center justify-between gap-2">
            <span className="font-semibold">#{o.order_number}</span>
            <Badge tone={orderTone(o.status)}>{ORDER_STATUS[o.status]}</Badge>
          </div>
          <p className="mt-2 text-[15px] font-medium">{o.contact_name} · {o.contact_mobile}</p>
          <p className="text-muted">{[a.house, a.street, a.area, a.city, a.pincode].filter(Boolean).join(', ')}</p>
          {a.landmark && <p className="text-[12px] text-muted">Landmark: {a.landmark}</p>}
          <p className="mt-2 flex items-center justify-between text-[13px]">
            <span>{o.item_count} item(s) · {o.picked_up_at ? `picked up ${dateTime(o.picked_up_at)}` : 'not picked up'}</span>
            <span className={o.payment_method === 'cod' && !o.cod_collected_at ? 'font-semibold text-warn' : 'text-good'}>
              {o.payment_method === 'cod' ? (o.cod_collected_at ? `Cash collected ${rupees(o.cod_collected_paise)}` : `Collect ${rupees(o.total_paise)} cash`) : 'Prepaid UPI'}
            </span>
          </p>
        </Link>
      </li>
    );
  };
  return (
    <div>
      <PageHeader title="My Deliveries" subtitle="Orders assigned to you. Tap one to update it." actions={<button onClick={reload} className="btn-ghost"><Icon name="arrowDown" /> Refresh</button>} />
      {error && <ErrorBox message={error} onRetry={reload} />}
      {loading && !data && <Loading />}
      {data && !open.length && <Empty icon="truck" title="No deliveries assigned" body="New assignments appear here automatically." />}
      <ul className="grid gap-3 md:grid-cols-2">{open.map(card)}</ul>
      {done.length > 0 && <><h2 className="mb-2 mt-8 text-[13px] font-semibold uppercase tracking-wider text-muted">Delivered in the last 7 days</h2><ul className="grid gap-3 opacity-80 md:grid-cols-2">{done.map(card)}</ul></>}
    </div>
  );
}

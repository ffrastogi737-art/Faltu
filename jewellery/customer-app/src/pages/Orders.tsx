import { useEffect } from 'react';
import { Link } from 'react-router-dom';
import { Icon } from '../components/Icon';
import { PaymentBadge, StatusBadge } from '../components/OrderBits';
import { Empty, ErrorState, Img, PageHeader, Skeleton } from '../components/ui';
import { api } from '../lib/api';
import { date, rupees } from '../lib/format';
import { useLoad, useStore } from '../lib/store';
import type { OrderSummary } from '../lib/types';

export default function Orders() {
  const { customer, guestOrders } = useStore();
  const { data, error, loading, reload } = useLoad(() => (customer ? api<OrderSummary[]>('/orders') : Promise.resolve([])), [customer?.id]);
  useEffect(() => {
    window.addEventListener('order:update', reload);
    return () => window.removeEventListener('order:update', reload);
  }, [reload]);

  return (
    <div>
      <PageHeader title="My Orders" />
      {error && !data && <ErrorState message={error} onRetry={reload} />}
      {loading && !data && <div className="space-y-3 p-4">{[1, 2, 3].map((i) => <Skeleton key={i} className="h-28" />)}</div>}
      {data && data.length === 0 && guestOrders.length === 0 && (
        <Empty icon="bag" title="No orders yet" body={customer ? 'Your orders will appear here.' : 'Log in to see orders placed with your account.'}
          action={customer ? <Link to="/" className="btn-dark">Start shopping</Link> : <Link to="/login?next=/orders" className="btn-dark">Log in</Link>} />
      )}
      <ul className="space-y-3 p-4">
        {data?.map((o) => (
          <li key={o.orderNumber}>
            <Link to={`/orders/${o.orderNumber}`} className="card flex gap-4 p-4 transition hover:border-champagne">
              <div className="flex -space-x-6">
                {o.items.slice(0, 3).map((i, k) => <Img key={k} src={i.imageUrl} alt="" className="h-20 w-16 border-2 border-ivory" />)}
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex items-center justify-between gap-2"><p className="text-sm font-medium">#{o.orderNumber}</p><Icon name="chevron" className="text-muted" /></div>
                <p className="truncate text-xs text-muted">{o.items.map((i) => i.name).join(', ')}</p>
                <p className="mt-1 text-sm">{rupees(o.totalPaise)} · <span className="text-muted">{date(o.createdAt)}</span></p>
                <div className="mt-2 flex flex-wrap gap-1.5"><StatusBadge status={o.status} /><PaymentBadge method={o.paymentMethod} status={o.paymentStatus} /></div>
              </div>
            </Link>
          </li>
        ))}
      </ul>
      {guestOrders.length > 0 && (
        <section className="px-4 pb-6">
          <p className="label mb-2">Guest orders on this device</p>
          <ul className="divide-y divide-sand/70 border-y border-sand/70">
            {guestOrders.map((g) => (
              <li key={g.orderNumber}><Link to={`/orders/${g.orderNumber}`} className="flex items-center justify-between py-3 text-sm">#{g.orderNumber}<Icon name="chevron" className="text-muted" /></Link></li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}

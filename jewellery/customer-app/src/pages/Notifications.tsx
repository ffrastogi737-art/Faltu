import { useEffect } from 'react';
import { Link } from 'react-router-dom';
import { Icon } from '../components/Icon';
import { Empty, ErrorState, PageHeader, Skeleton } from '../components/ui';
import { api } from '../lib/api';
import { dateTime } from '../lib/format';
import { useLoad, useStore } from '../lib/store';
import type { AppNotification } from '../lib/types';

export default function Notifications() {
  const { customer, refreshUnread } = useStore();
  const { data, error, loading, reload } = useLoad(() => (customer ? api<{ items: AppNotification[] }>('/notifications') : Promise.resolve({ items: [] })), [customer?.id]);
  useEffect(() => {
    if (data?.items.some((n) => !n.read)) api('/notifications/read', { method: 'POST', body: {} }).then(refreshUnread).catch(() => {});
  }, [data, refreshUnread]);
  useEffect(() => {
    window.addEventListener('notification:new', reload);
    return () => window.removeEventListener('notification:new', reload);
  }, [reload]);

  if (!customer) return (<><PageHeader title="Notifications" /><Empty icon="bell" title="Stay in the loop" body="Log in to get updates on your orders and offers." action={<Link to="/login?next=/notifications" className="btn-dark">Log in</Link>} /></>);
  return (
    <div>
      <PageHeader title="Notifications" />
      {error && !data && <ErrorState message={error} onRetry={reload} />}
      {loading && !data && <div className="space-y-2 p-4">{[1, 2, 3].map((i) => <Skeleton key={i} className="h-16" />)}</div>}
      {data && !data.items.length && <Empty icon="bell" title="No notifications yet" />}
      <ul className="divide-y divide-sand/70">
        {data?.items.map((n) => {
          const body = (
            <div className={`flex gap-3 px-4 py-4 ${n.read ? '' : 'bg-champagne-light/30'}`}>
              <span className="mt-0.5 grid h-9 w-9 shrink-0 place-items-center rounded-full border border-champagne/50 text-champagne-dark">
                <Icon name={n.type === 'promo' ? 'spark' : n.type === 'replacement' ? 'shield' : n.type === 'payment' ? 'rupee' : 'truck'} />
              </span>
              <span className="flex-1"><span className="block text-sm font-medium">{n.title}</span><span className="block text-xs text-muted">{n.body}</span><span className="text-[11px] text-muted">{dateTime(n.created_at)}</span></span>
            </div>
          );
          return <li key={n.id}>{n.link ? <Link to={n.link}>{body}</Link> : body}</li>;
        })}
      </ul>
    </div>
  );
}

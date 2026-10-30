import { useState } from 'react';
import { Card, Empty, ErrorBox, Loading, PageHeader } from '../components/ui';
import { api } from '../lib/api';
import { useLoad } from '../lib/session';
import { OrderTable, type OrderRow } from './Orders';

const TABS = [
  ['verify', 'UPI awaiting verification', 'method=upi&payment=verification_pending', 'payment'],
  ['upi-pending', 'UPI not yet paid', 'method=upi&payment=pending&status=open', 'payment'],
  ['upi-all', 'All UPI orders', 'method=upi', 'payment'],
  ['cod-pending', 'COD cash pending', 'codPending=1', 'cod'],
  ['cod-all', 'All COD orders', 'method=cod', 'cod'],
] as const;

export default function Payments() {
  const [tab, setTab] = useState<(typeof TABS)[number][0]>('verify');
  const t = TABS.find((x) => x[0] === tab)!;
  const { data, error, loading, reload } = useLoad(() => api<{ items: OrderRow[]; total: number }>(`/admin/orders?${t[2]}`), [tab]);
  return (
    <div>
      <PageHeader title="Payments" subtitle="Open an order to verify a UPI credit or see cash collection. Never verify from a screenshot or because the customer returned from their UPI app — check your bank or UPI merchant account." />
      <div className="mb-4 flex flex-wrap gap-2" role="tablist">
        {TABS.map(([k, label]) => <button key={k} role="tab" aria-selected={tab === k} onClick={() => setTab(k)} className={`btn ${tab === k ? 'bg-ink text-paper' : 'border border-line bg-white hover:border-gold'}`}>{label}</button>)}
      </div>
      <Card>
        {error && <ErrorBox message={error} onRetry={reload} />}
        {loading && !data ? <Loading /> : data && !data.items.length ? <Empty icon="rupee" title="Nothing here" body="All caught up." /> : data && <OrderTable rows={data.items} show={t[3]} />}
      </Card>
    </div>
  );
}

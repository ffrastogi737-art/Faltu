import { useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { Icon } from '../components/Icon';
import { Badge, Card, Empty, ErrorBox, Loading, Modal, orderTone, PageHeader, Table } from '../components/ui';
import { api, download } from '../lib/api';
import { date, ORDER_STATUS, rupees } from '../lib/format';
import { useLoad, useSession } from '../lib/session';

type Customer = { id: number; name: string; mobile: string; email: string | null; created_at: string; orders: number; spent_paise: number; last_order_at: string | null; address: string | null; marketing_opt_in: boolean };

function CustomerModal({ id, onClose }: { id: number; onClose: () => void }) {
  const { data: c, error } = useLoad(() => api<Customer & { orders: any[]; addresses: any[] }>(`/admin/customers/${id}`), [id], false);
  return (
    <Modal title={c?.name || 'Customer'} onClose={onClose} wide>
      {error && <ErrorBox message={error} />}
      {!c ? <Loading /> : (
        <div className="space-y-4 text-[13px]">
          <p>+91 {c.mobile}{c.email && ` · ${c.email}`} · joined {date(c.created_at)} · {c.marketing_opt_in ? 'accepts promotions' : 'no promotions'}</p>
          <div>
            <p className="label">Saved addresses</p>
            {c.addresses.length ? c.addresses.map((a, i) => <p key={i}>{a.label}: {[a.house, a.street, a.area, a.city, a.state, a.pincode].filter(Boolean).join(', ')}</p>) : <p className="text-muted">None</p>}
          </div>
          <div>
            <p className="label">Orders</p>
            <Table>
              <tbody>{c.orders.map((o: any) => (
                <tr key={o.order_number}><td><Link className="text-gold-dark underline" to={`/orders/${o.order_number}`}>#{o.order_number}</Link></td><td>{date(o.created_at)}</td><td><Badge tone={orderTone(o.status)}>{ORDER_STATUS[o.status]}</Badge></td><td className="text-right">{rupees(o.total_paise)}</td></tr>
              ))}</tbody>
            </Table>
          </div>
        </div>
      )}
    </Modal>
  );
}

export default function Customers() {
  const { staff, notify } = useSession();
  const [params, setParams] = useSearchParams();
  const [q, setQ] = useState('');
  const [search, setSearch] = useState('');
  const [repeat, setRepeat] = useState(false);
  const { data, error, loading, reload } = useLoad(() => api<Customer[]>(`/admin/customers?q=${encodeURIComponent(search)}${repeat ? '&repeat=1' : ''}`), [search, repeat]);
  const openId = Number(params.get('id')) || null;
  return (
    <div>
      <PageHeader title="Customers" subtitle="Customer details are private: use them only to serve orders."
        actions={staff?.role === 'owner' && <button className="btn-ghost" onClick={() => download('/admin/customers-export.csv', 'customers.csv').catch((e) => notify(e.message))}><Icon name="download" /> Export CSV</button>} />
      <Card>
        <div className="mb-4 flex flex-wrap items-center gap-3">
          <form className="min-w-60 flex-1" onSubmit={(e) => { e.preventDefault(); setSearch(q.trim()); }}><input type="search" placeholder="Search name, mobile or email" aria-label="Search customers" value={q} onChange={(e) => setQ(e.target.value)} /></form>
          <label className="flex items-center gap-2 text-[13px]"><input type="checkbox" checked={repeat} onChange={(e) => setRepeat(e.target.checked)} /> Repeat customers only</label>
        </div>
        {error && <ErrorBox message={error} onRetry={reload} />}
        {loading && !data ? <Loading /> : data && !data.length ? <Empty icon="users" title="No customers found" /> : data && (
          <Table>
            <thead><tr><th>Name</th><th>Mobile</th><th>Address</th><th>Registered</th><th className="text-right">Orders</th><th className="text-right">Spent</th><th>Last order</th></tr></thead>
            <tbody>{data.map((c) => (
              <tr key={c.id} className="cursor-pointer hover:bg-gold-soft/40" onClick={() => setParams({ id: String(c.id) })}>
                <td className="font-medium">{c.name} {c.orders >= 2 && <Badge tone="gold">Repeat</Badge>}<span className="block text-[11px] text-muted">{c.email}</span></td>
                <td>{c.mobile}</td><td className="max-w-56 truncate text-[12px] text-muted">{c.address || '—'}</td><td>{date(c.created_at)}</td>
                <td className="text-right tabular-nums">{c.orders}</td><td className="text-right tabular-nums">{rupees(c.spent_paise)}</td><td>{date(c.last_order_at)}</td>
              </tr>
            ))}</tbody>
          </Table>
        )}
      </Card>
      {openId && <CustomerModal id={openId} onClose={() => setParams({})} />}
    </div>
  );
}

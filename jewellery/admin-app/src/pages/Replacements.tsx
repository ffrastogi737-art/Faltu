import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Badge, Card, Empty, ErrorBox, Field, Loading, Modal, PageHeader, Spinner } from '../components/ui';
import { api } from '../lib/api';
import { dateTime, ISSUES, REPLACEMENT_STATUS } from '../lib/format';
import { useLoad, useSession } from '../lib/session';

type Req = { id: number; status: string; issue: string; description: string; photos: string[]; admin_note: string | null; created_at: string; order_number: string; contact_name: string; contact_mobile: string; delivered_at: string; product_name: string; sku: string; image_url: string | null; quantity: number };

function Review({ r, onClose }: { r: Req; onClose: () => void }) {
  const { notify, refreshAlerts } = useSession();
  const [status, setStatus] = useState(r.status === 'requested' ? 'under_review' : r.status);
  const [note, setNote] = useState(r.admin_note || '');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const hours = (new Date(r.created_at).getTime() - new Date(r.delivered_at).getTime()) / 3600e3;
  return (
    <Modal title={`Replacement · #${r.order_number}`} onClose={onClose} wide>
      <div className="grid gap-5 md:grid-cols-2">
        <div className="space-y-2 text-[13px]">
          <p><b>{r.product_name}</b> · SKU {r.sku} · qty {r.quantity}</p>
          <p>Issue: <b>{ISSUES[r.issue]}</b></p>
          {r.description && <p className="rounded bg-ivory p-2">“{r.description}”</p>}
          <p className="text-muted">Customer: {r.contact_name} · {r.contact_mobile}</p>
          <p className="text-muted">Delivered {dateTime(r.delivered_at)} · reported {hours.toFixed(1)} h later</p>
          <p><Link to={`/orders/${r.order_number}`} className="underline">Open order</Link></p>
          <p className="rounded border border-line p-2 text-[12px] text-muted">Policy: replacement only for wrong, damaged or manufacturing-defective products. No returns or refunds are processed here. Customers' statutory rights are not limited by this policy.</p>
        </div>
        <div>
          <p className="label">Customer photos ({r.photos.length})</p>
          <div className="grid grid-cols-2 gap-2">{r.photos.map((p) => <a key={p} href={p} target="_blank" rel="noreferrer"><img src={p} alt="Customer photo" className="aspect-square w-full rounded object-cover" /></a>)}</div>
        </div>
      </div>
      <form className="mt-5 space-y-3 border-t border-line pt-4" onSubmit={async (e) => {
        e.preventDefault();
        setBusy(true);
        setErr(null);
        try { await api(`/admin/replacements/${r.id}/status`, 'POST', { status, note }); notify('Replacement updated'); refreshAlerts(); onClose(); } catch (e) { setErr((e as Error).message); setBusy(false); }
      }}>
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Status"><select value={status} onChange={(e) => setStatus(e.target.value)}>{Object.entries(REPLACEMENT_STATUS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></Field>
          <Field label={status === 'rejected' ? 'Rejection reason (shown to customer)' : 'Note to customer (optional)'}><input required={status === 'rejected'} value={note} onChange={(e) => setNote(e.target.value)} maxLength={500} /></Field>
        </div>
        {err && <ErrorBox message={err} />}
        <button disabled={busy} className="btn-primary w-full">{busy ? <Spinner /> : 'Save'}</button>
      </form>
    </Modal>
  );
}

export default function Replacements() {
  const [filter, setFilter] = useState('');
  const { data, error, loading, reload } = useLoad(() => api<Req[]>(`/admin/replacements${filter ? `?status=${filter}` : ''}`), [filter]);
  const [open, setOpen] = useState<Req | null>(null);
  return (
    <div>
      <PageHeader title="Replacements" subtitle="Replacement only — no returns, no refunds." />
      <div className="mb-4 max-w-xs">
        <select aria-label="Filter" value={filter} onChange={(e) => setFilter(e.target.value)}>
          <option value="">Needs action (requested / under review)</option><option value="all">All requests</option>
          {Object.entries(REPLACEMENT_STATUS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
        </select>
      </div>
      {error && <ErrorBox message={error} onRetry={reload} />}
      {loading && !data ? <Loading /> : data && !data.length ? <Card><Empty icon="shield" title="No replacement requests here" /></Card> : (
        <div className="grid gap-3 md:grid-cols-2">
          {data?.map((r) => (
            <button key={r.id} onClick={() => setOpen(r)} className="card flex gap-3 p-4 text-left transition hover:border-gold">
              {r.photos[0] && <img src={r.photos[0]} alt="" className="h-20 w-20 shrink-0 rounded object-cover" />}
              <span className="min-w-0 flex-1 text-[13px]">
                <span className="flex items-center justify-between gap-2"><b>#{r.order_number}</b><Badge tone={r.status === 'rejected' ? 'bad' : r.status === 'completed' ? 'good' : 'warn'}>{REPLACEMENT_STATUS[r.status]}</Badge></span>
                <span className="block truncate">{r.product_name}</span>
                <span className="block text-muted">{ISSUES[r.issue]} · {dateTime(r.created_at)}</span>
                <span className="block text-muted">{r.contact_name}</span>
              </span>
            </button>
          ))}
        </div>
      )}
      {open && <Review r={open} onClose={() => { setOpen(null); reload(); }} />}
    </div>
  );
}

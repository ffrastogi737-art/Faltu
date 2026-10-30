import { useState } from 'react';
import { Icon } from '../components/Icon';
import { SingleUpload } from '../components/MediaPicker';
import { Badge, Card, ErrorBox, Field, Loading, Modal, PageHeader, Spinner } from '../components/ui';
import { api } from '../lib/api';
import { dateTime } from '../lib/format';
import { useLoad, useSession } from '../lib/session';

type Offer = { id: number; kind: string; title: string; subtitle: string; cta: string; link: string; image_url: string | null; starts_at: string | null; ends_at: string | null; active: boolean; sort_order: number };
const KINDS: Record<string, string> = { festival: 'Festival offer', new_collection: 'New collection', special: 'Special discount' };
const local = (iso: string | null) => (iso ? new Date(new Date(iso).getTime() - new Date().getTimezoneOffset() * 6e4).toISOString().slice(0, 16) : '');
const live = (o: Offer) => o.active && (!o.starts_at || new Date(o.starts_at) <= new Date()) && (!o.ends_at || new Date(o.ends_at) > new Date());

function Editor({ o, onClose }: { o: Partial<Offer>; onClose: () => void }) {
  const { notify } = useSession();
  const [f, setF] = useState({ kind: o.kind || 'special', title: o.title || '', subtitle: o.subtitle || '', cta: o.cta || 'Shop now', link: o.link || '/collection/offers', imageUrl: o.image_url || null, startsAt: local(o.starts_at || null), endsAt: local(o.ends_at || null), active: o.active ?? true, sortOrder: o.sort_order ?? 0 });
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  return (
    <Modal title={o.id ? 'Edit offer' : 'Create offer'} onClose={onClose} wide>
      <form className="grid gap-4 sm:grid-cols-2" onSubmit={async (e) => {
        e.preventDefault();
        setBusy(true);
        try {
          const body = { ...f, startsAt: f.startsAt ? new Date(f.startsAt).toISOString() : null, endsAt: f.endsAt ? new Date(f.endsAt).toISOString() : null };
          await api(o.id ? `/admin/offers/${o.id}` : '/admin/offers', o.id ? 'PUT' : 'POST', body);
          notify('Offer saved — the customer home banner updates now');
          onClose();
        } catch (e) { setErr((e as Error).message); setBusy(false); }
      }}>
        <Field label="Type"><select value={f.kind} onChange={(e) => setF({ ...f, kind: e.target.value })}>{Object.entries(KINDS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></Field>
        <Field label="Display order"><input type="number" value={f.sortOrder} onChange={(e) => setF({ ...f, sortOrder: Number(e.target.value) })} /></Field>
        <Field label="Banner title" className="sm:col-span-2"><input required maxLength={80} value={f.title} onChange={(e) => setF({ ...f, title: e.target.value })} /></Field>
        <Field label="Subtitle" className="sm:col-span-2"><input maxLength={160} value={f.subtitle} onChange={(e) => setF({ ...f, subtitle: e.target.value })} /></Field>
        <Field label="Button text"><input maxLength={30} value={f.cta} onChange={(e) => setF({ ...f, cta: e.target.value })} /></Field>
        <Field label="Button opens" hint="/collection/offers, /collection/new, /category/earrings …"><input value={f.link} onChange={(e) => setF({ ...f, link: e.target.value })} /></Field>
        <Field label="Starts"><input type="datetime-local" value={f.startsAt} onChange={(e) => setF({ ...f, startsAt: e.target.value })} /></Field>
        <Field label="Ends"><input type="datetime-local" value={f.endsAt} onChange={(e) => setF({ ...f, endsAt: e.target.value })} /></Field>
        <div className="sm:col-span-2"><span className="label">Banner image (optional)</span><SingleUpload kind="offer" label="Banner" value={f.imageUrl} onChange={(v) => setF({ ...f, imageUrl: v })} /></div>
        <label className="flex items-center gap-2 sm:col-span-2"><input type="checkbox" checked={f.active} onChange={(e) => setF({ ...f, active: e.target.checked })} /> Active</label>
        {err && <div className="sm:col-span-2"><ErrorBox message={err} /></div>}
        <button disabled={busy} className="btn-primary sm:col-span-2">{busy ? <Spinner /> : 'Save offer'}</button>
      </form>
    </Modal>
  );
}

function Broadcast() {
  const { notify } = useSession();
  const sent = useLoad(() => api<any[]>('/admin/notifications/broadcasts'), [], false);
  const [f, setF] = useState({ type: 'new_arrivals', title: '', body: '', link: '/collection/new' });
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  return (
    <Card title="Promotional notification">
      <form className="space-y-3" onSubmit={async (e) => {
        e.preventDefault();
        if (!confirm('Send this notification now to every customer who agreed to receive offers?')) return;
        setBusy(true);
        setErr(null);
        try { const r = await api<{ recipients: number }>('/admin/notifications/broadcast', 'POST', f); notify(`Sent to ${r.recipients} opted-in customers`); setF({ ...f, title: '', body: '' }); sent.reload(); } catch (e) { setErr((e as Error).message); } finally { setBusy(false); }
      }}>
        <Field label="Type"><select value={f.type} onChange={(e) => setF({ ...f, type: e.target.value })}><option value="new_arrivals">New arrivals</option><option value="promo">Special offer</option><option value="festival">Festival collection</option></select></Field>
        <Field label="Title"><input required minLength={3} maxLength={80} value={f.title} onChange={(e) => setF({ ...f, title: e.target.value })} /></Field>
        <Field label="Message"><textarea rows={2} maxLength={200} value={f.body} onChange={(e) => setF({ ...f, body: e.target.value })} /></Field>
        <Field label="Opens"><input value={f.link} onChange={(e) => setF({ ...f, link: e.target.value })} /></Field>
        <p className="text-[12px] text-muted">Only customers who opted in to offers receive this (in-app and push). Order updates are separate and always sent.</p>
        {err && <ErrorBox message={err} />}
        <button disabled={busy} className="btn-gold w-full">{busy ? <Spinner /> : <><Icon name="megaphone" /> Send</>}</button>
      </form>
      {sent.data && sent.data.length > 0 && (
        <ul className="mt-4 space-y-1 border-t border-line pt-3 text-[12px]">{sent.data.slice(0, 8).map((n) => <li key={n.id}><b>{n.title}</b> <span className="text-muted">· {dateTime(n.created_at)}</span></li>)}</ul>
      )}
    </Card>
  );
}

export default function Offers() {
  const { data, error, reload } = useLoad(() => api<Offer[]>('/admin/offers'), []);
  const [edit, setEdit] = useState<Partial<Offer> | null>(null);
  const { notify } = useSession();
  return (
    <div>
      <PageHeader title="Offers & promotions" subtitle="Live offers become the home-page banners in the customer app. Mark products for “Special Offers”, “Featured” etc. on each product."
        actions={<button className="btn-primary" onClick={() => setEdit({})}><Icon name="plus" /> Create offer</button>} />
      <div className="grid gap-5 lg:grid-cols-[1.4fr_1fr]">
        <Card title="Offers & banners">
          {error && <ErrorBox message={error} onRetry={reload} />}
          {!data ? <Loading /> : !data.length ? <p className="py-6 text-center text-muted">No offers yet.</p> : (
            <ul className="divide-y divide-line">
              {data.map((o) => (
                <li key={o.id} className="flex items-center gap-3 py-3">
                  {o.image_url ? <img src={o.image_url} alt="" className="h-12 w-20 rounded object-cover" /> : <span className="grid h-12 w-20 place-items-center rounded bg-ink font-display text-[11px] text-gold">Banner</span>}
                  <span className="min-w-0 flex-1"><b className="font-medium">{o.title}</b> <span className="text-[12px] text-muted">{KINDS[o.kind]}</span>
                    <span className="block text-[12px] text-muted">{o.starts_at ? dateTime(o.starts_at) : 'Now'} → {o.ends_at ? dateTime(o.ends_at) : 'no end'}</span></span>
                  {live(o) ? <Badge tone="good">Live</Badge> : <Badge>{o.active ? 'Scheduled / ended' : 'Off'}</Badge>}
                  <button className="btn-ghost" onClick={() => setEdit(o)}>Edit</button>
                  <button className="btn-danger" aria-label={`Delete ${o.title}`} onClick={async () => { if (confirm('Delete this offer?')) { await api(`/admin/offers/${o.id}`, 'DELETE').catch((e) => notify(e.message)); reload(); } }}><Icon name="trash" /></button>
                </li>
              ))}
            </ul>
          )}
        </Card>
        <Broadcast />
      </div>
      {edit && <Editor o={edit} onClose={() => { setEdit(null); reload(); }} />}
    </div>
  );
}

import { useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { Icon } from '../components/Icon';
import { ErrorState, Img, PageHeader, Skeleton, Spinner } from '../components/ui';
import { api } from '../lib/api';
import { countdown, ISSUES } from '../lib/format';
import { useLoad, useStore } from '../lib/store';
import type { Order, ReplacementIssue } from '../lib/types';
import { useNow } from './OrderPage';

// Downscale on the phone so uploads work on slow connections.
async function compress(file: File): Promise<string> {
  const bitmap = await createImageBitmap(file);
  const scale = Math.min(1, 1600 / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(bitmap.width * scale);
  canvas.height = Math.round(bitmap.height * scale);
  canvas.getContext('2d')!.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  return canvas.toDataURL('image/jpeg', 0.82);
}

export default function Replacement() {
  const { number = '' } = useParams();
  const navigate = useNavigate();
  const { guestToken, notify } = useStore();
  const gt = guestToken(number);
  const headers: Record<string, string> = gt ? { 'x-guest-token': gt } : {};
  const { data: o, error, reload } = useLoad(() => api<Order>(`/orders/${number}`, { headers }), [number, gt]);
  const [itemId, setItemId] = useState<number | null>(null);
  const [issue, setIssue] = useState<ReplacementIssue | null>(null);
  const [photos, setPhotos] = useState<string[]>([]);
  const [description, setDescription] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const now = useNow(1000);

  if (error && !o) return (<><PageHeader title="Replacement" /><ErrorState message={error} onRetry={reload} /></>);
  if (!o) return (<><PageHeader title="Replacement" /><div className="p-4"><Skeleton className="h-64" /></div></>);

  const left = o.replacementDeadline ? new Date(o.replacementDeadline).getTime() - now : 0;
  const taken = new Set(o.replacements.map((r) => r.orderItemId));
  const items = o.items.filter((i) => !taken.has(i.id));
  if (o.status !== 'delivered' || left <= 0 || !items.length) {
    return (<><PageHeader title="Replacement" /><ErrorState message={o.status !== 'delivered' ? 'Replacements can be requested after delivery.' : !items.length ? 'A replacement request already exists for every product in this order.' : 'The replacement reporting window for this order has closed.'} /></>);
  }

  async function addPhotos(files: FileList | null) {
    if (!files) return;
    setErr(null);
    try {
      const next = await Promise.all([...files].slice(0, 5 - photos.length).map(compress));
      setPhotos((p) => [...p, ...next].slice(0, 5));
    } catch {
      setErr('Could not read that photo. Please try another one.');
    }
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!itemId || !issue || !photos.length) return setErr('Choose the product, the issue and add at least one photo.');
    setBusy(true);
    setErr(null);
    try {
      await api(`/orders/${number}/replacements`, { method: 'POST', body: { orderItemId: itemId, issue, description, photos }, headers });
      notify('Replacement request submitted');
      navigate(`/orders/${number}`, { replace: true });
    } catch (e) {
      setErr((e as Error).message);
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} className="pb-10">
      <PageHeader title="Request replacement" />
      <div className="mx-4 mt-4 flex items-center gap-3 bg-ink p-4 text-sm text-ivory">
        <Icon name="clock" className="text-champagne" /> Time left to report: <b className="tabular-nums text-champagne">{countdown(left)}</b>
      </div>

      <section className="px-4 pt-6">
        <p className="eyebrow">1 · Product</p>
        <div className="mt-3 space-y-2">
          {items.map((i) => (
            <label key={i.id} className={`flex cursor-pointer items-center gap-3 border p-3 text-sm ${itemId === i.id ? 'border-champagne bg-champagne-light/30' : 'border-sand'}`}>
              <input type="radio" name="item" checked={itemId === i.id} onChange={() => setItemId(i.id)} className="h-4 w-4 accent-champagne-dark" />
              <Img src={i.imageUrl} alt="" className="h-14 w-12 shrink-0" />
              <span className="flex-1">{i.name}<span className="block text-xs text-muted">SKU {i.sku} · Qty {i.quantity}</span></span>
            </label>
          ))}
        </div>
      </section>

      <section className="px-4 pt-8">
        <p className="eyebrow">2 · Issue</p>
        <div className="mt-3 space-y-2">
          {(Object.keys(ISSUES) as ReplacementIssue[]).map((k) => (
            <label key={k} className={`flex cursor-pointer items-center gap-3 border p-3 text-sm ${issue === k ? 'border-champagne bg-champagne-light/30' : 'border-sand'}`}>
              <input type="radio" name="issue" checked={issue === k} onChange={() => setIssue(k)} className="h-4 w-4 accent-champagne-dark" /> {ISSUES[k]}
            </label>
          ))}
        </div>
        <p className="mt-3 text-xs leading-relaxed text-muted">
          Not eligible: change of mind, not liking the product, used products, or damage caused by handling after delivery.
        </p>
      </section>

      <section className="px-4 pt-8">
        <p className="eyebrow">3 · Photographs</p>
        <p className="mt-1 text-xs text-muted">Add 1–5 clear photos showing the issue and the product tag/packaging.</p>
        <div className="mt-3 grid grid-cols-3 gap-2">
          {photos.map((src, k) => (
            <div key={k} className="relative aspect-square">
              <img src={src} alt={`Photo ${k + 1}`} className="h-full w-full object-cover" />
              <button type="button" onClick={() => setPhotos(photos.filter((_, j) => j !== k))} className="absolute right-1 top-1 grid h-7 w-7 place-items-center rounded-full bg-ink/80 text-ivory" aria-label={`Remove photo ${k + 1}`}><Icon name="close" /></button>
            </div>
          ))}
          {photos.length < 5 && (
            <label className="grid aspect-square cursor-pointer place-items-center border border-dashed border-champagne text-center text-xs text-champagne-dark">
              <span><Icon name="camera" className="mx-auto mb-1 block text-2xl" />Add photo</span>
              <input type="file" accept="image/*" capture="environment" multiple className="sr-only" onChange={(e) => { addPhotos(e.target.files); e.target.value = ''; }} />
            </label>
          )}
        </div>
      </section>

      <section className="px-4 pt-8">
        <label className="block"><span className="label">Describe the issue (optional)</span>
          <textarea rows={3} maxLength={1000} value={description} onChange={(e) => setDescription(e.target.value)} placeholder="e.g. One stone missing on the left earring" />
        </label>
        {err && <p className="mt-3 text-sm text-ruby" role="alert">{err}</p>}
        <button disabled={busy} className="btn-dark mt-6 w-full">{busy ? <Spinner /> : 'Submit replacement request'}</button>
        <p className="mt-3 text-center text-xs text-muted">The shop reviews every request. This is a replacement, not a return or refund.</p>
      </section>
    </form>
  );
}

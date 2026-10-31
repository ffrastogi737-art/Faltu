import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { Icon } from '../components/Icon';
import { ImageManager, SingleUpload } from '../components/MediaPicker';
import { Badge, Card, ErrorBox, Field, Loading, PageHeader, Spinner, Table } from '../components/ui';
import { api } from '../lib/api';
import { dateTime, toRupees } from '../lib/format';
import { useLoad, useSession } from '../lib/session';
import type { AdminProduct, Category } from './Products';
import { StockAdjust } from './Inventory';

const TAGS: [string, string][] = [['featured', 'Featured'], ['new_arrival', 'New Arrival'], ['best_seller', 'Best Seller'], ['trending', 'Trending'], ['offer', 'Special Offer']];
type Form = { name: string; sku: string; categoryId: string; originalPrice: string; sellingPrice: string; stock: string; description: string; images: string[]; videoUrl: string | null; specs: [string, string][]; tags: string[]; active: boolean };
const EMPTY: Form = { name: '', sku: '', categoryId: '', originalPrice: '', sellingPrice: '', stock: '0', description: '', images: [], videoUrl: null, specs: [['Material', ''], ['Plating', '']], tags: [], active: true };

export default function ProductEdit() {
  const { id = 'new' } = useParams();
  const isNew = id === 'new';
  const navigate = useNavigate();
  const { notify } = useSession();
  const cats = useLoad(() => api<Category[]>('/admin/categories'), [], false);
  const prod = useLoad(() => (isNew ? Promise.resolve(null) : api<AdminProduct & { movements: any[]; orderCount: number }>(`/admin/products/${id}`)), [id], false);
  const [f, setF] = useState<Form>(EMPTY);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    const p = prod.data;
    if (!p) return;
    setF({
      name: p.name, sku: p.sku, categoryId: p.category_id ? String(p.category_id) : '', originalPrice: toRupees(p.original_price_paise), sellingPrice: toRupees(p.selling_price_paise),
      stock: String(p.stock), description: p.description, images: p.images, videoUrl: p.video_url, specs: Object.entries(p.specifications), tags: p.tags, active: p.active,
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [prod.data?.id]); // only on first load, so a stock change doesn't wipe unsaved edits

  if (prod.error) return <ErrorBox message={prod.error} />;
  if (!isNew && !prod.data) return <Loading />;
  const p = prod.data;
  const set = <K extends keyof Form>(k: K, v: Form[K]) => setF((x) => ({ ...x, [k]: v }));
  const discount = Number(f.originalPrice) > 0 && Number(f.sellingPrice) >= 0 ? Math.round((1 - Number(f.sellingPrice) / Number(f.originalPrice)) * 100) : 0;

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setErr(null);
    const body = {
      name: f.name, sku: f.sku, categoryId: f.categoryId ? Number(f.categoryId) : null, originalPrice: f.originalPrice, sellingPrice: f.sellingPrice,
      stock: Number(f.stock), description: f.description, images: f.images, videoUrl: f.videoUrl, tags: f.tags, active: f.active,
      specifications: Object.fromEntries(f.specs.filter(([k, v]) => k.trim() && v.trim())),
    };
    try {
      const r = await api<{ id: number }>(isNew ? '/admin/products' : `/admin/products/${id}`, isNew ? 'POST' : 'PUT', body);
      notify(isNew ? 'Product created — live in the customer app' : 'Product saved');
      if (isNew) navigate(`/products/${r.id}`, { replace: true }); else prod.reload();
    } catch (e) { setErr((e as Error).message); } finally { setBusy(false); }
  }
  async function archive(archived: boolean) {
    try { await api(`/admin/products/${id}/archive`, 'POST', { archived }); notify(archived ? 'Product archived' : 'Product restored'); prod.reload(); } catch (e) { setErr((e as Error).message); }
  }
  async function remove() {
    if (!confirm(`Delete ${p!.name} permanently? This cannot be undone.`)) return;
    try { await api(`/admin/products/${id}`, 'DELETE'); notify('Product deleted'); navigate('/products'); } catch (e) { setErr((e as Error).message); }
  }

  return (
    <form onSubmit={save}>
      <PageHeader title={isNew ? 'Add product' : f.name || 'Product'}
        subtitle={p ? <>Product ID {p.id} · {p.sold_count} sold · {p.orderCount} order line(s) {p.is_demo && <Badge tone="gold">Demo product</Badge>} {p.archived_at && <Badge>Archived</Badge>}</> : 'Shown to customers as soon as you save it (if active).'}
        actions={<><Link to="/products" className="btn-ghost">Back</Link><button disabled={busy} className="btn-primary">{busy ? <Spinner /> : <><Icon name="check" /> Save product</>}</button></>} />
      {err && <div className="mb-4"><ErrorBox message={err} /></div>}
      <div className="grid gap-5 lg:grid-cols-[1.5fr_1fr]">
        <div className="space-y-5">
          <Card title="Details">
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Product name" className="sm:col-span-2"><input required minLength={2} maxLength={120} value={f.name} onChange={(e) => set('name', e.target.value)} /></Field>
              <Field label="SKU" hint="Your unique stock code, e.g. KJ-EAR-001"><input required maxLength={40} pattern="[A-Za-z0-9._\-]+" value={f.sku} onChange={(e) => set('sku', e.target.value)} /></Field>
              <Field label="Category">
                <select value={f.categoryId} onChange={(e) => set('categoryId', e.target.value)}><option value="">Uncategorised</option>{cats.data?.map((c) => <option key={c.id} value={c.id}>{c.name}{c.active ? '' : ' (inactive)'}</option>)}</select>
              </Field>
              <Field label="Description" className="sm:col-span-2"><textarea rows={5} maxLength={5000} value={f.description} onChange={(e) => set('description', e.target.value)} /></Field>
            </div>
          </Card>
          <Card title="Photos"><ImageManager value={f.images} onChange={(v) => set('images', v)} /></Card>
          <Card title="Video (optional)">
            <SingleUpload kind="video" label="Video" video value={f.videoUrl?.startsWith('/uploads/') ? f.videoUrl : null} onChange={(v) => set('videoUrl', v)} />
            <p className="mt-2 text-[12px] text-muted">MP4, MOV or WebM up to 20 MB, or paste a YouTube link (saves storage):</p>
            <input className="mt-1" type="url" aria-label="YouTube video link" placeholder="https://youtu.be/…" value={f.videoUrl && !f.videoUrl.startsWith('/uploads/') ? f.videoUrl : ''} onChange={(e) => set('videoUrl', e.target.value.trim() || null)} />
          </Card>
          <Card title="Specifications" actions={<button type="button" className="btn-ghost" onClick={() => set('specs', [...f.specs, ['', '']])}><Icon name="plus" /> Add row</button>}>
            <div className="space-y-2">
              {f.specs.map(([k, v], i) => (
                <div key={i} className="grid grid-cols-[1fr_2fr_auto] gap-2">
                  <input aria-label="Specification name" placeholder="e.g. Weight" value={k} onChange={(e) => set('specs', f.specs.map((s, j) => (j === i ? [e.target.value, s[1]] : s)))} />
                  <input aria-label="Specification value" placeholder="e.g. 24 g" value={v} onChange={(e) => set('specs', f.specs.map((s, j) => (j === i ? [s[0], e.target.value] : s)))} />
                  <button type="button" aria-label="Remove specification" className="btn-ghost" onClick={() => set('specs', f.specs.filter((_, j) => j !== i))}><Icon name="trash" /></button>
                </div>
              ))}
            </div>
          </Card>
        </div>
        <div className="space-y-5">
          <Card title="Price">
            <div className="grid grid-cols-2 gap-3">
              <Field label="Original price (₹)"><input required inputMode="decimal" value={f.originalPrice} onChange={(e) => set('originalPrice', e.target.value)} /></Field>
              <Field label="Selling price (₹)"><input required inputMode="decimal" value={f.sellingPrice} onChange={(e) => set('sellingPrice', e.target.value)} /></Field>
            </div>
            <p className="mt-2 text-[13px]">Discount: <b>{discount > 0 ? `${discount}%` : 'none'}</b></p>
          </Card>
          <Card title="Stock">
            {isNew ? (
              <Field label="Opening stock"><input type="number" min={0} value={f.stock} onChange={(e) => set('stock', e.target.value)} /></Field>
            ) : (
              <>
                <p className="mb-3 text-[13px]">Available now: <b className="text-lg">{p!.stock}</b></p>
                <StockAdjust productId={p!.id} onDone={prod.reload} />
              </>
            )}
          </Card>
          <Card title="Visibility & promotion">
            <label className="flex items-center gap-2"><input type="checkbox" checked={f.active} onChange={(e) => set('active', e.target.checked)} /> Active (visible to customers)</label>
            <div className="mt-3 grid grid-cols-2 gap-2">
              {TAGS.map(([t, l]) => (
                <label key={t} className="flex items-center gap-2 text-[13px]"><input type="checkbox" checked={f.tags.includes(t)} onChange={(e) => set('tags', e.target.checked ? [...f.tags, t] : f.tags.filter((x) => x !== t))} /> {l}</label>
              ))}
            </div>
          </Card>
          {!isNew && (
            <Card title="Archive / delete">
              <div className="flex flex-wrap gap-2">
                {p!.archived_at ? <button type="button" className="btn-ghost" onClick={() => archive(false)}>Restore from archive</button> : <button type="button" className="btn-ghost" onClick={() => archive(true)}>Archive</button>}
                <button type="button" className="btn-danger" onClick={remove} disabled={p!.orderCount > 0} title={p!.orderCount ? 'Ordered products can only be archived' : ''}>Delete</button>
              </div>
              <p className="mt-2 text-[12px] text-muted">Archived products are hidden from customers and kept for order history. Products that were ever ordered cannot be deleted.</p>
            </Card>
          )}
          {!isNew && p!.movements.length > 0 && (
            <Card title="Inventory history">
              <Table>
                <tbody>{p!.movements.slice(0, 15).map((m) => (
                  <tr key={m.id} className="text-[12px]"><td>{dateTime(m.created_at)}</td><td className="capitalize">{m.reason}{m.order_number && ` #${m.order_number}`}</td>
                    <td className={`text-right tabular-nums ${m.change < 0 ? 'text-bad' : 'text-good'}`}>{m.change > 0 ? '+' : ''}{m.change}</td><td className="text-right tabular-nums">{m.stock_after}</td></tr>
                ))}</tbody>
              </Table>
            </Card>
          )}
        </div>
      </div>
    </form>
  );
}

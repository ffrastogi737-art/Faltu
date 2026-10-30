import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Card, ErrorBox, Field, Loading, PageHeader, Spinner, Stat } from '../components/ui';
import { api } from '../lib/api';
import { useLoad, useSession } from '../lib/session';

const CONFIRM = 'REMOVE DEMO DATA';
type Demo = { demo_products: number; demo_with_orders: number; real_products: number; demo_category_images: number; shown_to_customers: boolean; upiIsPlaceholder: boolean; products: { id: number; sku: string; name: string; image: string | null; stock: number }[] };

export default function DemoData() {
  const { notify } = useSession();
  const { data: d, error, reload } = useLoad(() => api<Demo>('/admin/demo'), []);
  const [typed, setTyped] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  if (error) return <ErrorBox message={error} onRetry={reload} />;
  if (!d) return <Loading />;
  async function toggle() {
    try { await api('/admin/settings', 'PATCH', { show_demo_products: !d!.shown_to_customers }); notify(d!.shown_to_customers ? 'Demo products hidden from customers' : 'Demo products visible'); reload(); } catch (e) { setErr((e as Error).message); }
  }
  async function remove() {
    setBusy(true);
    setErr(null);
    try { const r = await api<{ removedProducts: number }>('/admin/demo/remove', 'POST', { confirm: typed }); notify(`${r.removedProducts} demo products removed`); setTyped(''); reload(); } catch (e) { setErr((e as Error).message); } finally { setBusy(false); }
  }
  return (
    <div>
      <PageHeader title="Demo data" subtitle="The starter catalogue (generated artwork, SKUs AJ-…) is marked as demo. Replace it with your real products." />
      <div className="mb-5 grid grid-cols-2 gap-3 md:grid-cols-4">
        <Stat label="Demo products" value={d.demo_products} tone={d.demo_products ? 'warn' : 'good'} />
        <Stat label="Real products" value={d.real_products} />
        <Stat label="Demo items in past orders" value={d.demo_with_orders} hint="Order history keeps its own copy" />
        <Stat label="Demo category images" value={d.demo_category_images} hint={<Link to="/categories" className="underline">Replace</Link>} />
      </div>
      {d.upiIsPlaceholder && <div className="mb-5"><ErrorBox message="Payments still use the demo UPI ID aabhajewels@upi. Customers' UPI payments would not reach you." /> <Link to="/settings?tab=payments" className="text-[13px] underline">Set your UPI ID →</Link></div>}
      <div className="grid gap-5 lg:grid-cols-2">
        <Card title="Step 1 · Hide demo products from customers">
          <p className="text-[13px]">Currently <b>{d.shown_to_customers ? 'visible' : 'hidden'}</b> in the customer app. Hiding is instant and reversible; nothing is deleted.</p>
          <button className="btn-primary mt-3" onClick={toggle}>{d.shown_to_customers ? 'Hide demo products' : 'Show demo products again'}</button>
        </Card>
        <Card title="Step 2 · Add real products">
          <p className="text-[13px]">Add products one by one with photos, or import many at once from a spreadsheet.</p>
          <div className="mt-3 flex gap-2"><Link to="/products/new" className="btn-primary">Add product</Link><Link to="/import" className="btn-ghost">Import CSV</Link></div>
        </Card>
        <Card title="Step 3 · Remove demo products permanently" className="lg:col-span-2">
          <ul className="mb-3 list-disc space-y-1 pl-5 text-[13px] text-muted">
            <li>Deletes only products marked as demo ({d.demo_products}). Your real products are untouched.</li>
            <li>Orders, order items, payments, customers and inventory history are kept. Past orders keep the product name, SKU and price they were sold at.</li>
            <li>Demo artwork on categories is cleared so you can upload real category photos.</li>
          </ul>
          {d.demo_products > 0 ? (
            <>
              <Field label={`Type ${CONFIRM} to confirm`}><input value={typed} onChange={(e) => setTyped(e.target.value)} autoComplete="off" className="max-w-xs font-mono" /></Field>
              {err && <div className="mt-2"><ErrorBox message={err} /></div>}
              <button disabled={typed !== CONFIRM || busy} onClick={remove} className="btn-danger mt-3">{busy ? <Spinner /> : `Permanently remove ${d.demo_products} demo products`}</button>
              <details className="mt-4 text-[12px]"><summary className="cursor-pointer text-muted">Show demo products</summary>
                <ul className="mt-2 columns-2 text-muted">{d.products.map((p) => <li key={p.id}>{p.sku} · {p.name}</li>)}</ul>
              </details>
            </>
          ) : <p className="text-[13px] text-good">No demo products left.</p>}
        </Card>
      </div>
    </div>
  );
}

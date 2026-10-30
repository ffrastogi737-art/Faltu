import { useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { Icon } from '../components/Icon';
import { Badge, Card, Empty, ErrorBox, Loading, PageHeader, Table } from '../components/ui';
import { api } from '../lib/api';
import { rupees } from '../lib/format';
import { useLoad } from '../lib/session';

export type AdminProduct = {
  id: number; sku: string; slug: string; name: string; category_id: number | null; category_name: string | null; description: string;
  original_price_paise: number; selling_price_paise: number; stock: number; images: string[]; video_url: string | null;
  specifications: Record<string, string>; tags: string[]; sold_count: number; active: boolean; is_demo: boolean; archived_at: string | null;
};
export type Category = { id: number; slug: string; name: string; image_url: string | null; sort_order: number; active: boolean; product_count: number };

export default function Products() {
  const [params, setParams] = useSearchParams();
  const [q, setQ] = useState(params.get('q') || '');
  const qs = params.toString();
  const { data, error, loading, reload } = useLoad(() => api<{ items: AdminProduct[]; total: number }>(`/admin/products?${qs}`), [qs]);
  const cats = useLoad(() => api<Category[]>('/admin/categories'), [], false);
  const set = (k: string, v: string) => { const n = new URLSearchParams(params); if (v) n.set(k, v); else n.delete(k); setParams(n, { replace: true }); };
  return (
    <div>
      <PageHeader title="Products" subtitle="Changes appear in the customer app immediately."
        actions={<><Link to="/import" className="btn-ghost"><Icon name="upload" /> Import CSV</Link><Link to="/products/new" className="btn-primary"><Icon name="plus" /> Add product</Link></>} />
      <Card>
        <div className="mb-4 grid gap-2 sm:grid-cols-[2fr_1fr_1fr]">
          <form onSubmit={(e) => { e.preventDefault(); set('q', q.trim()); }}><input type="search" placeholder="Search name or SKU" aria-label="Search products" value={q} onChange={(e) => setQ(e.target.value)} /></form>
          <select aria-label="Category" value={params.get('category') || ''} onChange={(e) => set('category', e.target.value)}>
            <option value="">All categories</option>{cats.data?.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
          <select aria-label="Status" value={params.get('status') || ''} onChange={(e) => set('status', e.target.value)}>
            <option value="">Current (not archived)</option><option value="active">Active</option><option value="inactive">Inactive</option>
            <option value="low">Low stock</option><option value="demo">Demo products</option><option value="archived">Archived</option>
          </select>
        </div>
        {error && <ErrorBox message={error} onRetry={reload} />}
        {loading && !data ? <Loading /> : data && !data.items.length ? <Empty icon="tag" title="No products" action={<Link to="/products/new" className="btn-primary">Add your first product</Link>} /> : data && (
          <Table>
            <thead><tr><th></th><th>Product</th><th>Category</th><th className="text-right">MRP</th><th className="text-right">Price</th><th className="text-right">Stock</th><th>Status</th></tr></thead>
            <tbody>{data.items.map((p) => (
              <tr key={p.id} className="hover:bg-gold-soft/40">
                <td className="w-14">{p.images[0] ? <img src={p.images[0]} alt="" className="h-12 w-12 rounded object-cover" /> : <span className="block h-12 w-12 rounded bg-ivory" />}</td>
                <td><Link to={`/products/${p.id}`} className="font-medium hover:underline">{p.name}</Link><span className="block text-[11px] text-muted">#{p.id} · SKU {p.sku}</span></td>
                <td>{p.category_name || '—'}</td>
                <td className="text-right tabular-nums text-muted">{rupees(p.original_price_paise)}</td>
                <td className="text-right font-medium tabular-nums">{rupees(p.selling_price_paise)}</td>
                <td className={`text-right tabular-nums ${p.stock === 0 ? 'font-semibold text-bad' : p.stock <= 3 ? 'text-warn' : ''}`}>{p.stock}</td>
                <td className="space-x-1">{p.archived_at ? <Badge>Archived</Badge> : p.active ? <Badge tone="good">Active</Badge> : <Badge tone="warn">Hidden</Badge>}{p.is_demo && <Badge tone="gold">Demo</Badge>}</td>
              </tr>
            ))}</tbody>
          </Table>
        )}
        {data && data.total > 50 && <p className="mt-3 text-[12px] text-muted">Showing 50 of {data.total}. Refine the search to narrow down.</p>}
      </Card>
    </div>
  );
}

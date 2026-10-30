import { useEffect, useState } from 'react';
import { useLocation, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { Icon } from '../components/Icon';
import { ProductGrid } from '../components/ProductCard';
import { Empty, ErrorState, PageHeader, Spinner } from '../components/ui';
import { api } from '../lib/api';
import { useLoad } from '../lib/store';
import type { Category, Product } from '../lib/types';
import { COLLECTIONS } from './Home';

const SORTS = [['', 'Newest'], ['popular', 'Popular'], ['price_asc', 'Price: low to high'], ['price_desc', 'Price: high to low'], ['discount', 'Biggest discount']];
const PAGE = 24;

export default function ProductList() {
  const { slug, tag } = useParams();
  const { pathname } = useLocation();
  const [params, setParams] = useSearchParams();
  const navigate = useNavigate();
  const q = params.get('q') || '';
  const sort = params.get('sort') || '';
  const inStock = params.get('inStock') === '1';
  const [search, setSearch] = useState(q);
  const [items, setItems] = useState<Product[]>([]);
  const [page, setPage] = useState(1);
  const [more, setMore] = useState(false);
  const cats = useLoad(() => (slug ? api<Category[]>('/categories') : Promise.resolve([])), [slug]);
  useEffect(() => { setSearch(q); }, [q]);

  const collection = tag ? COLLECTIONS[tag] : null;
  const base = new URLSearchParams(collection?.query || '');
  if (slug) base.set('category', slug);
  if (q) base.set('q', q);
  if (sort) base.set('sort', sort);
  if (inStock) base.set('inStock', '1');
  base.set('limit', String(PAGE));
  const key = base.toString();

  const first = useLoad(() => api<{ items: Product[]; total: number }>(`/products?${key}&page=1`), [key]);
  useEffect(() => {
    if (first.data) { setItems(first.data.items); setPage(1); }
  }, [first.data]);

  async function loadMore() {
    setMore(true);
    try {
      const r = await api<{ items: Product[] }>(`/products?${key}&page=${page + 1}`);
      setItems((x) => [...x, ...r.items]);
      setPage(page + 1);
    } finally {
      setMore(false);
    }
  }

  const title = collection?.title || cats.data?.find((c) => c.slug === slug)?.name || (pathname === '/search' ? (q ? `“${q}”` : 'Search') : 'Collection');
  const total = first.data?.total ?? 0;
  const set = (k: string, v: string) => { const n = new URLSearchParams(params); if (v) n.set(k, v); else n.delete(k); setParams(n, { replace: true }); };

  return (
    <div>
      <PageHeader title={title} />
      {pathname === '/search' && (
        <form className="px-4 pt-3" role="search" onSubmit={(e) => { e.preventDefault(); navigate(`/search?q=${encodeURIComponent(search.trim())}`, { replace: true }); }}>
          <label className="flex items-center gap-3 border border-sand bg-white/70 px-4 focus-within:border-champagne">
            <Icon name="search" className="text-muted" />
            <input autoFocus={!q} type="search" value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search by name, SKU or style" aria-label="Search jewellery" className="border-0 py-3" />
          </label>
        </form>
      )}
      <div className="flex items-center gap-3 px-4 py-4 text-xs">
        <span className="text-muted">{first.loading ? '…' : `${total} design${total === 1 ? '' : 's'}`}</span>
        <span className="flex-1" />
        <label className="flex items-center gap-1.5">
          <input type="checkbox" checked={inStock} onChange={(e) => set('inStock', e.target.checked ? '1' : '')} className="h-4 w-4 accent-champagne-dark" /> In stock
        </label>
        {!collection && (
          <select value={sort} onChange={(e) => set('sort', e.target.value)} aria-label="Sort by" className="w-auto border border-sand bg-white/70 px-2 py-1.5 text-xs">
            {SORTS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
          </select>
        )}
      </div>
      {first.error && !first.data ? (
        <ErrorState message={first.error} onRetry={first.reload} />
      ) : !first.loading && total === 0 ? (
        <Empty icon="search" title="Nothing here yet" body={q ? 'Try a different word, like “jhumka” or “choker”.' : 'New designs are added regularly. Check back soon.'} />
      ) : (
        <ProductGrid items={first.loading && !items.length ? null : items} loading={first.loading} />
      )}
      {items.length < total && (
        <div className="py-8 text-center">
          <button onClick={loadMore} disabled={more} className="btn-line">{more ? <Spinner /> : 'Show more'}</button>
        </div>
      )}
    </div>
  );
}

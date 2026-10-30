import { Link } from 'react-router-dom';
import { ProductGrid } from '../components/ProductCard';
import { Empty, ErrorState, PageHeader } from '../components/ui';
import { api } from '../lib/api';
import { useLoad, useStore } from '../lib/store';
import type { Product } from '../lib/types';

export default function Wishlist() {
  const { customer, wishlist } = useStore();
  const ids = [...wishlist].sort().join(',');
  const { data, error, loading, reload } = useLoad(
    () => (customer ? api<Product[]>('/me/wishlist') : ids ? api<{ items: Product[] }>(`/products?ids=${ids}&limit=60`).then((r) => r.items) : Promise.resolve([])),
    [customer?.id, ids],
  );
  const items = data?.filter((p) => wishlist.has(p.id));
  return (
    <div>
      <PageHeader title="Wishlist" back={false} />
      {error && !data ? (
        <ErrorState message={error} onRetry={reload} />
      ) : !loading && !items?.length ? (
        <Empty icon="heart" title="Your wishlist is empty" body="Tap the heart on any piece to keep it here." action={<Link to="/" className="btn-dark">Discover jewellery</Link>} />
      ) : (
        <div className="pt-4">
          {!customer && <p className="px-4 pb-4 text-xs text-muted"><Link to="/login" className="underline">Log in</Link> to keep your wishlist on every device.</p>}
          <ProductGrid items={items} loading={loading} />
        </div>
      )}
    </div>
  );
}

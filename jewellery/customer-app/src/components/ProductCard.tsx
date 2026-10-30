import { Link } from 'react-router-dom';
import { useStore } from '../lib/store';
import type { Product } from '../lib/types';
import { Icon } from './Icon';
import { Img, Price, Skeleton } from './ui';

export function ProductCard({ p, className = '' }: { p: Product; className?: string }) {
  const { wishlist, toggleWishlist } = useStore();
  const saved = wishlist.has(p.id);
  return (
    <div className={`group relative ${className}`}>
      <Link to={`/product/${p.slug}`} className="block">
        <Img src={p.images[0]} alt={p.name} className="aspect-[4/5] transition duration-700 group-hover:[&_img]:scale-105" />
        <div className="absolute left-2 top-2 flex flex-col gap-1">
          {p.stock === 0 && <span className="bg-ink/85 px-2 py-0.5 text-[10px] uppercase tracking-[0.15em] text-ivory">Sold out</span>}
          {p.stock > 0 && p.discountPercent >= 10 && <span className="bg-champagne px-2 py-0.5 text-[10px] font-medium uppercase tracking-[0.15em]">{p.discountPercent}% off</span>}
        </div>
        <div className="pt-3">
          <p className="truncate font-display text-[17px] leading-snug">{p.name}</p>
          <Price selling={p.sellingPricePaise} original={p.originalPricePaise} />
        </div>
      </Link>
      <button onClick={() => toggleWishlist(p)} aria-label={saved ? `Remove ${p.name} from wishlist` : `Save ${p.name} to wishlist`} aria-pressed={saved}
        className="absolute right-2 top-2 grid h-9 w-9 place-items-center rounded-full bg-ivory/85 backdrop-blur transition active:scale-90">
        <Icon name="heart" filled={saved} className={saved ? 'text-ruby' : 'text-ink'} />
      </button>
    </div>
  );
}

export function ProductRail({ items, loading }: { items?: Product[] | null; loading?: boolean }) {
  return (
    <div className="no-scrollbar flex snap-x snap-mandatory gap-4 overflow-x-auto px-4 pb-2">
      {loading && !items
        ? Array.from({ length: 4 }, (_, i) => <Skeleton key={i} className="aspect-[4/5] w-[44vw] max-w-[220px] shrink-0" />)
        : items?.map((p) => <ProductCard key={p.id} p={p} className="w-[44vw] max-w-[220px] shrink-0 snap-start" />)}
    </div>
  );
}

export function ProductGrid({ items, loading }: { items?: Product[] | null; loading?: boolean }) {
  return (
    <div className="grid grid-cols-2 gap-x-4 gap-y-7 px-4 sm:grid-cols-3 lg:grid-cols-4">
      {loading && !items ? Array.from({ length: 6 }, (_, i) => <Skeleton key={i} className="aspect-[4/5]" />) : items?.map((p) => <ProductCard key={p.id} p={p} />)}
    </div>
  );
}

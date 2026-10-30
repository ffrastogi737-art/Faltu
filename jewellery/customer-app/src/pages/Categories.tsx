import { Link } from 'react-router-dom';
import { ErrorState, Img, PageHeader, Skeleton } from '../components/ui';
import { api } from '../lib/api';
import { useLoad } from '../lib/store';
import type { Category } from '../lib/types';

export default function Categories() {
  const { data, error, loading, reload } = useLoad(() => api<Category[]>('/categories'), []);
  return (
    <div>
      <PageHeader title="Categories" back={false} />
      {error && !data && <ErrorState message={error} onRetry={reload} />}
      <div className="grid grid-cols-2 gap-4 p-4 sm:grid-cols-3">
        {loading && !data
          ? Array.from({ length: 6 }, (_, i) => <Skeleton key={i} className="aspect-square" />)
          : data?.map((c, i) => (
              <Link key={c.slug} to={`/category/${c.slug}`} className="fade-up group relative block" style={{ animationDelay: `${i * 40}ms` }}>
                <Img src={c.imageUrl} alt="" className="aspect-square transition group-hover:[&_img]:scale-105" />
                <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-ink/70 to-transparent p-3 pt-10 text-ivory">
                  <p className="font-display text-xl leading-tight">{c.name}</p>
                  <p className="text-[10px] uppercase tracking-[0.2em] text-ivory/70">{c.productCount} designs</p>
                </div>
              </Link>
            ))}
      </div>
    </div>
  );
}

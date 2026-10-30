import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Icon, WhatsAppIcon } from '../components/Icon';
import { ProductRail } from '../components/ProductCard';
import { ErrorState, Img, SectionTitle, Skeleton } from '../components/ui';
import { api, assetUrl } from '../lib/api';
import { waLink } from '../lib/format';
import { useLoad, useStore } from '../lib/store';
import type { Category, Product } from '../lib/types';

export const COLLECTIONS: Record<string, { title: string; eyebrow: string; query: string }> = {
  new: { title: 'New Arrivals', eyebrow: 'Just in', query: 'sort=new' },
  trending: { title: 'Trending Now', eyebrow: 'Loved this week', query: 'tag=trending' },
  'best-sellers': { title: 'Best Sellers', eyebrow: 'Most ordered', query: 'sort=popular' },
  featured: { title: 'Featured Jewellery', eyebrow: 'Curated for you', query: 'tag=featured' },
  offers: { title: 'Special Offers', eyebrow: 'Limited prices', query: 'tag=offer' },
};

function Collection({ id }: { id: keyof typeof COLLECTIONS }) {
  const c = COLLECTIONS[id];
  const { data, loading } = useLoad(() => api<{ items: Product[] }>(`/products?${c.query}&limit=10`), [c.query]);
  if (!loading && !data?.items.length) return null;
  return (
    <section className="fade-up py-7">
      <SectionTitle eyebrow={c.eyebrow} title={c.title} to={`/collection/${id}`} />
      <ProductRail items={data?.items} loading={loading} />
    </section>
  );
}

function Banners() {
  const { settings } = useStore();
  const banners = settings?.banners?.length
    ? settings.banners
    : [{ title: settings?.tagline || 'Jewellery for every moment', subtitle: 'Browse the full collection', cta: 'Shop now', link: '/categories' }];
  const [i, setI] = useState(0);
  useEffect(() => {
    if (banners.length < 2) return;
    const t = setInterval(() => setI((x) => (x + 1) % banners.length), 5500);
    return () => clearInterval(t);
  }, [banners.length]);
  const b = banners[i % banners.length];
  return (
    <div className="relative mx-4 overflow-hidden bg-ink text-ivory">
      {b.image && <img src={assetUrl(b.image)} alt="" className="absolute inset-0 h-full w-full object-cover opacity-60" />}
      <div className="absolute -right-16 -top-16 h-56 w-56 rounded-full border border-champagne/30" />
      <div className="absolute -right-6 -top-6 h-36 w-36 rounded-full border border-champagne/20" />
      <div key={i} className="fade-up relative flex min-h-[220px] flex-col justify-end p-6">
        <p className="eyebrow text-champagne">{settings?.shopName}</p>
        <h2 className="mt-2 max-w-[16ch] text-4xl font-medium leading-[1.05]">{b.title}</h2>
        {b.subtitle && <p className="mt-2 text-sm text-ivory/70">{b.subtitle}</p>}
        {b.link && <Link to={b.link} className="btn-gold mt-5 w-fit">{b.cta || 'Shop now'}</Link>}
      </div>
      {banners.length > 1 && (
        <div className="absolute bottom-4 right-5 flex gap-1.5">
          {banners.map((_, k) => (
            <button key={k} onClick={() => setI(k)} aria-label={`Show banner ${k + 1}`} className={`h-1 transition-all duration-500 ${k === i ? 'w-6 bg-champagne' : 'w-2 bg-ivory/40'}`} />
          ))}
        </div>
      )}
    </div>
  );
}

export default function Home() {
  const { settings, settingsError, reloadSettings, unread } = useStore();
  const navigate = useNavigate();
  const [q, setQ] = useState('');
  const cats = useLoad(() => api<Category[]>('/categories'), []);

  if (!settings && settingsError) return <ErrorState message={settingsError} onRetry={reloadSettings} />;

  return (
    <div>
      <header className="sticky top-0 z-30 bg-ivory/90 backdrop-blur">
        <div className="flex h-16 items-center justify-between px-4">
          <span className="w-10" />
          <Link to="/" className="text-center">
            {settings?.logoUrl ? (
              <img src={assetUrl(settings.logoUrl)} alt={settings.shopName} className="h-10" />
            ) : (
              <span className="block font-display text-[26px] font-semibold uppercase leading-none tracking-[0.22em]">{settings?.shopName || ' '}</span>
            )}
          </Link>
          <Link to="/notifications" className="relative grid h-10 w-10 place-items-center" aria-label={`Notifications${unread ? `, ${unread} unread` : ''}`}>
            <Icon name="bell" className="text-[22px]" />
            {unread > 0 && <span className="absolute right-2 top-2 h-2 w-2 rounded-full bg-champagne" />}
          </Link>
        </div>
        <form className="px-4 pb-3" role="search" onSubmit={(e) => { e.preventDefault(); if (q.trim()) navigate(`/search?q=${encodeURIComponent(q.trim())}`); }}>
          <label className="flex items-center gap-3 border border-sand bg-white/70 px-4 focus-within:border-champagne">
            <Icon name="search" className="text-muted" />
            <input type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search earrings, bangles, sets…" aria-label="Search jewellery" className="border-0 py-3" />
          </label>
        </form>
      </header>

      <Banners />

      {settings?.upiEnabled && settings.upiDiscountPercent > 0 && (
        <div className="mx-4 mt-4 flex items-center gap-4 border border-champagne/50 bg-gradient-to-r from-champagne-light/70 to-ivory p-4">
          <div className="grid h-12 w-12 shrink-0 place-items-center rounded-full bg-ink font-display text-lg font-semibold text-champagne">{settings.upiDiscountPercent}%</div>
          <div>
            <p className="font-display text-xl leading-tight">Pay via UPI & save {settings.upiDiscountPercent}%</p>
            <p className="text-xs text-muted">Instant discount at checkout with Google Pay, PhonePe, Paytm or any UPI app.</p>
          </div>
        </div>
      )}

      <section className="pt-8">
        <SectionTitle eyebrow="Explore" title="Shop by Category" to="/categories" />
        <div className="no-scrollbar flex gap-4 overflow-x-auto px-4 pb-2 pt-1">
          {cats.loading && !cats.data
            ? Array.from({ length: 5 }, (_, i) => <Skeleton key={i} className="h-20 w-20 shrink-0 rounded-full" />)
            : cats.data?.map((c) => (
                <Link key={c.slug} to={`/category/${c.slug}`} className="flex w-20 shrink-0 flex-col items-center gap-2 text-center">
                  <Img src={c.imageUrl} alt="" className="h-20 w-20 rounded-full ring-1 ring-champagne/40 ring-offset-2 ring-offset-ivory" />
                  <span className="text-[11px] leading-tight tracking-wide">{c.name}</span>
                </Link>
              ))}
        </div>
      </section>

      <Collection id="new" />
      <Collection id="trending" />
      <Collection id="best-sellers" />
      <Collection id="featured" />
      <Collection id="offers" />

      {settings?.whatsappNumber && (
        <section className="mx-4 my-8 bg-cream p-6 text-center">
          <p className="eyebrow">Personal assistance</p>
          <h2 className="mt-1 text-2xl">Need help choosing?</h2>
          <p className="mx-auto mt-2 max-w-xs text-sm text-muted">Message us for more photos, styling advice or a quick video call before you order.</p>
          <a href={waLink(settings.whatsappNumber, `Hello ${settings.shopName}, I'd like help choosing jewellery.`)} target="_blank" rel="noreferrer" className="btn-dark mt-5">
            <WhatsAppIcon /> Chat on WhatsApp
          </a>
        </section>
      )}
    </div>
  );
}

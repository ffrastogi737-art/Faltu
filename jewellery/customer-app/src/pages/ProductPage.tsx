import { useRef, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { Icon, WhatsAppIcon } from '../components/Icon';
import { PolicyNote } from '../components/PolicyNote';
import { ProductRail } from '../components/ProductCard';
import { ErrorState, Img, PageHeader, Price, SectionTitle, Skeleton } from '../components/ui';
import { api, assetUrl } from '../lib/api';
import { rupees, waLink } from '../lib/format';
import { useLoad, useStore } from '../lib/store';
import type { ProductDetail } from '../lib/types';

function videoEmbed(url: string) {
  const yt = /(?:youtube\.com\/(?:watch\?v=|shorts\/)|youtu\.be\/)([\w-]{11})/.exec(url);
  return yt ? `https://www.youtube-nocookie.com/embed/${yt[1]}` : null;
}

function Gallery({ p }: { p: ProductDetail }) {
  const ref = useRef<HTMLDivElement>(null);
  const [active, setActive] = useState(0);
  const slides = [...p.images.map((src) => ({ kind: 'img' as const, src })), ...(p.videoUrl ? [{ kind: 'video' as const, src: p.videoUrl }] : [])];
  if (!slides.length) slides.push({ kind: 'img', src: '' });
  const go = (i: number) => ref.current?.scrollTo({ left: i * ref.current.clientWidth, behavior: 'smooth' });
  return (
    <div>
      <div ref={ref} className="no-scrollbar flex snap-x snap-mandatory overflow-x-auto"
        onScroll={(e) => setActive(Math.round(e.currentTarget.scrollLeft / e.currentTarget.clientWidth))}>
        {slides.map((s, i) => (
          <div key={i} className="aspect-square w-full shrink-0 snap-center bg-cream sm:aspect-[4/3]">
            {s.kind === 'img' ? (
              <Img src={s.src} alt={`${p.name} – view ${i + 1}`} eager={i === 0} className="h-full w-full" />
            ) : videoEmbed(s.src) ? (
              <iframe src={videoEmbed(s.src)!} title={`${p.name} video`} className="h-full w-full" allow="encrypted-media; picture-in-picture" allowFullScreen loading="lazy" />
            ) : (
              <video src={assetUrl(s.src)} controls playsInline preload="metadata" poster={assetUrl(p.images[0])} className="h-full w-full object-contain" />
            )}
          </div>
        ))}
      </div>
      {slides.length > 1 && (
        <div className="no-scrollbar flex gap-2 overflow-x-auto px-4 pt-3">
          {slides.map((s, i) => (
            <button key={i} onClick={() => go(i)} aria-label={s.kind === 'video' ? 'Play video' : `Show image ${i + 1}`}
              className={`relative h-14 w-14 shrink-0 border transition ${i === active ? 'border-champagne' : 'border-transparent opacity-60'}`}>
              {s.kind === 'img' ? <Img src={s.src} alt="" className="h-full w-full" /> : <span className="grid h-full w-full place-items-center bg-ink text-[10px] uppercase tracking-widest text-champagne">▶ Video</span>}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

export default function ProductPage() {
  const { slug } = useParams();
  const navigate = useNavigate();
  const { settings, addToCart, cart, wishlist, toggleWishlist, notify } = useStore();
  const { data: p, error, loading, reload } = useLoad(() => api<ProductDetail>(`/products/${slug}`), [slug]);
  const [qty, setQty] = useState(1);

  if (error && !p) return (<><PageHeader title="Product" /><ErrorState message={error} onRetry={reload} /></>);
  if (loading || !p) return (
    <div><PageHeader title="" /><Skeleton className="aspect-square w-full" /><div className="space-y-3 p-4"><Skeleton className="h-8 w-2/3" /><Skeleton className="h-6 w-1/3" /></div></div>
  );

  const inCart = cart.find((i) => i.productId === p.id)?.quantity || 0;
  const maxQty = Math.max(0, p.stock - inCart);
  const saved = wishlist.has(p.id);
  const url = `${location.origin}/product/${p.slug}`;
  const upiPrice = settings?.upiEnabled && settings.upiDiscountPercent > 0 ? Math.round(p.sellingPricePaise * (1 - settings.upiDiscountPercent / 100)) : null;

  async function shareLink() {
    const data = { title: p!.name, text: `${p!.name} – ${rupees(p!.sellingPricePaise)}`, url };
    if (navigator.share) {
      try { await navigator.share(data); } catch { /* user closed the share sheet */ }
    } else {
      await navigator.clipboard?.writeText(url).then(() => notify('Link copied'), () => notify(url));
    }
  }

  return (
    <div className="pb-24">
      <PageHeader title="" right={
        <button onClick={shareLink} className="grid h-10 w-10 place-items-center" aria-label="Share product link"><Icon name="share" /></button>
      } />
      <Gallery p={p} />

      <div className="fade-up space-y-5 px-4 pt-5">
        <div>
          {p.category && <Link to={`/category/${p.category.slug}`} className="eyebrow">{p.category.name}</Link>}
          <h1 className="mt-1 text-[32px] font-medium leading-tight">{p.name}</h1>
          <p className="mt-1 text-xs tracking-wider text-muted">SKU {p.sku}</p>
        </div>
        <div>
          <Price size="lg" selling={p.sellingPricePaise} original={p.originalPricePaise} />
          <p className="text-xs text-muted">Inclusive of all taxes</p>
          {upiPrice !== null && (
            <p className="mt-2 inline-flex items-center gap-2 bg-champagne-light/60 px-3 py-1.5 text-[13px]">
              <Icon name="spark" className="text-champagne-dark" /> {rupees(upiPrice)} when you pay via UPI ({settings!.upiDiscountPercent}% off)
            </p>
          )}
        </div>
        <p className={`text-sm font-medium ${p.stock === 0 ? 'text-ruby' : p.stock <= 3 ? 'text-champagne-dark' : 'text-jade'}`}>
          {p.stock === 0 ? 'Out of stock' : p.stock <= 3 ? `Only ${p.stock} left` : 'In stock'}
        </p>

        <div className="flex gap-3">
          {settings?.whatsappNumber && (
            <a href={waLink(settings.whatsappNumber, `Hello! I'm interested in ${p.name} (SKU ${p.sku}) – ${url}`)} target="_blank" rel="noreferrer" className="btn-line flex-1 px-3 text-[11px]">
              <WhatsAppIcon /> Ask the shop
            </a>
          )}
          <a href={`https://wa.me/?text=${encodeURIComponent(`Look at this: ${p.name} – ${rupees(p.sellingPricePaise)}\n${url}`)}`} target="_blank" rel="noreferrer" className="btn-line flex-1 px-3 text-[11px]">
            <Icon name="share" /> Share on WhatsApp
          </a>
        </div>

        {p.description && (
          <section>
            <h2 className="mb-2 text-xl">Description</h2>
            <p className="whitespace-pre-line text-[15px] leading-relaxed text-ink/80">{p.description}</p>
          </section>
        )}
        {Object.keys(p.specifications || {}).length > 0 && (
          <section>
            <h2 className="mb-2 text-xl">Specifications</h2>
            <dl className="divide-y divide-sand/70 border-y border-sand/70 text-sm">
              {Object.entries(p.specifications).map(([k, v]) => (
                <div key={k} className="grid grid-cols-[38%_1fr] gap-3 py-2.5"><dt className="text-muted">{k}</dt><dd>{String(v)}</dd></div>
              ))}
            </dl>
          </section>
        )}
        <PolicyNote compact />
      </div>

      {p.related.length > 0 && (
        <section className="pt-10">
          <SectionTitle eyebrow="You may also like" title="Related Jewellery" />
          <ProductRail items={p.related} />
        </section>
      )}

      <div className="fixed inset-x-0 bottom-[calc(4.1rem+env(safe-area-inset-bottom))] z-30 mx-auto flex max-w-3xl items-center gap-3 border-t border-sand/70 bg-ivory/95 p-3 backdrop-blur">
        <button onClick={() => toggleWishlist(p)} aria-pressed={saved} aria-label={saved ? 'Remove from wishlist' : 'Add to wishlist'} className="grid h-12 w-12 shrink-0 place-items-center border border-sand">
          <Icon name="heart" filled={saved} className={saved ? 'text-ruby' : ''} />
        </button>
        {p.stock > 0 && (
          <div className="flex h-12 items-center border border-sand">
            <button onClick={() => setQty(Math.max(1, qty - 1))} className="grid h-full w-9 place-items-center" aria-label="Decrease quantity"><Icon name="minus" /></button>
            <span className="w-6 text-center text-sm" aria-live="polite">{qty}</span>
            <button onClick={() => setQty(Math.min(maxQty || 1, qty + 1))} className="grid h-full w-9 place-items-center" aria-label="Increase quantity"><Icon name="plus" /></button>
          </div>
        )}
        <button
          disabled={p.stock === 0 || maxQty === 0}
          onClick={() => { addToCart(p, Math.min(qty, maxQty)); notify('Added to cart'); setQty(1); }}
          className="btn-dark h-12 flex-1 px-3">
          {p.stock === 0 ? 'Sold out' : maxQty === 0 ? 'All stock in cart' : 'Add to cart'}
        </button>
        {inCart > 0 && <button onClick={() => navigate('/cart')} className="btn-gold h-12 px-4" aria-label="Go to cart"><Icon name="bag" /></button>}
      </div>
    </div>
  );
}

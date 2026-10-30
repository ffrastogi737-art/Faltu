import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Icon } from '../components/Icon';
import { Empty, Img, PageHeader, Spinner } from '../components/ui';
import { api } from '../lib/api';
import { rupees } from '../lib/format';
import { useStore } from '../lib/store';
import type { Quote } from '../lib/types';

export function useQuote() {
  const { cart } = useStore();
  const [quote, setQuote] = useState<Quote | null>(null);
  const [error, setError] = useState<string | null>(null);
  const key = JSON.stringify(cart.map((i) => [i.productId, i.quantity]));
  const [tick, setTick] = useState(0);
  useEffect(() => {
    if (!cart.length) return setQuote(null);
    let live = true;
    const t = setTimeout(() => {
      api<Quote>('/cart/quote', { method: 'POST', body: { items: cart.map((i) => ({ productId: i.productId, quantity: i.quantity })) }, retries: 2 })
        .then((q) => { if (live) { setQuote(q); setError(null); } })
        .catch((e) => { if (live) setError(e.message); });
    }, 250);
    return () => { live = false; clearTimeout(t); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, tick]);
  return { quote, error, retry: () => setTick((x) => x + 1) };
}

export function TotalsRows({ t, showUpi = true }: { t: Quote['cod']; showUpi?: boolean }) {
  return (
    <dl className="space-y-2 text-sm">
      <div className="flex justify-between"><dt className="text-muted">Subtotal (MRP)</dt><dd>{rupees(t.subtotalPaise)}</dd></div>
      {t.productDiscountPaise > 0 && <div className="flex justify-between text-jade"><dt>Product discount</dt><dd>− {rupees(t.productDiscountPaise)}</dd></div>}
      {showUpi && t.upiDiscountPaise > 0 && <div className="flex justify-between text-jade"><dt>UPI discount ({t.upiDiscountPercent}%)</dt><dd>− {rupees(t.upiDiscountPaise)}</dd></div>}
      <div className="flex justify-between"><dt className="text-muted">Delivery</dt><dd>{t.deliveryChargePaise ? rupees(t.deliveryChargePaise) : 'Free'}</dd></div>
      <div className="gold-rule my-3" />
      <div className="flex items-baseline justify-between"><dt className="font-medium">Final amount</dt><dd className="font-display text-2xl font-semibold">{rupees(t.totalPaise)}</dd></div>
    </dl>
  );
}

export default function Cart() {
  const { cart, setQuantity, removeFromCart, settings } = useStore();
  const { quote, error, retry } = useQuote();
  const navigate = useNavigate();
  if (!cart.length) {
    return (<><PageHeader title="Cart" back={false} /><Empty icon="bag" title="Your cart is empty" body="Pieces you add will wait for you here." action={<Link to="/" className="btn-dark">Start shopping</Link>} /></>);
  }
  const problem = (id: number) => quote?.problems.find((p) => p.productId === id);
  const line = (id: number) => quote?.lines.find((l) => l.productId === id);
  const freeGap = settings && settings.freeDeliveryMinPaise > 0 && quote && quote.cod.deliveryChargePaise > 0
    ? settings.freeDeliveryMinPaise - (quote.cod.subtotalPaise - quote.cod.productDiscountPaise) : 0;

  return (
    <div>
      <PageHeader title={`Cart (${cart.reduce((n, i) => n + i.quantity, 0)})`} back={false} />
      <ul className="divide-y divide-sand/70 px-4">
        {cart.map((i) => {
          const l = line(i.productId);
          const pr = problem(i.productId);
          const price = l?.unitPricePaise ?? i.pricePaise;
          return (
            <li key={i.productId} className="flex gap-4 py-5">
              <Link to={`/product/${i.slug}`}><Img src={l?.imageUrl ?? i.imageUrl} alt={i.name} className="h-28 w-24 shrink-0" /></Link>
              <div className="flex min-w-0 flex-1 flex-col">
                <Link to={`/product/${i.slug}`} className="truncate font-display text-lg leading-tight">{l?.name ?? i.name}</Link>
                <p className="text-sm">{rupees(price)} {(l?.unitOriginalPaise ?? i.originalPaise) > price && <span className="text-xs text-muted line-through">{rupees(l?.unitOriginalPaise ?? i.originalPaise)}</span>}</p>
                {pr && (
                  <p className="mt-1 text-xs text-ruby" role="alert">
                    {pr.issue === 'unavailable' ? 'No longer available' : pr.available === 0 ? 'Out of stock' : `Only ${pr.available} available`}
                    {pr.available > 0 && <button className="ml-2 underline" onClick={() => setQuantity(i.productId, pr.available)}>Update</button>}
                  </p>
                )}
                <div className="mt-auto flex items-center justify-between pt-2">
                  <div className="flex h-9 items-center border border-sand">
                    <button onClick={() => setQuantity(i.productId, i.quantity - 1)} disabled={i.quantity <= 1} className="grid h-full w-9 place-items-center disabled:opacity-30" aria-label="Decrease quantity"><Icon name="minus" /></button>
                    <span className="w-6 text-center text-sm">{i.quantity}</span>
                    <button onClick={() => setQuantity(i.productId, i.quantity + 1)} disabled={l ? i.quantity >= l.stock : false} className="grid h-full w-9 place-items-center disabled:opacity-30" aria-label="Increase quantity"><Icon name="plus" /></button>
                  </div>
                  <button onClick={() => removeFromCart(i.productId)} className="flex items-center gap-1 text-xs text-muted" aria-label={`Remove ${i.name}`}><Icon name="trash" /> Remove</button>
                </div>
              </div>
            </li>
          );
        })}
      </ul>

      <div className="m-4 card p-5">
        {error && !quote ? (
          <p className="text-sm text-muted">{error} <button onClick={retry} className="underline">Retry</button></p>
        ) : !quote ? (
          <div className="py-6 text-center text-champagne"><Spinner /></div>
        ) : (
          <>
            <TotalsRows t={quote.cod} />
            {freeGap > 0 && <p className="mt-3 text-xs text-muted">Add {rupees(freeGap)} more for free delivery.</p>}
            {quote.upi.upiDiscountPaise > 0 && settings?.upiEnabled && (
              <p className="mt-3 bg-champagne-light/60 px-3 py-2 text-[13px]">Pay via UPI at checkout and pay <b>{rupees(quote.upi.totalPaise)}</b> – save {rupees(quote.upi.upiDiscountPaise)} more.</p>
            )}
          </>
        )}
      </div>
      <div className="px-4 pb-8">
        <button disabled={!quote || quote.problems.length > 0} onClick={() => navigate('/checkout')} className="btn-dark w-full">
          {quote?.problems.length ? 'Fix the items above to continue' : 'Proceed to checkout'}
        </button>
      </div>
    </div>
  );
}

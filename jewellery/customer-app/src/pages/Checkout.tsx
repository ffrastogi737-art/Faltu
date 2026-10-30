import { useEffect, useState } from 'react';
import { Link, Navigate, useNavigate } from 'react-router-dom';
import { AddressFields, EMPTY_ADDRESS } from '../components/AddressForm';
import { Icon } from '../components/Icon';
import { PolicyNote } from '../components/PolicyNote';
import { Img, PageHeader, Spinner } from '../components/ui';
import { api, ApiError } from '../lib/api';
import { rupees } from '../lib/format';
import { useLoad, useStore } from '../lib/store';
import type { Address, Order } from '../lib/types';
import { TotalsRows, useQuote } from './Cart';

export default function Checkout() {
  const { cart, customer, settings, clearCart, addGuestOrder, notify } = useStore();
  const { quote, error: quoteError, retry } = useQuote();
  const navigate = useNavigate();
  const saved = useLoad(() => (customer ? api<Address[]>('/me/addresses') : Promise.resolve([])), [customer?.id]);
  const [addressId, setAddressId] = useState<number | 'new'>('new');
  const [addr, setAddr] = useState<Address>({ ...EMPTY_ADDRESS, name: customer?.name || '', mobile: customer?.mobile || '' });
  const [instructions, setInstructions] = useState('');
  const [saveAddr, setSaveAddr] = useState(true);
  const [method, setMethod] = useState<'upi' | 'cod' | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const first = saved.data?.[0];
    if (first?.id) setAddressId(first.id);
  }, [saved.data]);
  useEffect(() => {
    if (!settings || method) return;
    setMethod(settings.upiEnabled ? 'upi' : settings.codEnabled ? 'cod' : null);
  }, [settings, method]);

  if (!cart.length && !submitting) return <Navigate to="/cart" replace />;
  const totals = quote && method ? quote[method] : null;
  const chosen = addressId === 'new' ? addr : saved.data?.find((a) => a.id === addressId) || addr;

  async function placeOrder(e: React.FormEvent) {
    e.preventDefault();
    if (!method || !totals || submitting) return;
    setSubmitting(true);
    setError(null);
    try {
      const order = await api<Order>('/orders', {
        method: 'POST',
        body: {
          items: cart.map((i) => ({ productId: i.productId, quantity: i.quantity })),
          paymentMethod: method,
          contact: { name: chosen.name, mobile: chosen.mobile },
          address: chosen,
          deliveryInstructions: instructions,
          saveAddress: Boolean(customer && addressId === 'new' && saveAddr),
          expectedTotalPaise: totals.totalPaise,
        },
      });
      if (order.guestToken) addGuestOrder({ orderNumber: order.orderNumber, guestToken: order.guestToken });
      clearCart();
      navigate(`/orders/${order.orderNumber}?placed=1`, { replace: true });
    } catch (err) {
      const ae = err as ApiError;
      setSubmitting(false);
      if (ae.body?.code === 'PRICE_CHANGED') {
        retry();
        notify('Prices were updated. Please review the new total.');
      } else if (ae.body?.problems?.length) {
        notify(ae.message);
        navigate('/cart');
      } else setError(ae.message);
    }
  }

  return (
    <form onSubmit={placeOrder} className="pb-10">
      <PageHeader title="Checkout" />
      {!customer && (
        <div className="m-4 flex items-center justify-between gap-3 bg-cream p-4 text-sm">
          <span>Checking out as a guest. <span className="text-muted">Log in to save addresses and track orders anywhere.</span></span>
          <Link to="/login?next=/checkout" className="btn-line shrink-0 px-4 py-2 text-[11px]">Log in</Link>
        </div>
      )}

      <section className="px-4 pt-4">
        <p className="eyebrow">Step 1</p>
        <h2 className="mb-4 text-2xl">Delivery details</h2>
        {saved.data && saved.data.length > 0 && (
          <div className="mb-5 space-y-2">
            {saved.data.map((a) => (
              <label key={a.id} className={`flex cursor-pointer gap-3 border p-3 text-sm transition ${addressId === a.id ? 'border-champagne bg-champagne-light/30' : 'border-sand'}`}>
                <input type="radio" name="addr" checked={addressId === a.id} onChange={() => setAddressId(a.id!)} className="mt-1 h-4 w-4 accent-champagne-dark" />
                <span><b className="font-medium">{a.name}</b> · {a.mobile}<br /><span className="text-muted">{[a.house, a.street, a.area, a.city, a.state, a.pincode].filter(Boolean).join(', ')}</span></span>
              </label>
            ))}
            <label className={`flex cursor-pointer gap-3 border p-3 text-sm ${addressId === 'new' ? 'border-champagne bg-champagne-light/30' : 'border-sand'}`}>
              <input type="radio" name="addr" checked={addressId === 'new'} onChange={() => setAddressId('new')} className="h-4 w-4 accent-champagne-dark" /> Deliver to a new address
            </label>
          </div>
        )}
        {addressId === 'new' && (
          <>
            <AddressFields value={addr} onChange={setAddr} />
            {customer && (
              <label className="mt-4 flex items-center gap-2 text-sm"><input type="checkbox" checked={saveAddr} onChange={(e) => setSaveAddr(e.target.checked)} className="h-4 w-4 accent-champagne-dark" /> Save this address</label>
            )}
          </>
        )}
        <label className="mt-5 block">
          <span className="label">Delivery instructions (optional)</span>
          <textarea rows={2} maxLength={300} value={instructions} onChange={(e) => setInstructions(e.target.value)} placeholder="e.g. Call before arriving, leave with the guard" />
        </label>
      </section>

      <section className="px-4 pt-10">
        <p className="eyebrow">Step 2</p>
        <h2 className="mb-4 text-2xl">Payment</h2>
        <div className="grid gap-3" role="radiogroup" aria-label="Payment method">
          {settings?.upiEnabled && (
            <label className={`relative cursor-pointer border p-4 transition ${method === 'upi' ? 'border-champagne bg-champagne-light/40 shadow-[0_0_0_1px_var(--color-champagne)]' : 'border-sand bg-white/50'}`}>
              <input type="radio" name="method" value="upi" checked={method === 'upi'} onChange={() => setMethod('upi')} className="sr-only" />
              {settings.upiDiscountPercent > 0 && <span className="absolute -top-2.5 right-3 bg-ink px-2 py-0.5 text-[10px] uppercase tracking-[0.15em] text-champagne">Best value</span>}
              <div className="flex items-start gap-3">
                <span className={`mt-1 grid h-5 w-5 shrink-0 place-items-center rounded-full border ${method === 'upi' ? 'border-champagne-dark bg-champagne-dark text-ivory' : 'border-sand'}`}>{method === 'upi' && <Icon name="check" className="text-xs" />}</span>
                <div className="flex-1">
                  <p className="font-display text-xl leading-tight">UPI Payment</p>
                  <p className="text-sm font-medium text-champagne-dark">{settings.upiDiscountPercent > 0 ? `Pay Online & Save ${settings.upiDiscountPercent}%` : 'Pay online instantly'}</p>
                  <p className="mt-1 text-xs text-muted">Google Pay · PhonePe · Paytm · any UPI app</p>
                </div>
                {quote && <div className="text-right"><p className="font-semibold">{rupees(quote.upi.totalPaise)}</p>{quote.upi.upiDiscountPaise > 0 && <p className="text-xs text-jade">Save {rupees(quote.upi.upiDiscountPaise)}</p>}</div>}
              </div>
            </label>
          )}
          {settings?.codEnabled && (
            <label className={`cursor-pointer border p-4 transition ${method === 'cod' ? 'border-champagne bg-champagne-light/40 shadow-[0_0_0_1px_var(--color-champagne)]' : 'border-sand bg-white/50'}`}>
              <input type="radio" name="method" value="cod" checked={method === 'cod'} onChange={() => setMethod('cod')} className="sr-only" />
              <div className="flex items-start gap-3">
                <span className={`mt-1 grid h-5 w-5 shrink-0 place-items-center rounded-full border ${method === 'cod' ? 'border-champagne-dark bg-champagne-dark text-ivory' : 'border-sand'}`}>{method === 'cod' && <Icon name="check" className="text-xs" />}</span>
                <div className="flex-1">
                  <p className="font-display text-xl leading-tight">Cash on Delivery</p>
                  <p className="text-sm font-medium text-muted">Pay When Your Order Arrives</p>
                </div>
                {quote && <p className="font-semibold">{rupees(quote.cod.totalPaise)}</p>}
              </div>
            </label>
          )}
          {settings && !settings.upiEnabled && !settings.codEnabled && <p className="text-sm text-ruby">The shop is not accepting orders right now. Please contact them on WhatsApp.</p>}
        </div>
      </section>

      <section className="px-4 pt-10">
        <h2 className="mb-4 text-2xl">Order summary</h2>
        <ul className="mb-5 space-y-3">
          {(quote?.lines || []).map((l) => (
            <li key={l.productId} className="flex items-center gap-3 text-sm">
              <Img src={l.imageUrl} alt="" className="h-14 w-12 shrink-0" />
              <span className="flex-1"><span className="block truncate">{l.name}</span><span className="text-xs text-muted">Qty {l.quantity} × {rupees(l.unitPricePaise)}</span></span>
              <span>{rupees(l.unitPricePaise * l.quantity)}</span>
            </li>
          ))}
        </ul>
        <div className="card p-5">
          {totals ? <TotalsRows t={totals} /> : quoteError ? <p className="text-sm text-muted">{quoteError} <button type="button" onClick={retry} className="underline">Retry</button></p> : <div className="text-center text-champagne"><Spinner /></div>}
          {method === 'cod' && totals && <p className="mt-3 text-xs text-muted">Please keep {rupees(totals.totalPaise)} ready in cash when your order arrives.</p>}
          {method === 'upi' && <p className="mt-3 text-xs text-muted">After placing the order you will be taken to your UPI app to pay the exact amount. We confirm your order once the shop verifies the payment.</p>}
        </div>
        <div className="mt-5"><PolicyNote /></div>
        {error && <p className="mt-4 text-sm text-ruby" role="alert">{error}</p>}
        {quote?.problems.length ? <p className="mt-4 text-sm text-ruby">Some items are out of stock. <Link to="/cart" className="underline">Review cart</Link></p> : null}
        <button type="submit" disabled={!totals || !method || submitting || Boolean(quote?.problems.length)} className="btn-dark mt-5 w-full">
          {submitting ? <Spinner /> : totals ? `Place order · ${rupees(totals.totalPaise)}` : 'Place order'}
        </button>
      </section>
    </form>
  );
}

import { useEffect, useState } from 'react';
import { Link, useParams, useSearchParams } from 'react-router-dom';
import { Icon, WhatsAppIcon } from '../components/Icon';
import { PaymentBadge, StatusBadge } from '../components/OrderBits';
import { PolicyNote } from '../components/PolicyNote';
import { ErrorState, Img, PageHeader, Skeleton, Spinner } from '../components/ui';
import { api } from '../lib/api';
import { countdown, dateTime, ISSUES, ORDER_FLOW, ORDER_STATUS, REPLACEMENT_STATUS, rupees, waLink } from '../lib/format';
import { useLoad, useStore } from '../lib/store';
import type { Order } from '../lib/types';
import { TotalsRows } from './Cart';

export function useNow(intervalMs: number) {
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), intervalMs);
    return () => clearInterval(t);
  }, [intervalMs]);
  return now;
}

function Timeline({ o }: { o: Order }) {
  const at = new Map(o.timeline.map((t) => [t.status, t.at]));
  const reached = ORDER_FLOW.indexOf(o.status);
  const steps = o.status === 'cancelled' ? [...ORDER_FLOW.filter((s) => at.has(s)), 'cancelled' as const] : ORDER_FLOW;
  return (
    <ol className="relative ml-2 border-l border-sand pl-6">
      {steps.map((s, i) => {
        const done = o.status === 'cancelled' ? true : i <= reached;
        const current = s === o.status;
        return (
          <li key={s} className="relative pb-5 last:pb-0">
            <span className={`absolute -left-[31px] top-0.5 grid h-3.5 w-3.5 place-items-center rounded-full border-2 ${
              s === 'cancelled' ? 'border-ruby bg-ruby' : done ? 'border-champagne bg-champagne' : 'border-sand bg-ivory'} ${current ? 'ring-4 ring-champagne/25' : ''}`} />
            <p className={`text-sm ${done ? 'font-medium' : 'text-muted'}`}>{ORDER_STATUS[s]}</p>
            {at.get(s) && <p className="text-xs text-muted">{dateTime(at.get(s)!)}</p>}
          </li>
        );
      })}
    </ol>
  );
}

function UpiPanel({ o, headers, onChange }: { o: Order; headers: Record<string, string>; onChange: (o: Order) => void }) {
  const { settings, notify } = useStore();
  const [opened, setOpened] = useState(false);
  const [ref, setRef] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const upiId = o.upiLink ? new URL(o.upiLink.replace('upi://', 'https://x/')).searchParams.get('pa') : null;

  async function confirm(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setErr(null);
    try {
      onChange(await api<Order>(`/orders/${o.orderNumber}/payment-confirmation`, { method: 'POST', body: { reference: ref }, headers }));
      notify('Thanks! The shop will verify your payment shortly.');
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="card m-4 p-5">
      <div className="flex items-center justify-between"><h2 className="text-xl">UPI payment</h2><PaymentBadge method="upi" status={o.paymentStatus} /></div>
      {o.paymentStatus === 'verified' && <p className="mt-2 text-sm text-jade">We have received {rupees(o.totals.totalPaise)}. Thank you!</p>}
      {o.paymentStatus === 'verification_pending' && (
        <p className="mt-2 text-sm text-muted">You told us you've paid{o.paymentReference ? ` (ref ${o.paymentReference})` : ''}. The shop is matching it with their bank and will confirm shortly.</p>
      )}
      {o.paymentStatus === 'failed' && <p className="mt-2 text-sm text-ruby">The shop could not find this payment. Please pay again below or contact us on WhatsApp.</p>}
      {o.upiLink && (
        <>
          <p className="mt-3 text-sm">Amount to pay: <b className="font-display text-2xl">{rupees(o.totals.totalPaise)}</b></p>
          <a href={o.upiLink} onClick={() => setOpened(true)} className="btn-gold mt-4 w-full">Pay {rupees(o.totals.totalPaise)} with UPI app</a>
          <p className="mt-2 text-center text-xs text-muted">Opens Google Pay, PhonePe, Paytm or any UPI app on this phone. Never share your UPI PIN with anyone.</p>
          {upiId && (
            <p className="mt-3 text-center text-xs leading-relaxed text-muted">
              On another device? Pay to <b className="text-ink">{upiId}</b>{' '}
              <button type="button" onClick={() => navigator.clipboard?.writeText(upiId).then(() => notify('UPI ID copied'))} aria-label="Copy UPI ID" className="align-middle"><Icon name="copy" /></button>{' '}
              with note <b className="text-ink">{o.orderNumber}</b>
            </p>
          )}
          <form onSubmit={confirm} className={`mt-5 border-t border-sand pt-4 ${opened || o.paymentStatus === 'failed' ? '' : 'opacity-80'}`}>
            <p className="text-sm font-medium">Already paid?</p>
            <label className="mt-2 block">
              <span className="label">UPI reference / UTR (optional, helps us verify faster)</span>
              <input value={ref} onChange={(e) => setRef(e.target.value.replace(/\s/g, ''))} inputMode="text" maxLength={35} placeholder="12-digit UTR from your UPI app" />
            </label>
            {err && <p className="mt-2 text-xs text-ruby">{err}</p>}
            <button disabled={busy} className="btn-dark mt-4 w-full">{busy ? <Spinner /> : 'I have completed the payment'}</button>
          </form>
        </>
      )}
      {settings?.whatsappNumber && o.paymentStatus !== 'verified' && (
        <a href={waLink(settings.whatsappNumber, `Hello, I need help with the UPI payment for order ${o.orderNumber} (${rupees(o.totals.totalPaise)}).`)} target="_blank" rel="noreferrer" className="mt-3 flex items-center justify-center gap-2 text-xs underline"><WhatsAppIcon /> Payment help</a>
      )}
    </section>
  );
}

export default function OrderPage() {
  const { number = '' } = useParams();
  const [params] = useSearchParams();
  const { guestToken, settings, notify } = useStore();
  const gt = guestToken(number);
  const headers: Record<string, string> = gt ? { 'x-guest-token': gt } : {};
  const { data: o, error, loading, reload, setData } = useLoad(() => api<Order>(`/orders/${number}`, { headers }), [number, gt]);
  const [cancelling, setCancelling] = useState(false);
  const now = useNow(1000);

  useEffect(() => {
    window.addEventListener('order:update', reload);
    // guests have no live channel; poll as a fallback for everyone
    const t = setInterval(reload, 30e3);
    return () => { window.removeEventListener('order:update', reload); clearInterval(t); };
  }, [reload]);

  if (error && !o) return (<><PageHeader title={`Order #${number}`} /><ErrorState message={error} onRetry={reload} /></>);
  if (loading && !o) return (<><PageHeader title={`Order #${number}`} /><div className="space-y-3 p-4"><Skeleton className="h-32" /><Skeleton className="h-48" /></div></>);
  if (!o) return null;

  const deadline = o.replacementDeadline ? new Date(o.replacementDeadline).getTime() : 0;
  const left = deadline - now;
  const requestedItems = new Set(o.replacements.map((r) => r.orderItemId));
  const canReplace = o.status === 'delivered' && left > 0 && o.items.some((i) => !requestedItems.has(i.id));

  async function cancel() {
    const reason = prompt('Cancel this order? You can tell us why (optional):');
    if (reason === null) return;
    setCancelling(true);
    try {
      setData(await api<Order>(`/orders/${o!.orderNumber}/cancel`, { method: 'POST', body: { reason }, headers }));
      notify('Order cancelled');
    } catch (e) {
      notify((e as Error).message);
    } finally {
      setCancelling(false);
    }
  }

  return (
    <div className="pb-10">
      <PageHeader title={`Order #${o.orderNumber}`} />

      {params.get('placed') && (
        <div className="fade-up m-4 bg-ink p-6 text-center text-ivory">
          <div className="mx-auto mb-3 grid h-12 w-12 place-items-center rounded-full border border-champagne text-champagne"><Icon name="check" className="text-2xl" /></div>
          <h2 className="text-3xl">Thank you{o.contact.name ? `, ${o.contact.name.split(' ')[0]}` : ''}!</h2>
          <p className="mt-1 text-sm text-ivory/70">Your order #{o.orderNumber} has been placed.</p>
          {o.paymentMethod === 'upi' && o.upiLink && <p className="mt-3 text-sm text-champagne">Complete your UPI payment below to confirm it.</p>}
          {gt && <p className="mt-3 text-xs text-ivory/60">Guest order: track it from this device under Account → My Orders.</p>}
        </div>
      )}

      <div className="flex flex-wrap items-center gap-2 px-4 pt-2">
        <StatusBadge status={o.status} />
        <PaymentBadge method={o.paymentMethod} status={o.paymentStatus} />
        <span className="text-xs text-muted">Placed {dateTime(o.createdAt)}</span>
      </div>

      {o.paymentMethod === 'upi' && o.status !== 'cancelled' && <UpiPanel o={o} headers={headers} onChange={setData} />}
      {o.paymentMethod === 'cod' && o.status !== 'cancelled' && (
        <section className="card m-4 flex items-center gap-4 p-5">
          <Icon name="rupee" className="text-2xl text-champagne-dark" />
          <p className="text-sm">{o.paymentStatus === 'verified' ? <>Paid <b>{rupees(o.totals.totalPaise)}</b> in cash on delivery.</> : o.status === 'delivered' ? <>Cash on delivery · <b>{rupees(o.totals.totalPaise)}</b></> : <>Pay <b>{rupees(o.totals.totalPaise)}</b> in cash when your order arrives.</>}</p>
        </section>
      )}

      {o.status === 'delivered' && (
        <section className="m-4 border border-champagne/50 p-5">
          <h2 className="text-xl">Replacement</h2>
          {left > 0 ? (
            <p className="mt-1 flex items-center gap-2 text-sm"><Icon name="clock" className="text-champagne-dark" /> Report an issue within <b className="tabular-nums">{countdown(left)}</b></p>
          ) : (
            <p className="mt-1 text-sm text-muted">The {settings?.replacementWindowHours ?? 3}-hour reporting window closed {o.replacementDeadline && dateTime(o.replacementDeadline)}.</p>
          )}
          {o.replacements.map((r) => {
            const item = o.items.find((i) => i.id === r.orderItemId);
            return (
              <div key={r.id} className="mt-3 bg-cream p-3 text-sm">
                <div className="flex items-center justify-between gap-2"><span className="truncate font-medium">{item?.name}</span><span className="shrink-0 text-xs uppercase tracking-wider text-champagne-dark">{REPLACEMENT_STATUS[r.status]}</span></div>
                <p className="text-xs text-muted">{ISSUES[r.issue]} · {dateTime(r.createdAt)}</p>
                {r.adminNote && <p className="mt-1 text-xs">Shop: {r.adminNote}</p>}
              </div>
            );
          })}
          {canReplace && <Link to={`/orders/${o.orderNumber}/replacement`} className="btn-line mt-4 w-full">Request replacement</Link>}
        </section>
      )}

      <section className="m-4">
        <h2 className="mb-4 text-xl">Order status</h2>
        <Timeline o={o} />
        {o.cancelReason && <p className="mt-3 text-xs text-muted">Reason: {o.cancelReason}</p>}
      </section>

      <section className="card m-4 p-5 text-sm">
        <h2 className="mb-3 flex items-center gap-2 text-xl"><Icon name="truck" className="text-champagne-dark" /> Delivery</h2>
        <p className="font-medium">{o.contact.name} · {o.contact.mobile}</p>
        <p className="text-muted">{[o.address.house, o.address.street, o.address.area, o.address.city, o.address.state, o.address.pincode].filter(Boolean).join(', ')}</p>
        {o.address.landmark && <p className="text-muted">Landmark: {o.address.landmark}</p>}
        {o.deliveryInstructions && <p className="mt-2">Instructions: <span className="text-muted">{o.deliveryInstructions}</span></p>}
        <p className="mt-3 border-t border-sand pt-3">
          {o.status === 'cancelled' ? 'Delivery cancelled.' : o.deliveryAgentName ? <>Delivery partner: <b>{o.deliveryAgentName}</b></> : <span className="text-muted">A delivery partner will be assigned when your order is ready.</span>}
          {o.deliveredAt && <span className="block text-jade">Delivered {dateTime(o.deliveredAt)}</span>}
        </p>
      </section>

      <section className="m-4">
        <h2 className="mb-3 text-xl">Items</h2>
        <ul className="space-y-3">
          {o.items.map((i) => (
            <li key={i.id} className="flex items-center gap-3 text-sm">
              <Img src={i.imageUrl} alt="" className="h-16 w-14 shrink-0" />
              <span className="flex-1"><span className="block">{i.name}</span><span className="text-xs text-muted">SKU {i.sku} · Qty {i.quantity} × {rupees(i.unitPricePaise)}</span></span>
              <span>{rupees(i.unitPricePaise * i.quantity)}</span>
            </li>
          ))}
        </ul>
        <div className="card mt-4 p-5"><TotalsRows t={o.totals} /></div>
      </section>

      <div className="space-y-3 px-4">
        <PolicyNote />
        {settings?.whatsappNumber && (
          <a href={waLink(settings.whatsappNumber, `Hello, I have a question about my order ${o.orderNumber}.`)} target="_blank" rel="noreferrer" className="btn-line w-full"><WhatsAppIcon /> Customer support</a>
        )}
        {o.canCancel && (
          <button onClick={cancel} disabled={cancelling} className="w-full py-3 text-xs uppercase tracking-[0.2em] text-ruby underline-offset-4 hover:underline">
            {cancelling ? <Spinner /> : 'Cancel order'}
          </button>
        )}
      </div>
    </div>
  );
}

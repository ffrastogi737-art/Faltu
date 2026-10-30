import { useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { Icon } from '../components/Icon';
import { Badge, Card, ErrorBox, Field, Loading, Modal, orderTone, PageHeader, paymentTone, Spinner } from '../components/ui';
import { api } from '../lib/api';
import { dateTime, ISSUES, ORDER_FLOW, ORDER_STATUS, PAYMENT_STATUS, REPLACEMENT_STATUS, rupees } from '../lib/format';
import { useLoad, useSession } from '../lib/session';

type Detail = {
  orderNumber: string; status: string; paymentMethod: 'upi' | 'cod'; paymentStatus: string; paymentReference: string | null;
  contact: { name: string; mobile: string }; address: Record<string, string>; deliveryInstructions: string;
  totals: { subtotalPaise: number; productDiscountPaise: number; upiDiscountPercent: number; upiDiscountPaise: number; deliveryChargePaise: number; totalPaise: number };
  items: { id: number; sku: string; name: string; imageUrl: string | null; unitOriginalPaise: number; unitPricePaise: number; quantity: number }[];
  replacements: { id: number; orderItemId: number; issue: string; status: string; adminNote: string | null }[];
  assignedEmployee: { id: number; name: string; mobile: string } | null; pickedUpAt: string | null; deliveredBy: string | null; deliveredAt: string | null;
  cod: { expectedPaise: number; collectedPaise: number | null; collectedAt: string | null; collectedBy: string | null } | null;
  payment: { bankReference: string | null; verifiedBy: string | null; verifiedAt: string | null; note: string };
  customer: { id: number; name: string; mobile: string; email: string | null } | null; isGuest: boolean;
  history: { status: string; at: string; by: string | null }[]; cancelReason: string | null; createdAt: string;
};

function useAction(reload: () => void) {
  const { notify, refreshAlerts } = useSession();
  const [busy, setBusy] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const run = async (key: string, fn: () => Promise<unknown>, done: string) => {
    setBusy(key);
    setErr(null);
    try { await fn(); notify(done); reload(); refreshAlerts(); return true; } catch (e) { setErr((e as Error).message); return false; } finally { setBusy(null); }
  };
  return { busy, err, run, setErr };
}

function PaymentVerify({ o, onDone }: { o: Detail; onDone: () => void }) {
  const [open, setOpen] = useState<'verified' | 'failed' | null>(null);
  const [ref, setRef] = useState(o.paymentReference || '');
  const [confirmed, setConfirmed] = useState(false);
  const [note, setNote] = useState('');
  const { busy, err, run } = useAction(onDone);
  if (o.paymentMethod !== 'upi' || o.paymentStatus === 'verified') return null;
  return (
    <>
      <div className="flex flex-wrap gap-2">
        <button className="btn-gold" onClick={() => setOpen('verified')}><Icon name="check" /> Verify payment</button>
        <button className="btn-danger" onClick={() => setOpen('failed')}>Mark failed</button>
      </div>
      {open && (
        <Modal title={open === 'verified' ? 'Verify UPI payment' : 'Mark payment failed'} onClose={() => setOpen(null)}>
          <form className="space-y-4" onSubmit={async (e) => {
            e.preventDefault();
            const ok = await run('pay', () => api(`/admin/orders/${o.orderNumber}/payment`, 'POST', open === 'verified' ? { status: 'verified', bankReference: ref.trim(), confirmBankCredit: confirmed, note } : { status: 'failed', note }), open === 'verified' ? 'Payment verified' : 'Payment marked failed');
            if (ok) setOpen(null);
          }}>
            <div className="rounded-lg bg-ivory p-3 text-[13px]">
              Expected <b>{rupees(o.totals.totalPaise)}</b> for order <b>#{o.orderNumber}</b>. Customer reference: <b className="font-mono">{o.paymentReference || 'not given'}</b>
            </div>
            {open === 'verified' ? (
              <>
                <Field label="Transaction reference / UTR from your bank or UPI merchant app" hint="Copy it from your own account statement, not from a customer screenshot.">
                  <input required value={ref} onChange={(e) => setRef(e.target.value.replace(/\s/g, ''))} maxLength={35} className="font-mono" />
                </Field>
                <label className="flex items-start gap-2 text-[13px]"><input type="checkbox" checked={confirmed} onChange={(e) => setConfirmed(e.target.checked)} className="mt-0.5" /> I checked my bank / UPI merchant account and the exact amount has been credited.</label>
                <Field label="Note (optional)"><input value={note} onChange={(e) => setNote(e.target.value)} maxLength={300} /></Field>
              </>
            ) : (
              <Field label="Reason (shown in the order record)"><textarea required rows={3} value={note} onChange={(e) => setNote(e.target.value)} maxLength={300} placeholder="e.g. No credit found for this amount in the bank statement" /></Field>
            )}
            {err && <ErrorBox message={err} />}
            <button disabled={busy === 'pay' || (open === 'verified' && !confirmed)} className={open === 'verified' ? 'btn-gold w-full' : 'btn-danger w-full'}>
              {busy ? <Spinner /> : open === 'verified' ? 'Confirm payment verified' : 'Mark payment failed'}
            </button>
          </form>
        </Modal>
      )}
    </>
  );
}

function CodRecord({ o, onDone }: { o: Detail; onDone: () => void }) {
  const [amount, setAmount] = useState(String(o.totals.totalPaise / 100));
  const [note, setNote] = useState('');
  const { busy, err, run } = useAction(onDone);
  if (!o.cod || o.cod.collectedAt || !['out_for_delivery', 'delivered'].includes(o.status)) return null;
  return (
    <form className="mt-3 space-y-3 rounded-lg border border-line bg-ivory p-3" onSubmit={(e) => { e.preventDefault(); run('cod', () => api(`/admin/orders/${o.orderNumber}/cod`, 'POST', { amount, note }), 'Cash collection recorded'); }}>
      <p className="text-[13px] font-medium">Record cash collected</p>
      <div className="grid grid-cols-2 gap-2">
        <Field label="Amount received (₹)"><input required inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} /></Field>
        <Field label="Note (needed if amount differs)"><input value={note} onChange={(e) => setNote(e.target.value)} maxLength={300} /></Field>
      </div>
      {err && <ErrorBox message={err} />}
      <button disabled={busy === 'cod'} className="btn-gold w-full">{busy ? <Spinner /> : `Record ₹${amount} collected`}</button>
    </form>
  );
}

export default function OrderDetail() {
  const { number = '' } = useParams();
  const { staff } = useSession();
  const { data: o, error, loading, reload } = useLoad(() => api<Detail>(`/admin/orders/${number}`), [number]);
  const employees = useLoad(() => (staff?.role === 'employee' ? Promise.resolve([]) : api<{ id: number; name: string; role: string; active: boolean; open_orders: number }[]>('/admin/staff')), [], false);
  const { busy, err, run } = useAction(reload);
  const [cancelOpen, setCancelOpen] = useState(false);
  const [reason, setReason] = useState('');
  if (error && !o) return <ErrorBox message={error} onRetry={reload} />;
  if (loading && !o) return <Loading />;
  if (!o) return null;

  const isEmployee = staff?.role === 'employee';
  const done = ['delivered', 'cancelled'].includes(o.status);
  const next = ORDER_FLOW[ORDER_FLOW.indexOf(o.status) + 1];
  const canAdvance = !done && next && (!isEmployee || ['out_for_delivery', 'delivered'].includes(next));
  const setStatus = (status: string, extra = {}) => run('status', () => api(`/admin/orders/${o.orderNumber}/status`, 'POST', { status, ...extra }), `Marked ${ORDER_STATUS[status]}`);
  const a = o.address;
  const fullAddress = [a.house, a.street, a.area, a.city, a.state, a.pincode].filter(Boolean).join(', ');

  return (
    <div>
      <PageHeader
        title={`Order #${o.orderNumber}`}
        subtitle={<>Placed {dateTime(o.createdAt)} · {o.isGuest ? 'Guest checkout' : 'Registered customer'}</>}
        actions={<><Badge tone={orderTone(o.status)}>{ORDER_STATUS[o.status]}</Badge><Badge tone={paymentTone(o.paymentStatus)}>{o.paymentMethod.toUpperCase()} · {PAYMENT_STATUS[o.paymentStatus]}</Badge></>}
      />
      {err && <div className="mb-4"><ErrorBox message={err} /></div>}
      <div className="grid gap-5 lg:grid-cols-[1.4fr_1fr]">
        <div className="space-y-5">
          <Card title="Actions">
            <div className="flex flex-wrap gap-2">
              {canAdvance && <button disabled={!!busy} className="btn-primary" onClick={() => setStatus(next)}>{busy === 'status' ? <Spinner /> : <>Mark {ORDER_STATUS[next]} <Icon name="chevron" /></>}</button>}
              {!done && o.assignedEmployee && !o.pickedUpAt && (
                <button disabled={!!busy} className="btn-ghost" onClick={() => run('pickup', () => api(`/admin/orders/${o.orderNumber}/pickup`, 'POST', {}), 'Marked picked up')}>Mark picked up</button>
              )}
              {!done && !isEmployee && <button className="btn-danger" onClick={() => setCancelOpen(true)}>Cancel order</button>}
              {done && <p className="text-[13px] text-muted">This order is {ORDER_STATUS[o.status].toLowerCase()}. {o.cancelReason && `Reason: ${o.cancelReason}`}</p>}
            </div>
            {!isEmployee && !done && (
              <div className="mt-4 flex flex-wrap items-end gap-2">
                <Field label="Delivery employee" className="min-w-56 flex-1">
                  <select value={o.assignedEmployee?.id || ''} onChange={(e) => run('assign', () => api(`/admin/orders/${o.orderNumber}/assign`, 'POST', { employeeId: e.target.value ? Number(e.target.value) : null }), e.target.value ? 'Employee assigned' : 'Unassigned')}>
                    <option value="">Not assigned</option>
                    {employees.data?.filter((e) => e.role === 'employee' && e.active).map((e) => <option key={e.id} value={e.id}>{e.name} ({e.open_orders} open)</option>)}
                  </select>
                </Field>
              </div>
            )}
            {staff?.role === 'owner' && <div className="mt-4"><PaymentVerify o={o} onDone={reload} /></div>}
            <CodRecord o={o} onDone={reload} />
          </Card>

          <Card title={`Items (${o.items.reduce((n, i) => n + i.quantity, 0)})`}>
            <ul className="divide-y divide-line">
              {o.items.map((i) => (
                <li key={i.id} className="flex items-center gap-3 py-2.5">
                  {i.imageUrl ? <img src={i.imageUrl} alt="" className="h-14 w-12 rounded object-cover" /> : <span className="h-14 w-12 rounded bg-ivory" />}
                  <span className="flex-1"><span className="block font-medium">{i.name}</span><span className="text-[12px] text-muted">SKU {i.sku} · {i.quantity} × {rupees(i.unitPricePaise)}{i.unitOriginalPaise > i.unitPricePaise && <> (MRP {rupees(i.unitOriginalPaise)})</>}</span></span>
                  <span className="tabular-nums">{rupees(i.unitPricePaise * i.quantity)}</span>
                </li>
              ))}
            </ul>
            <dl className="mt-3 space-y-1.5 border-t border-line pt-3 text-[13.5px]">
              <div className="flex justify-between"><dt className="text-muted">Original amount (MRP)</dt><dd>{rupees(o.totals.subtotalPaise)}</dd></div>
              <div className="flex justify-between"><dt className="text-muted">Product discounts</dt><dd>− {rupees(o.totals.productDiscountPaise)}</dd></div>
              <div className="flex justify-between"><dt className="text-muted">UPI discount ({o.totals.upiDiscountPercent}%)</dt><dd>− {rupees(o.totals.upiDiscountPaise)}</dd></div>
              <div className="flex justify-between"><dt className="text-muted">Delivery charges</dt><dd>{rupees(o.totals.deliveryChargePaise)}</dd></div>
              <div className="flex justify-between border-t border-line pt-2 text-base font-semibold"><dt>Final payable</dt><dd>{rupees(o.totals.totalPaise)}</dd></div>
            </dl>
          </Card>

          {o.replacements.length > 0 && (
            <Card title="Replacement requests" actions={!isEmployee && <Link to="/replacements" className="text-[12px] underline">Manage</Link>}>
              {o.replacements.map((r) => <p key={r.id} className="text-[13px]">{o.items.find((i) => i.id === r.orderItemId)?.name}: {ISSUES[r.issue]} · <b>{REPLACEMENT_STATUS[r.status]}</b>{r.adminNote && ` — ${r.adminNote}`}</p>)}
            </Card>
          )}
        </div>

        <div className="space-y-5">
          <Card title="Customer & delivery">
            <p className="font-medium">{o.contact.name}</p>
            <p><a href={`tel:+91${o.contact.mobile}`} className="text-gold-dark underline">+91 {o.contact.mobile}</a></p>
            <p className="mt-2 text-muted">{fullAddress}</p>
            {a.landmark && <p className="text-muted">Landmark: {a.landmark}</p>}
            {o.deliveryInstructions && <p className="mt-2 rounded bg-gold-soft px-2 py-1 text-[13px]">“{o.deliveryInstructions}”</p>}
            <p className="mt-2 text-[13px]"><a className="underline" target="_blank" rel="noreferrer" href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(fullAddress)}`}>Open in Maps</a></p>
            {o.customer && <p className="mt-3 border-t border-line pt-3 text-[13px]">Account: <Link className="underline" to={`/customers?id=${o.customer.id}`}>{o.customer.name}</Link>{o.customer.email && ` · ${o.customer.email}`}</p>}
            <dl className="mt-3 space-y-1 border-t border-line pt-3 text-[13px]">
              <div className="flex justify-between"><dt className="text-muted">Employee</dt><dd>{o.assignedEmployee ? `${o.assignedEmployee.name} · ${o.assignedEmployee.mobile}` : '—'}</dd></div>
              <div className="flex justify-between"><dt className="text-muted">Picked up</dt><dd>{dateTime(o.pickedUpAt)}</dd></div>
              <div className="flex justify-between"><dt className="text-muted">Delivered</dt><dd>{o.deliveredAt ? `${dateTime(o.deliveredAt)}${o.deliveredBy ? ` by ${o.deliveredBy}` : ''}` : '—'}</dd></div>
            </dl>
          </Card>

          <Card title="Payment">
            <dl className="space-y-1.5 text-[13px]">
              <div className="flex justify-between"><dt className="text-muted">Method</dt><dd>{o.paymentMethod === 'upi' ? 'Direct UPI' : 'Cash on delivery'}</dd></div>
              <div className="flex justify-between"><dt className="text-muted">Status</dt><dd><Badge tone={paymentTone(o.paymentStatus)}>{PAYMENT_STATUS[o.paymentStatus]}</Badge></dd></div>
              <div className="flex justify-between"><dt className="text-muted">Expected</dt><dd className="font-semibold">{rupees(o.totals.totalPaise)}</dd></div>
              {o.paymentMethod === 'upi' && <div className="flex justify-between"><dt className="text-muted">Customer's reference</dt><dd className="font-mono">{o.paymentReference || '—'}</dd></div>}
              {o.payment.bankReference && <div className="flex justify-between"><dt className="text-muted">Bank reference</dt><dd className="font-mono">{o.payment.bankReference}</dd></div>}
              {o.payment.verifiedBy && <div className="flex justify-between"><dt className="text-muted">Checked by</dt><dd>{o.payment.verifiedBy} · {dateTime(o.payment.verifiedAt)}</dd></div>}
              {o.cod && <div className="flex justify-between"><dt className="text-muted">Cash collected</dt><dd>{o.cod.collectedAt ? `${rupees(o.cod.collectedPaise)} by ${o.cod.collectedBy} · ${dateTime(o.cod.collectedAt)}` : 'Not yet'}</dd></div>}
              {o.payment.note && <p className="pt-1 text-muted">Note: {o.payment.note}</p>}
            </dl>
          </Card>

          <Card title="Timeline">
            <ol className="space-y-2.5 text-[13px]">
              {o.history.map((h, i) => (
                <li key={i} className="flex gap-3"><span className={`mt-1.5 h-2 w-2 shrink-0 rounded-full ${h.status === 'cancelled' ? 'bg-bad' : 'bg-gold'}`} />
                  <span><b className="font-medium">{ORDER_STATUS[h.status]}</b><span className="block text-muted">{dateTime(h.at)}{h.by ? ` · ${h.by}` : h.status === 'new' ? ' · customer' : ''}</span></span></li>
              ))}
            </ol>
          </Card>
        </div>
      </div>

      {cancelOpen && (
        <Modal title="Cancel order" onClose={() => setCancelOpen(false)}>
          <form className="space-y-3" onSubmit={async (e) => { e.preventDefault(); if (await setStatus('cancelled', { reason })) setCancelOpen(false); }}>
            <p className="text-[13px] text-muted">Stock is returned automatically and the customer is notified.{o.paymentStatus === 'verified' && o.paymentMethod === 'upi' && ' This order was paid by UPI: settle it with the customer directly.'}</p>
            <Field label="Reason"><textarea required rows={3} maxLength={300} value={reason} onChange={(e) => setReason(e.target.value)} /></Field>
            <button className="btn-danger w-full" disabled={busy === 'status'}>{busy ? <Spinner /> : 'Cancel this order'}</button>
          </form>
        </Modal>
      )}
    </div>
  );
}

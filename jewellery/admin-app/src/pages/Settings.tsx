import { useEffect, useState, type ReactNode } from 'react';
import { useSearchParams } from 'react-router-dom';
import { SingleUpload } from '../components/MediaPicker';
import { Card, ErrorBox, Field, Loading, PageHeader, Spinner } from '../components/ui';
import { api } from '../lib/api';
import { rupees, toRupees } from '../lib/format';
import { useLoad, useSession } from '../lib/session';

type S = Record<string, any>;
const TABS = [['branding', 'Store profile & branding'], ['business', 'Business & delivery'], ['payments', 'Payments'], ['discount', 'UPI discount'], ['policy', 'Policy']] as const;
type Tab = (typeof TABS)[number][0];
const local = (iso?: string | null) => (iso ? new Date(new Date(iso).getTime() - new Date().getTimezoneOffset() * 6e4).toISOString().slice(0, 16) : '');

function Save({ busy, dirty }: { busy: boolean; dirty: boolean }) {
  return (
    <div className="sticky bottom-0 -mx-4 mt-5 flex items-center justify-end gap-3 border-t border-line bg-paper/95 px-4 py-3 backdrop-blur">
      {dirty && <span className="text-[12px] text-warn">Unsaved changes</span>}
      <button disabled={busy || !dirty} className="btn-primary">{busy ? <Spinner /> : 'Save changes'}</button>
    </div>
  );
}

function Preview({ s }: { s: S }) {
  const name = s.brand_display_name || s.shop_name;
  return (
    <div className="space-y-4">
      <div className="overflow-hidden rounded-[22px] border-[6px] border-ink bg-[#fbf7ef] shadow-xl">
        <div className="flex h-12 items-center justify-center border-b border-[#e8dcc4] px-3">
          {s.logo_url ? <img src={s.logo_url} alt="Logo preview" className="h-8 max-w-[70%] object-contain" /> : <span className="font-display text-lg font-semibold uppercase tracking-[0.2em]">{name}</span>}
        </div>
        <div className="m-3 bg-ink p-4 text-[#fbf7ef]">
          <p className="text-[9px] uppercase tracking-[0.25em] text-[#c9a45c]">{name}</p>
          <p className="font-display text-xl leading-tight">{s.tagline || 'Your tagline'}</p>
        </div>
        <p className="px-3 pb-3 text-[11px] text-muted">{s.description?.slice(0, 120)}</p>
      </div>
      <div className="flex items-end gap-4">
        <div className="text-center">
          <div className="grid h-16 w-16 place-items-center overflow-hidden rounded-2xl bg-white shadow ring-1 ring-line">{s.app_icon_url ? <img src={s.app_icon_url} alt="App icon preview" className="h-full w-full object-cover" /> : <span className="text-[10px] text-muted">default</span>}</div>
          <p className="mt-1 w-16 truncate text-[11px]">{name}</p>
        </div>
        {s.splash_logo_url && <div className="grid h-24 w-14 place-items-center rounded-lg bg-[#fbf7ef] ring-1 ring-line"><img src={s.splash_logo_url} alt="Splash preview" className="w-10" /></div>}
      </div>
      <p className="text-[12px] text-muted">Preview of the customer app. Nothing changes for customers until you save.</p>
    </div>
  );
}

export default function Settings() {
  const { notify } = useSession();
  const [params, setParams] = useSearchParams();
  const tab = (params.get('tab') as Tab) || 'branding';
  const { data, error, reload } = useLoad(() => api<S>('/admin/settings'), [], false);
  const [s, setS] = useState<S | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  useEffect(() => { if (data) setS(data); }, [data]);
  if (error) return <ErrorBox message={error} onRetry={reload} />;
  if (!s || !data) return <Loading />;

  const set = (k: string, v: unknown) => setS({ ...s, [k]: v });
  const fieldsFor: Record<Tab, string[]> = {
    branding: ['shop_name', 'brand_display_name', 'tagline', 'description', 'logo_url', 'app_icon_url', 'splash_logo_url', 'support_phone', 'whatsapp_number', 'contact_email', 'address', 'city', 'state', 'pincode', 'opening_hours', 'social_links'],
    business: ['delivery_charge_paise', 'free_delivery_min_paise', 'min_order_paise', 'delivery_pincodes', 'delivery_areas_note', 'low_stock_threshold'],
    payments: ['upi_id', 'upi_payee_name', 'payment_instructions', 'payment_description', 'upi_enabled', 'cod_enabled'],
    discount: ['upi_discount_enabled', 'upi_discount_percent', 'upi_discount_min_order_paise', 'upi_discount_max_paise', 'upi_discount_starts_at', 'upi_discount_ends_at'],
    policy: ['replacement_window_hours', 'replacement_policy', 'cancellable_statuses'],
  };
  const changed = fieldsFor[tab].filter((k) => JSON.stringify(s[k]) !== JSON.stringify(data[k]));
  const upiChanged = tab === 'payments' && s.upi_id !== data.upi_id;

  async function save(e: React.FormEvent) {
    e.preventDefault();
    // same rule as the server; checked first so the owner isn't asked to confirm an ID that will be rejected
    if (upiChanged && s!.upi_id && !/^[a-zA-Z0-9.\-_]{2,256}@[a-zA-Z][a-zA-Z0-9]{1,63}$/.test(s!.upi_id.trim())) return setErr('UPI ID looks invalid. It should look like name@bank');
    if (upiChanged && !confirm(`Change the UPI ID to ${s!.upi_id}?\n\nAll new customer payments will go to this UPI ID. Make sure it belongs to your merchant account — send yourself ₹1 from another app to check before customers use it.`)) return;
    setBusy(true);
    setErr(null);
    try {
      const saved = await api<S>('/admin/settings', 'PATCH', Object.fromEntries(changed.map((k) => [k, s![k]])));
      setS(saved);
      reload();
      notify('Saved — the customer app updates automatically');
    } catch (e) { setErr((e as Error).message); } finally { setBusy(false); }
  }
  const money = (k: string, label: string, hint?: ReactNode) => (
    <Field label={label} hint={hint}><input inputMode="decimal" value={toRupees(s[k])} onChange={(e) => set(k, Math.round(Number(e.target.value || 0) * 100))} /></Field>
  );
  const text = (k: string, label: string, props: Record<string, unknown> = {}, hint?: ReactNode) => (
    <Field label={label} hint={hint}><input value={s[k] ?? ''} onChange={(e) => set(k, e.target.value)} {...props} /></Field>
  );

  return (
    <div>
      <PageHeader title="Store settings" subtitle="One place for everything customers see. Changes are recorded in the audit log." />
      <div className="mb-5 flex flex-wrap gap-2" role="tablist">
        {TABS.map(([k, l]) => <button key={k} role="tab" aria-selected={tab === k} onClick={() => { setParams({ tab: k }); setS(data); setErr(null); }} className={`btn ${tab === k ? 'bg-ink text-paper' : 'border border-line bg-white hover:border-gold'}`}>{l}</button>)}
      </div>
      <form onSubmit={save}>
        {tab === 'branding' && (
          <div className="grid gap-5 lg:grid-cols-[1.5fr_1fr]">
            <div className="space-y-5">
              <Card title="Identity">
                <div className="grid gap-4 sm:grid-cols-2">
                  {text('shop_name', 'Store name', { required: true, maxLength: 60 })}
                  {text('brand_display_name', 'Brand display name', { maxLength: 60 }, 'Shown in the app header and install name. Leave empty to use the store name.')}
                  <div className="sm:col-span-2">{text('tagline', 'Tagline', { maxLength: 120 })}</div>
                  <Field label="Store description" className="sm:col-span-2"><textarea rows={3} maxLength={1000} value={s.description} onChange={(e) => set('description', e.target.value)} /></Field>
                </div>
              </Card>
              <Card title="Logo, app icon & splash">
                <div className="space-y-5">
                  <div><p className="label">Store logo (header)</p><SingleUpload kind="logo" label="Logo" value={s.logo_url} onChange={(v) => set('logo_url', v)} /></div>
                  <div><p className="label">App icon (square, at least 512×512)</p><SingleUpload kind="icon" label="App icon" round value={s.app_icon_url} onChange={(v) => set('app_icon_url', v)} />
                    <p className="mt-1 text-[12px] text-muted">Used for the installed app and browser tab. Customers who already installed the app may need to reinstall to see a new icon.</p></div>
                  <div><p className="label">Splash screen logo</p><SingleUpload kind="splash" label="Splash logo" value={s.splash_logo_url} onChange={(v) => set('splash_logo_url', v)} /></div>
                </div>
              </Card>
              <Card title="Contact & address">
                <div className="grid gap-4 sm:grid-cols-2">
                  {text('support_phone', 'Contact number', { inputMode: 'numeric', maxLength: 10 })}
                  {text('whatsapp_number', 'WhatsApp number', { inputMode: 'numeric' }, '10-digit mobile number')}
                  {text('contact_email', 'Email address', { type: 'email' })}
                  {text('opening_hours', 'Opening hours', { placeholder: 'Mon–Sat 10:30am – 8:30pm' })}
                  <div className="sm:col-span-2">{text('address', 'Store address')}</div>
                  {text('city', 'City')}
                  {text('state', 'State')}
                  {text('pincode', 'PIN code', { inputMode: 'numeric', maxLength: 6 })}
                </div>
              </Card>
              <Card title="Social media">
                <div className="grid gap-4 sm:grid-cols-2">
                  {['instagram', 'facebook', 'youtube', 'website'].map((k) => (
                    <Field key={k} label={k[0].toUpperCase() + k.slice(1)}><input type="url" placeholder="https://" value={s.social_links?.[k] || ''} onChange={(e) => set('social_links', { ...s.social_links, [k]: e.target.value })} /></Field>
                  ))}
                </div>
              </Card>
            </div>
            <div><div className="lg:sticky lg:top-6"><Card title="Preview"><Preview s={s} /></Card></div></div>
          </div>
        )}

        {tab === 'business' && (
          <Card title="Delivery & orders">
            <div className="grid gap-4 sm:grid-cols-2">
              {money('delivery_charge_paise', 'Delivery charge (₹)')}
              {money('free_delivery_min_paise', 'Free delivery above (₹)', '0 = never free')}
              {money('min_order_paise', 'Minimum order amount (₹)', '0 = no minimum')}
              <Field label="Low stock alert at (pieces)"><input type="number" min={0} value={s.low_stock_threshold} onChange={(e) => set('low_stock_threshold', Number(e.target.value))} /></Field>
              <Field label="Delivery PIN codes" className="sm:col-span-2" hint="Comma-separated. Leave empty to accept orders from any PIN code.">
                <textarea rows={2} value={(s.delivery_pincodes || []).join(', ')} onChange={(e) => set('delivery_pincodes', e.target.value.split(/[\s,]+/).filter(Boolean))} />
              </Field>
              <Field label="Delivery areas note (shown to customers)" className="sm:col-span-2"><input maxLength={300} value={s.delivery_areas_note} onChange={(e) => set('delivery_areas_note', e.target.value)} placeholder="We deliver within Jaipur city." /></Field>
            </div>
          </Card>
        )}

        {tab === 'payments' && (
          <div className="grid gap-5 lg:grid-cols-[1.5fr_1fr]">
            <Card title="Merchant UPI">
              <div className="space-y-4">
                {text('upi_id', 'Merchant UPI ID', { placeholder: 'yourshop@okhdfcbank', autoComplete: 'off', spellCheck: false }, 'Format: name@bank. Basic format is checked; ownership is not.')}
                {s.upi_id === 'aabhajewels@upi' && <ErrorBox message="This is the demo UPI ID. Replace it with your own before taking orders." />}
                {text('upi_payee_name', 'Merchant display name', { required: true, maxLength: 50 }, 'Shown in the customer’s UPI app as the payee.')}
                {text('payment_description', 'Payment description', { maxLength: 30, placeholder: `${s.shop_name} order` }, 'Appears as the transaction note, followed by the order number.')}
                <Field label="Payment instructions (shown on the payment screen)"><textarea rows={3} maxLength={500} value={s.payment_instructions} onChange={(e) => set('payment_instructions', e.target.value)} placeholder="Pay the exact amount shown. Your order is confirmed after we see the payment in our account." /></Field>
                <label className="flex items-center gap-2"><input type="checkbox" checked={s.upi_enabled} onChange={(e) => set('upi_enabled', e.target.checked)} /> UPI payments enabled</label>
                <label className="flex items-center gap-2"><input type="checkbox" checked={s.cod_enabled} onChange={(e) => set('cod_enabled', e.target.checked)} /> Cash on delivery enabled</label>
              </div>
            </Card>
            <Card title="Important">
              <ul className="list-disc space-y-2 pl-4 text-[13px] text-muted">
                <li>Changing the UPI ID does <b>not</b> verify that the account is yours. Check it by paying ₹1 to it from another UPI app and confirming the credit in your bank.</li>
                <li>Every new payment link uses the current UPI ID, the exact order amount and the order number.</li>
                <li>Customers never enter a UPI PIN in this app; payment happens in their own UPI app.</li>
                <li>Verify each payment against your bank statement before marking it verified.</li>
              </ul>
            </Card>
          </div>
        )}

        {tab === 'discount' && (
          <Card title="UPI prepaid discount">
            <div className="grid gap-4 sm:grid-cols-2">
              <label className="flex items-center gap-2 sm:col-span-2"><input type="checkbox" checked={s.upi_discount_enabled} onChange={(e) => set('upi_discount_enabled', e.target.checked)} /> Give a discount when customers pay by UPI</label>
              <Field label="Discount percentage"><input type="number" step="0.5" min={0} max={50} value={s.upi_discount_percent} onChange={(e) => set('upi_discount_percent', e.target.value)} /></Field>
              {money('upi_discount_min_order_paise', 'Minimum order for discount (₹)', '0 = any order')}
              {money('upi_discount_max_paise', 'Maximum discount cap (₹)', '0 = no cap')}
              <span />
              <Field label="Starts (optional)"><input type="datetime-local" value={local(s.upi_discount_starts_at)} onChange={(e) => set('upi_discount_starts_at', e.target.value ? new Date(e.target.value).toISOString() : null)} /></Field>
              <Field label="Expires (optional)"><input type="datetime-local" value={local(s.upi_discount_ends_at)} onChange={(e) => set('upi_discount_ends_at', e.target.value ? new Date(e.target.value).toISOString() : null)} /></Field>
            </div>
            <div className="mt-4 rounded-lg bg-ivory p-3 text-[13px]">
              Example for a ₹1,000 order — UPI: {s.upi_discount_enabled && 100000 >= s.upi_discount_min_order_paise
                ? (() => { const d = Math.min(Math.round(1000 * Number(s.upi_discount_percent)), s.upi_discount_max_paise || Infinity); return <>discount <b>{rupees(d)}</b>, pays <b>{rupees(100000 - d)}</b></>; })()
                : <>no discount</>} · COD: pays <b>₹1,000</b>.
              <span className="block text-muted">Totals are always calculated by the server. Past orders keep the discount they were placed with.</span>
            </div>
          </Card>
        )}

        {tab === 'policy' && (
          <Card title="Replacement policy">
            <div className="space-y-4">
              <p className="rounded-lg bg-gold-soft p-3 text-[13px]">No return · No refund · Replacement only for wrong, damaged or manufacturing-defective products. This does not override customers' statutory consumer rights.</p>
              <Field label="Reporting window (hours after delivery)"><input type="number" min={1} max={720} value={s.replacement_window_hours} onChange={(e) => set('replacement_window_hours', Number(e.target.value))} className="!w-32" /></Field>
              <Field label="Additional policy text shown to customers"><textarea rows={5} maxLength={3000} value={s.replacement_policy} onChange={(e) => set('replacement_policy', e.target.value)} /></Field>
              <div><p className="label">Customers may cancel their own order while it is</p>
                {['new', 'confirmed', 'preparing'].map((st) => (
                  <label key={st} className="mr-4 inline-flex items-center gap-2 text-[13px] capitalize"><input type="checkbox" checked={s.cancellable_statuses.includes(st)} onChange={(e) => set('cancellable_statuses', e.target.checked ? [...s.cancellable_statuses, st] : s.cancellable_statuses.filter((x: string) => x !== st))} /> {st}</label>
                ))}
              </div>
            </div>
          </Card>
        )}
        {err && <div className="mt-4"><ErrorBox message={err} /></div>}
        <Save busy={busy} dirty={changed.length > 0} />
      </form>
    </div>
  );
}

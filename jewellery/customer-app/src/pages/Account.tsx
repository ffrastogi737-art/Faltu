import { useEffect, useState, type ReactNode } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { AddressFields, EMPTY_ADDRESS } from '../components/AddressForm';
import { Icon, WhatsAppIcon, type IconName } from '../components/Icon';
import { Field, PageHeader, Spinner } from '../components/ui';
import { api } from '../lib/api';
import { waLink } from '../lib/format';
import { currentSubscription, disablePush, enablePush, pushSupported } from '../lib/push';
import { useLoad, useStore } from '../lib/store';
import type { Address, Customer } from '../lib/types';

function Row({ icon, label, to, href, onClick, badge }: { icon: IconName; label: string; to?: string; href?: string; onClick?: () => void; badge?: ReactNode }) {
  const inner = (<><Icon name={icon} className="text-champagne-dark" /><span className="flex-1 text-left">{label}</span>{badge}<Icon name="chevron" className="text-muted" /></>);
  const cls = 'flex w-full items-center gap-4 px-4 py-4 text-[15px]';
  if (to) return <Link to={to} className={cls}>{inner}</Link>;
  if (href) return <a href={href} target="_blank" rel="noreferrer" className={cls}>{inner}</a>;
  return <button onClick={onClick} className={cls}>{inner}</button>;
}

function Profile({ c }: { c: Customer }) {
  const { setCustomer, notify } = useStore();
  const [form, setForm] = useState({ name: c.name, email: c.email || '' });
  const [pw, setPw] = useState({ current: '', next: '' });
  const [busy, setBusy] = useState<string | null>(null);
  async function saveProfile(e: React.FormEvent) {
    e.preventDefault();
    setBusy('profile');
    try { setCustomer(await api<Customer>('/me', { method: 'PATCH', body: form })); notify('Profile saved'); } catch (e) { notify((e as Error).message); }
    setBusy(null);
  }
  async function savePassword(e: React.FormEvent) {
    e.preventDefault();
    setBusy('pw');
    try { await api('/me/password', { method: 'POST', body: pw }); setPw({ current: '', next: '' }); notify('Password changed'); } catch (e) { notify((e as Error).message); }
    setBusy(null);
  }
  return (
    <div className="space-y-8 px-4 py-4">
      <form onSubmit={saveProfile} className="space-y-5">
        <Field label="Name"><input required minLength={2} maxLength={80} value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} /></Field>
        <Field label="Mobile number"><input value={c.mobile} disabled className="text-muted" /></Field>
        <Field label="Email (optional)"><input type="email" maxLength={120} value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} /></Field>
        <button disabled={busy === 'profile'} className="btn-dark w-full">{busy === 'profile' ? <Spinner /> : 'Save profile'}</button>
      </form>
      <form onSubmit={savePassword} className="space-y-5">
        <p className="label">Change password</p>
        <Field label="Current password"><input required type="password" autoComplete="current-password" value={pw.current} onChange={(e) => setPw({ ...pw, current: e.target.value })} /></Field>
        <Field label="New password (min 8 characters)"><input required type="password" autoComplete="new-password" minLength={8} value={pw.next} onChange={(e) => setPw({ ...pw, next: e.target.value })} /></Field>
        <button disabled={busy === 'pw'} className="btn-line w-full">{busy === 'pw' ? <Spinner /> : 'Update password'}</button>
      </form>
    </div>
  );
}

function Addresses() {
  const { notify } = useStore();
  const { data, reload } = useLoad(() => api<Address[]>('/me/addresses'), []);
  const [editing, setEditing] = useState<Address | null>(null);
  const [busy, setBusy] = useState(false);
  async function save(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    try {
      await api(editing!.id ? `/me/addresses/${editing!.id}` : '/me/addresses', { method: editing!.id ? 'PUT' : 'POST', body: editing });
      setEditing(null);
      reload();
      notify('Address saved');
    } catch (e) { notify((e as Error).message); }
    setBusy(false);
  }
  async function remove(id: number) {
    if (!confirm('Delete this address?')) return;
    await api(`/me/addresses/${id}`, { method: 'DELETE' }).catch((e) => notify(e.message));
    reload();
  }
  if (editing) {
    return (
      <form onSubmit={save} className="space-y-5 px-4 py-4">
        <Field label="Label"><input maxLength={30} value={editing.label || ''} onChange={(e) => setEditing({ ...editing, label: e.target.value })} placeholder="Home, Office…" /></Field>
        <AddressFields value={editing} onChange={setEditing} />
        <label className="flex items-center gap-2 text-sm"><input type="checkbox" className="h-4 w-4 accent-champagne-dark" checked={Boolean(editing.is_default)} onChange={(e) => setEditing({ ...editing, is_default: e.target.checked })} /> Use as default</label>
        <div className="flex gap-3"><button type="button" onClick={() => setEditing(null)} className="btn-line flex-1">Cancel</button><button disabled={busy} className="btn-dark flex-1">{busy ? <Spinner /> : 'Save'}</button></div>
      </form>
    );
  }
  return (
    <div className="space-y-3 px-4 py-4">
      {data?.map((a) => (
        <div key={a.id} className="card p-4 text-sm">
          <p className="font-medium">{a.label} {a.is_default && <span className="ml-1 text-[10px] uppercase tracking-widest text-champagne-dark">Default</span>}</p>
          <p className="text-muted">{a.name} · {a.mobile}<br />{[a.house, a.street, a.area, a.city, a.state, a.pincode].filter(Boolean).join(', ')}</p>
          <div className="mt-2 flex gap-4 text-xs uppercase tracking-widest"><button onClick={() => setEditing(a)} className="underline">Edit</button><button onClick={() => remove(a.id!)} className="text-ruby underline">Delete</button></div>
        </div>
      ))}
      {data?.length === 0 && <p className="text-sm text-muted">No saved addresses yet.</p>}
      <button onClick={() => setEditing({ ...EMPTY_ADDRESS, label: 'Home' })} className="btn-line w-full"><Icon name="plus" /> Add address</button>
    </div>
  );
}

function PushToggle() {
  const { notify } = useStore();
  const [on, setOn] = useState<boolean | null>(null);
  const [busy, setBusy] = useState(false);
  useEffect(() => { currentSubscription().then((s) => setOn(Boolean(s))).catch(() => setOn(false)); }, []);
  if (!pushSupported()) return <p className="px-4 py-3 text-xs text-muted">Push notifications are not supported on this browser. You'll still see updates under Notifications.</p>;
  async function toggle() {
    setBusy(true);
    try {
      if (on) { await disablePush(); setOn(false); } else { await enablePush(); setOn(true); notify('Notifications turned on'); }
    } catch (e) { notify((e as Error).message); }
    setBusy(false);
  }
  return (
    <label className="flex items-center gap-4 px-4 py-4 text-[15px]">
      <Icon name="bell" className="text-champagne-dark" />
      <span className="flex-1">Order & offer alerts on this device</span>
      {busy ? <Spinner /> : <input type="checkbox" role="switch" checked={Boolean(on)} onChange={toggle} className="h-5 w-5 accent-champagne-dark" />}
    </label>
  );
}

type InstallEvent = Event & { prompt: () => Promise<void> };
let deferredInstall: InstallEvent | null = null;
window.addEventListener('beforeinstallprompt', (e) => { e.preventDefault(); deferredInstall = e as InstallEvent; });

export default function Account() {
  const { customer, signOut, settings, unread } = useStore();
  const navigate = useNavigate();
  const [panel, setPanel] = useState<'profile' | 'addresses' | null>(null);
  const [canInstall, setCanInstall] = useState(Boolean(deferredInstall));
  useEffect(() => {
    const h = () => setCanInstall(true);
    window.addEventListener('beforeinstallprompt', h);
    return () => window.removeEventListener('beforeinstallprompt', h);
  }, []);

  if (panel && customer) {
    return (<><PageHeader title={panel === 'profile' ? 'Profile & settings' : 'Saved addresses'} back={false} right={<button onClick={() => setPanel(null)} className="grid h-10 w-10 place-items-center" aria-label="Close"><Icon name="close" /></button>} />{panel === 'profile' ? <Profile c={customer} /> : <Addresses />}</>);
  }

  return (
    <div>
      <PageHeader title="Account" back={false} />
      <div className="bg-ink px-5 py-8 text-ivory">
        {customer ? (
          <>
            <p className="eyebrow text-champagne">Welcome</p>
            <h2 className="text-3xl">{customer.name}</h2>
            <p className="text-sm text-ivory/60">+91 {customer.mobile}</p>
          </>
        ) : (
          <>
            <h2 className="text-3xl">Your account</h2>
            <p className="mt-1 text-sm text-ivory/60">Log in to track orders, save addresses and keep your wishlist on every device.</p>
            <div className="mt-5 flex gap-3"><Link to="/login" className="btn-gold flex-1">Log in</Link><Link to="/register" className="btn flex-1 border border-ivory/40 text-ivory">Register</Link></div>
          </>
        )}
      </div>
      <div className="divide-y divide-sand/70 border-b border-sand/70">
        <Row icon="bag" label="My Orders" to="/orders" />
        <Row icon="heart" label="Wishlist" to="/wishlist" />
        {customer && <Row icon="bell" label="Notifications" to="/notifications" badge={unread > 0 && <span className="rounded-full bg-champagne px-2 text-xs">{unread}</span>} />}
        {customer && <Row icon="pin" label="Saved Addresses" onClick={() => setPanel('addresses')} />}
        {customer && <Row icon="user" label="Profile & Account Settings" onClick={() => setPanel('profile')} />}
        {customer && <PushToggle />}
        <Row icon="shield" label="Replacement Policy" to="/policy" />
        {settings?.whatsappNumber && <Row icon="spark" label="Contact the shop on WhatsApp" href={waLink(settings.whatsappNumber, `Hello ${settings.shopName}!`)} />}
        {canInstall && <Row icon="plus" label="Install app on this phone" onClick={async () => { await deferredInstall?.prompt(); deferredInstall = null; setCanInstall(false); }} />}
        {customer && <Row icon="logout" label="Log out" onClick={() => { disablePush().catch(() => {}).finally(signOut); navigate('/'); }} />}
      </div>
      {settings?.whatsappNumber && (
        <p className="flex items-center justify-center gap-2 px-4 py-8 text-xs text-muted"><WhatsAppIcon /> Customer support: +{settings.whatsappNumber.replace(/\D/g, '')}</p>
      )}
    </div>
  );
}

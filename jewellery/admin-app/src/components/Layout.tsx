import { useEffect, useState } from 'react';
import { NavLink, Outlet, useLocation } from 'react-router-dom';
import { useSession, type Alerts, type Role } from '../lib/session';
import { Icon, type IconName } from './Icon';

type Item = { to: string; label: string; icon: IconName; roles: Role[]; badge?: keyof Alerts };
export const NAV: { section: string; items: Item[] }[] = [
  { section: 'Overview', items: [
    { to: '/', label: 'Dashboard', icon: 'chart', roles: ['owner'] },
    { to: '/deliveries', label: 'My Deliveries', icon: 'truck', roles: ['employee'], badge: 'assignedOpen' },
  ] },
  { section: 'Sales', items: [
    { to: '/orders', label: 'Orders', icon: 'bag', roles: ['owner', 'admin'], badge: 'new_orders' },
    { to: '/payments', label: 'Payments', icon: 'rupee', roles: ['owner'], badge: 'verification_pending' },
    { to: '/replacements', label: 'Replacements', icon: 'shield', roles: ['owner', 'admin'], badge: 'open_replacements' },
    { to: '/customers', label: 'Customers', icon: 'users', roles: ['owner', 'admin'] },
  ] },
  { section: 'Catalogue', items: [
    { to: '/products', label: 'Products', icon: 'tag', roles: ['owner', 'admin'] },
    { to: '/categories', label: 'Categories', icon: 'grid', roles: ['owner', 'admin'] },
    { to: '/inventory', label: 'Inventory', icon: 'box', roles: ['owner', 'admin'], badge: 'low_stock' },
    { to: '/import', label: 'Bulk Import', icon: 'upload', roles: ['owner', 'admin'] },
    { to: '/demo-data', label: 'Demo Data', icon: 'spark', roles: ['owner'] },
  ] },
  { section: 'Business', items: [
    { to: '/offers', label: 'Offers & Promotions', icon: 'megaphone', roles: ['owner'] },
    { to: '/employees', label: 'Employees', icon: 'user', roles: ['owner', 'admin'] },
    { to: '/reports', label: 'Reports', icon: 'file', roles: ['owner', 'admin'] },
    { to: '/settings', label: 'Store Settings', icon: 'settings', roles: ['owner'] },
    { to: '/audit', label: 'Audit Log', icon: 'eye', roles: ['owner'] },
  ] },
];

export const homeFor = (role: Role) => (role === 'owner' ? '/' : role === 'admin' ? '/orders' : '/deliveries');

export function Layout() {
  const { staff, logout, alerts, toast } = useSession();
  const [open, setOpen] = useState(false);
  const { pathname } = useLocation();
  useEffect(() => setOpen(false), [pathname]);
  if (!staff) return null;

  const nav = (
    <nav aria-label="Main" className="flex h-full flex-col">
      <div className="px-5 pb-4 pt-5">
        <p className="font-display text-2xl font-semibold leading-none">Control Center</p>
        <p className="mt-1 text-[11px] uppercase tracking-[0.2em] text-gold">Jewellery store</p>
      </div>
      <div className="flex-1 space-y-4 overflow-y-auto px-3 pb-4">
        {NAV.map(({ section, items }) => {
          const visible = items.filter((i) => i.roles.includes(staff.role));
          if (!visible.length) return null;
          return (
            <div key={section}>
              <p className="px-2 pb-1 text-[10px] font-semibold uppercase tracking-[0.18em] text-muted/80">{section}</p>
              {visible.map((i) => {
                const n = i.badge ? alerts[i.badge] || 0 : 0;
                return (
                  <NavLink key={i.to} to={i.to} end={i.to === '/'}
                    className={({ isActive }) => `flex items-center gap-3 rounded-md px-2.5 py-2 text-[13.5px] transition ${isActive ? 'bg-ink text-paper' : 'text-ink hover:bg-gold-soft'}`}>
                    <Icon name={i.icon} className="text-[17px]" />
                    <span className="flex-1">{i.label}</span>
                    {n > 0 && <span className="rounded-full bg-gold px-1.5 text-[11px] font-semibold text-white" aria-label={`${n} need attention`}>{n}</span>}
                  </NavLink>
                );
              })}
            </div>
          );
        })}
      </div>
      <div className="border-t border-line p-3">
        <NavLink to="/account" className="flex items-center gap-3 rounded-md px-2 py-2 hover:bg-gold-soft">
          <span className="grid h-8 w-8 place-items-center rounded-full bg-gold-soft font-semibold text-gold-dark">{staff.name[0]}</span>
          <span className="min-w-0 flex-1"><span className="block truncate text-[13px] font-medium">{staff.name}</span><span className="block text-[11px] capitalize text-muted">{staff.role}</span></span>
        </NavLink>
        <button onClick={logout} className="mt-1 flex w-full items-center gap-3 rounded-md px-2 py-2 text-[13px] text-muted hover:bg-gold-soft"><Icon name="logout" /> Log out</button>
      </div>
    </nav>
  );

  return (
    <div className="min-h-dvh lg:grid lg:grid-cols-[240px_1fr]">
      <aside className="sticky top-0 hidden h-dvh border-r border-line bg-paper lg:block">{nav}</aside>
      <header className="sticky top-0 z-30 flex h-14 items-center gap-3 border-b border-line bg-paper/95 px-3 backdrop-blur lg:hidden">
        <button onClick={() => setOpen(true)} aria-label="Open menu" className="grid h-10 w-10 place-items-center rounded-md hover:bg-ivory"><Icon name="menu" /></button>
        <p className="font-display text-xl font-semibold">Control Center</p>
      </header>
      {open && (
        <div className="fixed inset-0 z-40 lg:hidden" role="dialog" aria-modal="true" aria-label="Menu">
          <button className="absolute inset-0 bg-ink/40" aria-label="Close menu" onClick={() => setOpen(false)} />
          <aside className="absolute inset-y-0 left-0 w-72 max-w-[85vw] bg-paper shadow-2xl">{nav}</aside>
        </div>
      )}
      <main className="min-w-0 px-4 py-6 sm:px-6 lg:px-8">
        <div className="mx-auto max-w-[1200px]"><Outlet /></div>
      </main>
      {toast && <div role="status" className="fixed bottom-5 left-1/2 z-50 -translate-x-1/2 rounded-lg bg-ink px-4 py-2.5 text-[13px] text-paper shadow-xl">{toast}</div>}
    </div>
  );
}

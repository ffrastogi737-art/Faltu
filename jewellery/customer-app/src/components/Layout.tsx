import { NavLink, Outlet, useLocation } from 'react-router-dom';
import { waLink } from '../lib/format';
import { useStore } from '../lib/store';
import { Icon, WhatsAppIcon, type IconName } from './Icon';

const TABS: [string, string, IconName][] = [
  ['/', 'Home', 'home'],
  ['/categories', 'Categories', 'grid'],
  ['/wishlist', 'Wishlist', 'heart'],
  ['/cart', 'Cart', 'bag'],
  ['/account', 'Account', 'user'],
];

export function Layout() {
  const { cartCount, wishlist, settings, toast } = useStore();
  const { pathname } = useLocation();
  const hideFab = /^\/(checkout|product\/)/.test(pathname);
  return (
    <div className="mx-auto min-h-dvh max-w-3xl bg-ivory pb-[calc(4.5rem+env(safe-area-inset-bottom))] shadow-[0_0_60px_rgba(0,0,0,0.04)]">
      <Outlet />
      {settings?.whatsappNumber && !hideFab && (
        <a href={waLink(settings.whatsappNumber, `Hello ${settings.shopName}, I need help with jewellery.`)} target="_blank" rel="noreferrer"
          aria-label="Chat with the shop on WhatsApp"
          className="fixed bottom-[calc(5.25rem+env(safe-area-inset-bottom))] right-4 z-40 grid h-13 w-13 place-items-center rounded-full bg-[#1f8f4e] p-3.5 text-white shadow-lg transition hover:scale-105 sm:right-[calc(50%-24rem+1rem)]">
          <WhatsAppIcon className="text-2xl" />
        </a>
      )}
      {toast && (
        <div role="status" className="fade-up fixed inset-x-0 bottom-[calc(5.5rem+env(safe-area-inset-bottom))] z-50 mx-auto w-fit max-w-[90vw] bg-ink px-5 py-3 text-sm text-ivory shadow-xl">{toast}</div>
      )}
      <nav className="pb-safe fixed inset-x-0 bottom-0 z-40 mx-auto max-w-3xl border-t border-sand/70 bg-ivory/95 backdrop-blur" aria-label="Main">
        <ul className="grid grid-cols-5">
          {TABS.map(([to, label, icon]) => {
            const count = to === '/cart' ? cartCount : to === '/wishlist' ? wishlist.size : 0;
            return (
              <li key={to}>
                <NavLink to={to} end={to === '/'} className={({ isActive }) => `relative flex flex-col items-center gap-1 py-2.5 text-[10px] uppercase tracking-[0.14em] transition ${isActive ? 'text-ink' : 'text-muted'}`}>
                  {({ isActive }) => (
                    <>
                      <span className={`absolute top-0 h-[2px] w-8 bg-champagne transition-transform duration-500 ${isActive ? 'scale-x-100' : 'scale-x-0'}`} />
                      <span className="relative">
                        <Icon name={icon} filled={isActive && icon === 'heart'} className="text-[22px]" />
                        {count > 0 && <span className="absolute -right-2.5 -top-1.5 grid h-4 min-w-4 place-items-center rounded-full bg-champagne px-1 text-[9px] font-semibold text-ink">{count}</span>}
                      </span>
                      {label}
                    </>
                  )}
                </NavLink>
              </li>
            );
          })}
        </ul>
      </nav>
    </div>
  );
}

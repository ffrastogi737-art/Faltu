import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { api, getToken } from './api';
import type { Customer, Product, Settings } from './types';

export type CartItem = { productId: number; quantity: number; name: string; slug: string; imageUrl: string | null; pricePaise: number; originalPaise: number };
type GuestOrder = { orderNumber: string; guestToken: string };

function load<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
}
function save(key: string, value: unknown) {
  try {
    if (value === null) localStorage.removeItem(key);
    else localStorage.setItem(key, typeof value === 'string' ? value : JSON.stringify(value));
  } catch { /* storage blocked: state still works for this session */ }
}

type Store = {
  settings: Settings | null;
  settingsError: string | null;
  reloadSettings: () => void;
  customer: Customer | null;
  signIn: (token: string, c: Customer) => void;
  signOut: () => void;
  setCustomer: (c: Customer) => void;
  cart: CartItem[];
  cartCount: number;
  addToCart: (p: Product, qty?: number) => void;
  setQuantity: (productId: number, qty: number) => void;
  removeFromCart: (productId: number) => void;
  clearCart: () => void;
  wishlist: Set<number>;
  toggleWishlist: (p: Product) => Promise<void>;
  guestOrders: GuestOrder[];
  addGuestOrder: (o: GuestOrder) => void;
  guestToken: (orderNumber: string) => string | undefined;
  unread: number;
  refreshUnread: () => void;
  toast: string | null;
  notify: (msg: string) => void;
};

const Ctx = createContext<Store>(null as unknown as Store);
export const useStore = () => useContext(Ctx);

export function StoreProvider({ children }: { children: ReactNode }) {
  const [settings, setSettings] = useState<Settings | null>(() => load('settings', null));
  const [settingsError, setSettingsError] = useState<string | null>(null);
  const [customer, setCustomerState] = useState<Customer | null>(() => (getToken() ? load('customer', null) : null));
  const [cart, setCart] = useState<CartItem[]>(() => load('cart', []));
  const [wishlist, setWishlist] = useState<Set<number>>(() => new Set(load<number[]>('wishlist', [])));
  const [guestOrders, setGuestOrders] = useState<GuestOrder[]>(() => load('guestOrders', []));
  const [unread, setUnread] = useState(0);
  const [toast, setToast] = useState<string | null>(null);
  const toastTimer = useRef<number>(undefined);

  const notify = useCallback((msg: string) => {
    setToast(msg);
    clearTimeout(toastTimer.current);
    toastTimer.current = window.setTimeout(() => setToast(null), 2600);
  }, []);

  const reloadSettings = useCallback(() => {
    api<Settings>('/settings')
      .then((s) => {
        setSettings(s);
        setSettingsError(null);
        save('settings', s);
        document.title = s.shopName;
      })
      .catch((e) => setSettingsError(e.message));
  }, []);
  useEffect(() => { reloadSettings(); }, [reloadSettings]);

  useEffect(() => { save('cart', cart); }, [cart]);
  useEffect(() => { save('wishlist', [...wishlist]); }, [wishlist]);
  useEffect(() => { save('guestOrders', guestOrders); }, [guestOrders]);

  const refreshUnread = useCallback(() => {
    if (!getToken()) return setUnread(0);
    api<{ unread: number }>('/notifications').then((r) => setUnread(r.unread)).catch(() => {});
  }, []);

  const loadWishlist = useCallback(async () => {
    const items = await api<Product[]>('/me/wishlist');
    setWishlist(new Set(items.map((p) => p.id)));
  }, []);

  const signOut = useCallback(() => {
    save('token', null);
    save('customer', null);
    setCustomerState(null);
    setWishlist(new Set());
    setUnread(0);
  }, []);

  const signIn = useCallback(async (token: string, c: Customer) => {
    save('token', token);
    save('customer', c);
    setCustomerState(c);
    // keep hearts added while browsing as a guest
    const local = load<number[]>('wishlist', []);
    await Promise.all(local.map((id) => api(`/me/wishlist/${id}`, { method: 'PUT' }).catch(() => {})));
    loadWishlist().catch(() => {});
    refreshUnread();
  }, [loadWishlist, refreshUnread]);

  useEffect(() => {
    if (!getToken()) return;
    api<Customer>('/me').then((c) => { setCustomerState(c); save('customer', c); }).catch(() => {});
    loadWishlist().catch(() => {});
    refreshUnread();
  }, [loadWishlist, refreshUnread]);

  useEffect(() => {
    const onExpired = () => signOut();
    window.addEventListener('auth:expired', onExpired);
    return () => window.removeEventListener('auth:expired', onExpired);
  }, [signOut]);

  // Live updates: settings changes (e.g. UPI discount), order status, new notifications.
  useEffect(() => {
    const token = getToken();
    const es = new EventSource(`${import.meta.env.VITE_API_URL || ''}/api/events${token ? `?token=${encodeURIComponent(token)}` : ''}`);
    es.addEventListener('settings', () => reloadSettings());
    es.addEventListener('order_update', () => window.dispatchEvent(new Event('order:update')));
    es.addEventListener('notification', () => {
      refreshUnread();
      window.dispatchEvent(new Event('notification:new'));
    });
    return () => es.close();
  }, [customer?.id, reloadSettings, refreshUnread]);

  const value = useMemo<Store>(() => ({
    settings,
    settingsError,
    reloadSettings,
    customer,
    signIn,
    signOut,
    setCustomer: (c) => { setCustomerState(c); save('customer', c); },
    cart,
    cartCount: cart.reduce((n, i) => n + i.quantity, 0),
    addToCart: (p, qty = 1) =>
      setCart((c) => {
        const existing = c.find((i) => i.productId === p.id);
        const snapshot = { name: p.name, slug: p.slug, imageUrl: p.images[0] || null, pricePaise: p.sellingPricePaise, originalPaise: p.originalPricePaise };
        if (existing) return c.map((i) => (i.productId === p.id ? { ...i, ...snapshot, quantity: Math.min(i.quantity + qty, Math.max(p.stock, 1)) } : i));
        return [...c, { productId: p.id, quantity: qty, ...snapshot }];
      }),
    setQuantity: (id, qty) => setCart((c) => c.map((i) => (i.productId === id ? { ...i, quantity: Math.max(1, Math.min(qty, 50)) } : i))),
    removeFromCart: (id) => setCart((c) => c.filter((i) => i.productId !== id)),
    clearCart: () => setCart([]),
    wishlist,
    toggleWishlist: async (p) => {
      const has = wishlist.has(p.id);
      setWishlist((w) => {
        const n = new Set(w);
        if (has) n.delete(p.id); else n.add(p.id);
        return n;
      });
      if (customer) {
        try {
          await api(`/me/wishlist/${p.id}`, { method: has ? 'DELETE' : 'PUT' });
        } catch (e) {
          setWishlist((w) => {
            const n = new Set(w);
            if (has) n.add(p.id); else n.delete(p.id);
            return n;
          });
          notify((e as Error).message);
          return;
        }
      }
      notify(has ? 'Removed from wishlist' : 'Saved to wishlist');
    },
    guestOrders,
    addGuestOrder: (o) => setGuestOrders((g) => [o, ...g.filter((x) => x.orderNumber !== o.orderNumber)].slice(0, 30)),
    guestToken: (n) => guestOrders.find((g) => g.orderNumber === n)?.guestToken,
    unread,
    refreshUnread,
    toast,
    notify,
  }), [settings, settingsError, reloadSettings, customer, signIn, signOut, cart, wishlist, guestOrders, unread, refreshUnread, toast, notify]);

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

// Small data hook: loads on mount / when deps change, exposes reload.
export function useLoad<T>(fn: () => Promise<T>, deps: unknown[]) {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [tick, setTick] = useState(0);
  useEffect(() => {
    let live = true;
    setLoading(true);
    fn()
      .then((d) => { if (live) { setData(d); setError(null); } })
      .catch((e) => { if (live) setError(e.message); })
      .finally(() => { if (live) setLoading(false); });
    return () => { live = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [...deps, tick]);
  const reload = useCallback(() => setTick((t) => t + 1), []);
  return { data, error, loading, reload, setData };
}

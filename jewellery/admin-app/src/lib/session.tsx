import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from 'react';
import { api, getToken, setToken } from './api';

export type Role = 'owner' | 'admin' | 'employee';
export type Staff = { id: number; name: string; mobile: string; role: Role };
export type Alerts = { new_orders?: number; verification_pending?: number; low_stock?: number; open_replacements?: number; cancelled_today?: number; assignedOpen?: number };

type Session = {
  staff: Staff | null;
  ready: boolean;
  login: (mobile: string, password: string) => Promise<Staff>;
  logout: () => void;
  alerts: Alerts;
  refreshAlerts: () => void;
  toast: string | null;
  notify: (msg: string) => void;
};
const Ctx = createContext<Session>(null as unknown as Session);
export const useSession = () => useContext(Ctx);

export function SessionProvider({ children }: { children: ReactNode }) {
  const [staff, setStaff] = useState<Staff | null>(null);
  const [ready, setReady] = useState(false);
  const [alerts, setAlerts] = useState<Alerts>({});
  const [toast, setToast] = useState<string | null>(null);
  const timer = useRef<number>(undefined);
  const notify = useCallback((m: string) => {
    setToast(m);
    clearTimeout(timer.current);
    timer.current = window.setTimeout(() => setToast(null), 3000);
  }, []);
  const refreshAlerts = useCallback(() => { api<Alerts>('/admin/alerts').then(setAlerts).catch(() => {}); }, []);
  const logout = useCallback(() => { setToken(null); setStaff(null); }, []);

  useEffect(() => {
    if (!getToken()) { setReady(true); return; }
    api<Staff>('/admin/me').then(setStaff).catch(() => setToken(null)).finally(() => setReady(true));
  }, []);
  useEffect(() => {
    window.addEventListener('auth:expired', logout);
    return () => window.removeEventListener('auth:expired', logout);
  }, [logout]);

  // Live: every order change (from the customer app or another staff member) refreshes alerts + open pages.
  useEffect(() => {
    if (!staff) return;
    refreshAlerts();
    const es = new EventSource(`/api/admin/events?token=${encodeURIComponent(getToken() || '')}`);
    es.addEventListener('order_update', () => { refreshAlerts(); window.dispatchEvent(new Event('data:changed')); });
    const t = setInterval(refreshAlerts, 60e3);
    return () => { es.close(); clearInterval(t); };
  }, [staff, refreshAlerts]);

  const login = async (mobile: string, password: string) => {
    const r = await api<{ token: string; staff: Staff }>('/admin/auth/login', 'POST', { mobile, password });
    setToken(r.token);
    setStaff(r.staff);
    return r.staff;
  };

  return <Ctx.Provider value={{ staff, ready, login, logout, alerts, refreshAlerts, toast, notify }}>{children}</Ctx.Provider>;
}

// Load data, reload on demand and whenever live data changes.
export function useLoad<T>(fn: () => Promise<T>, deps: unknown[], live = true) {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [tick, setTick] = useState(0);
  const reload = useCallback(() => setTick((t) => t + 1), []);
  useEffect(() => {
    let on = true;
    setLoading(true);
    fn().then((d) => { if (on) { setData(d); setError(null); } }).catch((e) => { if (on) setError(e.message); }).finally(() => { if (on) setLoading(false); });
    return () => { on = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [...deps, tick]);
  useEffect(() => {
    if (!live) return;
    window.addEventListener('data:changed', reload);
    return () => window.removeEventListener('data:changed', reload);
  }, [live, reload]);
  return { data, error, loading, reload, setData };
}

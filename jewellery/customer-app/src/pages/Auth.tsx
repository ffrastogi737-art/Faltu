import { useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { Field, PageHeader, Spinner } from '../components/ui';
import { api } from '../lib/api';
import { useStore } from '../lib/store';
import type { Customer } from '../lib/types';

export default function Auth({ mode }: { mode: 'login' | 'register' }) {
  const { signIn, settings } = useStore();
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const next = params.get('next')?.startsWith('/') ? params.get('next')! : '/account';
  const [form, setForm] = useState({ name: '', mobile: '', email: '', password: '', marketingOptIn: false });
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const set = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement>) => setForm({ ...form, [k]: e.target.value });

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setErr(null);
    try {
      const r = await api<{ token: string; customer: Customer }>(`/auth/${mode}`, { method: 'POST', body: mode === 'login' ? { mobile: form.mobile, password: form.password } : form });
      await signIn(r.token, r.customer);
      navigate(next, { replace: true });
    } catch (e) {
      setErr((e as Error).message);
      setBusy(false);
    }
  }

  return (
    <div>
      <PageHeader title="" />
      <form onSubmit={submit} className="fade-up mx-auto max-w-sm px-6 pt-6">
        <p className="eyebrow text-center">{settings?.brandName}</p>
        <h1 className="mt-1 text-center text-4xl">{mode === 'login' ? 'Welcome back' : 'Create account'}</h1>
        <p className="mt-2 text-center text-sm text-muted">{mode === 'login' ? 'Log in with your mobile number.' : 'Track orders, save addresses and keep your wishlist.'}</p>
        <div className="mt-8 space-y-5">
          {mode === 'register' && <Field label="Full name"><input required autoComplete="name" minLength={2} maxLength={80} value={form.name} onChange={set('name')} /></Field>}
          <Field label="Mobile number"><input required type="tel" inputMode="numeric" autoComplete="tel-national" pattern="[6-9][0-9]{9}" title="10-digit mobile number" maxLength={10} value={form.mobile} onChange={set('mobile')} /></Field>
          {mode === 'register' && <Field label="Email (optional)"><input type="email" autoComplete="email" maxLength={120} value={form.email} onChange={set('email')} /></Field>}
          <Field label="Password"><input required type="password" autoComplete={mode === 'login' ? 'current-password' : 'new-password'} minLength={mode === 'register' ? 8 : 1} maxLength={128} value={form.password} onChange={set('password')} /></Field>
        </div>
        {mode === 'register' && (
          <label className="mt-5 flex items-start gap-3 text-sm">
            <input type="checkbox" className="mt-0.5 h-4 w-4 accent-champagne-dark" checked={form.marketingOptIn} onChange={(e) => setForm({ ...form, marketingOptIn: e.target.checked })} />
            <span className="text-muted">Send me new arrivals, festival collections and offers (optional)</span>
          </label>
        )}
        {err && <p className="mt-4 text-sm text-ruby" role="alert">{err}</p>}
        <button disabled={busy} className="btn-dark mt-8 w-full">{busy ? <Spinner /> : mode === 'login' ? 'Log in' : 'Create account'}</button>
        <p className="mt-6 text-center text-sm text-muted">
          {mode === 'login' ? <>New here? <Link to={`/register?next=${encodeURIComponent(next)}`} className="text-ink underline">Create an account</Link></> : <>Already have an account? <Link to={`/login?next=${encodeURIComponent(next)}`} className="text-ink underline">Log in</Link></>}
        </p>
        {mode === 'login' && <p className="mt-3 text-center text-xs text-muted">Forgot your password? Message the shop on WhatsApp to reset it.</p>}
      </form>
    </div>
  );
}

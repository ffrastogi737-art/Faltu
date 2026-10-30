import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { homeFor } from '../components/Layout';
import { Field, Spinner } from '../components/ui';
import { useSession } from '../lib/session';

export default function Login() {
  const { login } = useSession();
  const navigate = useNavigate();
  const [mobile, setMobile] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setErr(null);
    try {
      const s = await login(mobile, password);
      navigate(homeFor(s.role), { replace: true });
    } catch (e) {
      setErr((e as Error).message);
      setBusy(false);
    }
  }
  return (
    <div className="grid min-h-dvh place-items-center bg-[radial-gradient(circle_at_30%_20%,#f4e9cf,transparent_55%)] px-4">
      <form onSubmit={submit} className="card w-full max-w-sm p-7">
        <p className="text-[11px] uppercase tracking-[0.25em] text-gold">Jewellery store</p>
        <h1 className="mt-1 font-display text-3xl font-semibold">Control Center</h1>
        <p className="mt-1 text-[13px] text-muted">Owner, admin and delivery staff sign in here.</p>
        <div className="mt-6 space-y-4">
          <Field label="Mobile number"><input required type="tel" inputMode="numeric" autoComplete="username" maxLength={10} value={mobile} onChange={(e) => setMobile(e.target.value)} /></Field>
          <Field label="Password"><input required type="password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} /></Field>
        </div>
        {err && <p role="alert" className="mt-3 text-[13px] text-bad">{err}</p>}
        <button disabled={busy} className="btn-primary mt-6 w-full py-2.5">{busy ? <Spinner /> : 'Sign in'}</button>
      </form>
    </div>
  );
}

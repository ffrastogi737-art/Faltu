import { useState } from 'react';
import { Card, ErrorBox, Field, PageHeader, Spinner } from '../components/ui';
import { api } from '../lib/api';
import { useSession } from '../lib/session';

export default function Account() {
  const { staff, notify } = useSession();
  const [pw, setPw] = useState({ current: '', next: '' });
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  return (
    <div className="max-w-md">
      <PageHeader title="My account" subtitle={`${staff?.name} · ${staff?.mobile} · ${staff?.role}`} />
      <Card title="Change password">
        <form className="space-y-3" onSubmit={async (e) => {
          e.preventDefault();
          setBusy(true);
          setErr(null);
          try { await api('/admin/me/password', 'POST', pw); setPw({ current: '', next: '' }); notify('Password changed'); } catch (e) { setErr((e as Error).message); } finally { setBusy(false); }
        }}>
          <Field label="Current password"><input required type="password" autoComplete="current-password" value={pw.current} onChange={(e) => setPw({ ...pw, current: e.target.value })} /></Field>
          <Field label="New password (min 8)"><input required minLength={8} type="password" autoComplete="new-password" value={pw.next} onChange={(e) => setPw({ ...pw, next: e.target.value })} /></Field>
          {err && <ErrorBox message={err} />}
          <button disabled={busy} className="btn-primary w-full">{busy ? <Spinner /> : 'Update password'}</button>
        </form>
      </Card>
    </div>
  );
}

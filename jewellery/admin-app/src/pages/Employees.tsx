import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Icon } from '../components/Icon';
import { Badge, Card, ErrorBox, Field, Loading, Modal, orderTone, PageHeader, Spinner, Table } from '../components/ui';
import { api } from '../lib/api';
import { dateTime, ORDER_STATUS, rupees } from '../lib/format';
import { useLoad, useSession } from '../lib/session';

type StaffRow = { id: number; name: string; mobile: string; role: string; active: boolean; created_at: string; open_orders: number; delivered: number };

function Editor({ s, onClose }: { s: Partial<StaffRow>; onClose: () => void }) {
  const { notify } = useSession();
  const [f, setF] = useState({ name: s.name || '', mobile: s.mobile || '', role: s.role || 'employee', active: s.active ?? true, password: '' });
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  return (
    <Modal title={s.id ? `Edit ${s.name}` : 'Add staff member'} onClose={onClose}>
      <form className="space-y-4" onSubmit={async (e) => {
        e.preventDefault();
        setBusy(true);
        setErr(null);
        try {
          if (s.id) {
            await api(`/admin/staff/${s.id}`, 'PUT', f);
            if (f.password) await api(`/admin/staff/${s.id}/password`, 'POST', { password: f.password });
          } else await api('/admin/staff', 'POST', f);
          notify('Saved');
          onClose();
        } catch (e) { setErr((e as Error).message); setBusy(false); }
      }}>
        <Field label="Name"><input required minLength={2} value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} /></Field>
        <Field label="Mobile number (login)"><input required inputMode="numeric" maxLength={10} value={f.mobile} onChange={(e) => setF({ ...f, mobile: e.target.value })} /></Field>
        <Field label="Role" hint="Employee: assigned deliveries only. Admin: products, orders, customers, replacements. Owner: everything incl. money and settings.">
          <select value={f.role} onChange={(e) => setF({ ...f, role: e.target.value })}><option value="employee">Employee (delivery)</option><option value="admin">Admin</option><option value="owner">Owner</option></select>
        </Field>
        <Field label={s.id ? 'Reset password (leave empty to keep)' : 'Password (min 8 characters)'}><input type="password" autoComplete="new-password" required={!s.id} minLength={8} value={f.password} onChange={(e) => setF({ ...f, password: e.target.value })} /></Field>
        {s.id && <label className="flex items-center gap-2"><input type="checkbox" checked={f.active} onChange={(e) => setF({ ...f, active: e.target.checked })} /> Active (can log in). Deactivating unassigns their open orders.</label>}
        {err && <ErrorBox message={err} />}
        <button disabled={busy} className="btn-primary w-full">{busy ? <Spinner /> : 'Save'}</button>
      </form>
    </Modal>
  );
}

function History({ s, onClose }: { s: StaffRow; onClose: () => void }) {
  const { data } = useLoad(() => api<{ deliveries: any[]; activity: any[] }>(`/admin/staff/${s.id}/history`), [s.id], false);
  return (
    <Modal title={`${s.name} · history`} onClose={onClose} wide>
      {!data ? <Loading /> : (
        <div className="space-y-5">
          <div><p className="label">Deliveries</p>
            <Table><tbody>{data.deliveries.map((o) => (
              <tr key={o.order_number} className="text-[13px]"><td><Link to={`/orders/${o.order_number}`} className="underline">#{o.order_number}</Link></td><td>{o.contact_name}</td>
                <td><Badge tone={orderTone(o.status)}>{ORDER_STATUS[o.status]}</Badge></td><td>{dateTime(o.delivered_at)}</td><td className="text-right">{o.payment_method === 'cod' ? `Cash ${o.cod_collected_paise != null ? rupees(o.cod_collected_paise) : '—'}` : 'UPI'}</td></tr>
            ))}</tbody></Table>
            {!data.deliveries.length && <p className="text-[13px] text-muted">No deliveries yet.</p>}
          </div>
          {data.activity.length > 0 && <div><p className="label">Activity</p>
            <ul className="space-y-1 text-[12px]">{data.activity.map((a, i) => <li key={i}>{dateTime(a.created_at)} · {a.action.replace(/_/g, ' ')} {a.entity} {a.entity_id && `#${a.entity_id}`}</li>)}</ul></div>}
        </div>
      )}
    </Modal>
  );
}

export default function Employees() {
  const { staff } = useSession();
  const owner = staff?.role === 'owner';
  const { data, error, reload } = useLoad(() => api<StaffRow[]>('/admin/staff'), []);
  const [edit, setEdit] = useState<Partial<StaffRow> | null>(null);
  const [hist, setHist] = useState<StaffRow | null>(null);
  return (
    <div>
      <PageHeader title={owner ? 'Employees & staff' : 'Delivery employees'} subtitle="Staff log in to this app with their mobile number."
        actions={owner && <button className="btn-primary" onClick={() => setEdit({})}><Icon name="plus" /> Add staff</button>} />
      {error && <ErrorBox message={error} onRetry={reload} />}
      {!data ? <Loading /> : (
        <Card>
          <Table>
            <thead><tr><th>Name</th><th>Mobile</th><th>Role</th><th className="text-right">Open orders</th><th className="text-right">Delivered</th><th>Status</th><th></th></tr></thead>
            <tbody>{data.map((s) => (
              <tr key={s.id}>
                <td className="font-medium">{s.name}</td><td>{s.mobile}</td><td className="capitalize">{s.role}</td>
                <td className="text-right tabular-nums">{s.open_orders}</td><td className="text-right tabular-nums">{s.delivered}</td>
                <td>{s.active ? <Badge tone="good">Active</Badge> : <Badge tone="bad">Deactivated</Badge>}</td>
                <td className="space-x-2 text-right whitespace-nowrap"><button className="btn-ghost" onClick={() => setHist(s)}>History</button>{owner && <button className="btn-ghost" onClick={() => setEdit(s)}>Edit</button>}</td>
              </tr>
            ))}</tbody>
          </Table>
        </Card>
      )}
      {edit && <Editor s={edit} onClose={() => { setEdit(null); reload(); }} />}
      {hist && <History s={hist} onClose={() => setHist(null)} />}
    </div>
  );
}

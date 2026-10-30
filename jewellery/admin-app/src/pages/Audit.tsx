import { Card, ErrorBox, Loading, PageHeader, Table } from '../components/ui';
import { api } from '../lib/api';
import { dateTime } from '../lib/format';
import { useLoad } from '../lib/session';

const detail = (d: Record<string, any>) => Object.entries(d || {}).map(([k, v]) => (v && typeof v === 'object' && 'from' in v ? `${k}: ${JSON.stringify(v.from)} → ${JSON.stringify(v.to)}` : `${k}: ${JSON.stringify(v)}`)).join(' · ');

export default function Audit() {
  const { data, error, reload } = useLoad(() => api<any[]>('/admin/audit'), []);
  return (
    <div>
      <PageHeader title="Audit log" subtitle="Who changed what: settings, payments, products, staff and exports." />
      {error && <ErrorBox message={error} onRetry={reload} />}
      {!data ? <Loading /> : (
        <Card>
          <Table>
            <thead><tr><th>When</th><th>Who</th><th>Action</th><th>Details</th></tr></thead>
            <tbody>{data.map((a) => (
              <tr key={a.id} className="text-[12.5px]">
                <td className="whitespace-nowrap">{dateTime(a.created_at)}</td>
                <td>{a.staff_name || '—'} <span className="capitalize text-muted">{a.staff_role}</span></td>
                <td className="whitespace-nowrap">{a.action.replace(/_/g, ' ')} {a.entity.replace(/_/g, ' ')} {a.entity_id && <span className="text-muted">#{a.entity_id}</span>}</td>
                <td className="max-w-xl break-words text-muted">{detail(a.details)}</td>
              </tr>
            ))}</tbody>
          </Table>
        </Card>
      )}
    </div>
  );
}

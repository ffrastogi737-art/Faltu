import { useState } from 'react';
import { Icon } from '../components/Icon';
import { Card, DateRange, Empty, ErrorBox, Loading, PageHeader, PRESETS, Table, type Range } from '../components/ui';
import { api, download } from '../lib/api';
import { useLoad, useSession } from '../lib/session';

const REPORTS: [string, string, ('owner' | 'admin')[]][] = [
  ['daily-sales', 'Daily sales', ['owner']], ['weekly-sales', 'Weekly sales', ['owner']], ['monthly-sales', 'Monthly sales', ['owner']],
  ['upi-collection', 'UPI collection', ['owner']], ['cod-collection', 'COD collection', ['owner']], ['upi-discount', 'UPI discount', ['owner']],
  ['product-sales', 'Product sales', ['owner']], ['inventory', 'Inventory', ['owner', 'admin']], ['employee-delivery', 'Employee delivery', ['owner']], ['replacements', 'Replacement requests', ['owner', 'admin']],
];
const cell = (v: unknown) => (v === null || v === undefined ? '—' : typeof v === 'boolean' ? (v ? 'Yes' : 'No') : typeof v === 'string' && /^\d{4}-\d{2}-\d{2}T/.test(v) ? new Date(v).toLocaleString('en-IN') : String(v));

export default function Reports() {
  const { staff, notify } = useSession();
  const mine = REPORTS.filter(([, , r]) => r.includes(staff!.role as 'owner'));
  const [type, setType] = useState(mine[0][0]);
  const [range, setRange] = useState<Range>(PRESETS[3][1]());
  const { data, error, loading } = useLoad(() => api<Record<string, unknown>[]>(`/admin/reports/${type}?from=${range.from}&to=${range.to}`), [type, range.from, range.to]);
  const cols = data?.[0] ? Object.keys(data[0]) : [];
  return (
    <div>
      <PageHeader title="Reports" subtitle="Amounts in rupees. Export any report as CSV for your accountant."
        actions={<button className="btn-primary" onClick={() => download(`/admin/reports/${type}?from=${range.from}&to=${range.to}&format=csv`, `${type}-${range.from}-to-${range.to}.csv`).catch((e) => notify(e.message))}><Icon name="download" /> Export CSV</button>} />
      <div className="mb-4 flex flex-wrap gap-2">
        {mine.map(([k, l]) => <button key={k} onClick={() => setType(k)} aria-pressed={type === k} className={`btn ${type === k ? 'bg-ink text-paper' : 'border border-line bg-white hover:border-gold'}`}>{l}</button>)}
      </div>
      {type !== 'inventory' && <div className="mb-4"><DateRange value={range} onChange={setRange} /></div>}
      <Card>
        {error && <ErrorBox message={error} />}
        {loading && !data ? <Loading /> : data && !data.length ? <Empty icon="file" title="No rows for this period" /> : data && (
          <Table>
            <thead><tr>{cols.map((c) => <th key={c}>{c.replace(/_/g, ' ')}</th>)}</tr></thead>
            <tbody>{data.map((r, i) => <tr key={i} className="text-[13px]">{cols.map((c) => <td key={c} className={typeof r[c] === 'number' ? 'text-right tabular-nums' : ''}>{cell(r[c])}</td>)}</tr>)}</tbody>
          </Table>
        )}
      </Card>
    </div>
  );
}

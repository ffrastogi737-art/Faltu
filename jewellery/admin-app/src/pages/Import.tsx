import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Icon } from '../components/Icon';
import { Badge, Card, ErrorBox, PageHeader, Spinner, Stat, Table } from '../components/ui';
import { api } from '../lib/api';
import { rupees } from '../lib/format';
import { useSession } from '../lib/session';

type Result = { totalRows: number; validCount: number; invalidCount: number; duplicateSkus: string[]; imported: number;
  rows: { row: number; name: string; sku: string; category: string; valid: boolean; errors: string[]; originalPaise?: number; sellingPaise?: number; stock?: number }[] };
const TEMPLATE = 'Product Name,SKU,Category,Original Price,Selling Price,Stock,Description\nKundan Jhumka,KJ-EAR-001,Earrings,1499,999,10,"Gold-plated jhumka with kundan stones"\n';

export default function Import() {
  const { notify } = useSession();
  const [csv, setCsv] = useState('');
  const [res, setRes] = useState<Result | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  async function run(commit: boolean) {
    setBusy(true);
    setErr(null);
    try {
      const r = await api<Result>('/admin/products/import', 'POST', { csv, commit });
      setRes(r);
      if (commit) { notify(`${r.imported} products imported`); setCsv(''); }
    } catch (e) { setErr((e as Error).message); } finally { setBusy(false); }
  }
  return (
    <div>
      <PageHeader title="Bulk product import" subtitle="Upload a CSV, check the preview, then import. Invalid rows are never imported. Add photos to each product afterwards."
        actions={<a className="btn-ghost" download="product-template.csv" href={`data:text/csv;charset=utf-8,${encodeURIComponent(TEMPLATE)}`}><Icon name="download" /> Template</a>} />
      <Card title="1 · Choose CSV">
        <input type="file" accept=".csv,text/csv" aria-label="CSV file" onChange={async (e) => { const f = e.target.files?.[0]; if (f) { setCsv(await f.text()); setRes(null); } }} />
        <p className="mt-2 text-[12px] text-muted">Columns: Product Name, SKU, Category, Original Price, Selling Price, Stock, Description. Category must match an existing category name. Prices in rupees.</p>
        {csv && <p className="mt-2 text-[13px]">{csv.split(/\r?\n/).filter(Boolean).length - 1} data rows loaded.</p>}
        <button disabled={!csv || busy} onClick={() => run(false)} className="btn-primary mt-3">{busy ? <Spinner /> : 'Validate & preview'}</button>
      </Card>
      {err && <div className="mt-4"><ErrorBox message={err} /></div>}
      {res && (
        <Card title={res.imported ? '3 · Imported' : '2 · Preview'} className="mt-5">
          <div className="mb-4 grid grid-cols-2 gap-3 md:grid-cols-4">
            <Stat label="Total rows" value={res.totalRows} />
            <Stat label="Valid products" value={res.validCount} tone="good" />
            <Stat label="Invalid" value={res.invalidCount} tone={res.invalidCount ? 'bad' : undefined} />
            <Stat label="Duplicate SKUs" value={res.duplicateSkus.length} tone={res.duplicateSkus.length ? 'warn' : undefined} hint={res.duplicateSkus.slice(0, 5).join(', ')} />
          </div>
          <Table>
            <thead><tr><th>Row</th><th>Product</th><th>SKU</th><th>Category</th><th className="text-right">MRP</th><th className="text-right">Price</th><th className="text-right">Stock</th><th>Result</th></tr></thead>
            <tbody>{res.rows.map((r) => (
              <tr key={r.row} className={r.valid ? '' : 'bg-bad/5'}>
                <td>{r.row}</td><td>{r.name}</td><td>{r.sku}</td><td>{r.category}</td>
                <td className="text-right">{r.originalPaise != null ? rupees(r.originalPaise) : ''}</td><td className="text-right">{r.sellingPaise != null ? rupees(r.sellingPaise) : ''}</td><td className="text-right">{r.stock ?? ''}</td>
                <td>{r.valid ? <Badge tone="good">OK</Badge> : <span className="text-[12px] text-bad">{r.errors.join('; ')}</span>}</td>
              </tr>
            ))}</tbody>
          </Table>
          {res.imported ? (
            <p className="mt-4 text-[13px]">{res.imported} products added. <Link to="/products" className="underline">Add photos in Products →</Link></p>
          ) : (
            <button disabled={!res.validCount || busy} onClick={() => run(true)} className="btn-gold mt-4">{busy ? <Spinner /> : `Import ${res.validCount} valid product(s)`}</button>
          )}
        </Card>
      )}
    </div>
  );
}

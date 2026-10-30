import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Badge, Card, ErrorBox, Loading, PageHeader, Spinner, Table } from '../components/ui';
import { api } from '../lib/api';
import { dateTime } from '../lib/format';
import { useLoad, useSession } from '../lib/session';
import type { AdminProduct } from './Products';

export function StockAdjust({ productId, onDone }: { productId: number; onDone: () => void }) {
  const { notify } = useSession();
  const [mode, setMode] = useState<'add' | 'remove'>('add');
  const [qty, setQty] = useState('');
  const [reason, setReason] = useState('restock');
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  async function submit() {
    setBusy(true);
    setErr(null);
    try {
      const change = (mode === 'add' ? 1 : -1) * Number(qty);
      const r = await api<{ stock: number }>(`/admin/products/${productId}/stock`, 'POST', { change, reason, note });
      notify(`Stock is now ${r.stock}`);
      setQty(''); setNote('');
      onDone();
    } catch (e) { setErr((e as Error).message); } finally { setBusy(false); }
  }
  // not a <form>: this sits inside the product form on the edit page
  return (
    <div className="space-y-2">
      <div className="grid grid-cols-[auto_1fr] gap-2">
        <select aria-label="Add or remove" value={mode} onChange={(e) => { setMode(e.target.value as 'add'); setReason(e.target.value === 'add' ? 'restock' : 'damaged'); }} className="!w-auto">
          <option value="add">Add</option><option value="remove">Remove</option>
        </select>
        <input aria-label="Quantity" type="number" min={1} placeholder="Qty" value={qty} onChange={(e) => setQty(e.target.value)} />
      </div>
      <div className="grid grid-cols-2 gap-2">
        <select aria-label="Reason" value={reason} onChange={(e) => setReason(e.target.value)}>
          <option value="restock">New stock received</option><option value="damaged">Damaged / lost</option><option value="correction">Count correction</option><option value="adjustment">Other adjustment</option>
        </select>
        <input aria-label="Note" placeholder="Note (optional)" value={note} onChange={(e) => setNote(e.target.value)} maxLength={200} />
      </div>
      {err && <ErrorBox message={err} />}
      <button type="button" disabled={busy || !(Number(qty) > 0)} onClick={submit} className="btn-gold w-full">{busy ? <Spinner /> : 'Update stock'}</button>
    </div>
  );
}

export default function Inventory() {
  const [onlyLow, setOnlyLow] = useState(true);
  const products = useLoad(() => api<{ items: AdminProduct[] }>(`/admin/products?status=${onlyLow ? 'low' : 'active'}`), [onlyLow]);
  const moves = useLoad(() => api<any[]>('/admin/inventory/movements'), []);
  const [editing, setEditing] = useState<number | null>(null);
  return (
    <div>
      <PageHeader title="Inventory" subtitle="Stock is reserved when a customer places an order and restored automatically if the order is cancelled. Overselling is blocked by the server." />
      <div className="grid gap-5 xl:grid-cols-[1.3fr_1fr]">
        <Card title={onlyLow ? 'Low stock' : 'All active products'} actions={<label className="flex items-center gap-2 text-[12px]"><input type="checkbox" checked={onlyLow} onChange={(e) => setOnlyLow(e.target.checked)} /> Low stock only</label>}>
          {products.error && <ErrorBox message={products.error} onRetry={products.reload} />}
          {!products.data ? <Loading /> : !products.data.items.length ? <p className="py-6 text-center text-muted">Nothing is running low.</p> : (
            <Table>
              <thead><tr><th>Product</th><th className="text-right">Stock</th><th></th></tr></thead>
              <tbody>{products.data.items.map((p) => (
                <tr key={p.id}>
                  <td><Link to={`/products/${p.id}`} className="font-medium hover:underline">{p.name}</Link><span className="block text-[11px] text-muted">SKU {p.sku}</span>
                    {editing === p.id && <div className="mt-2 max-w-sm"><StockAdjust productId={p.id} onDone={() => { setEditing(null); products.reload(); moves.reload(); }} /></div>}</td>
                  <td className="text-right">{p.stock === 0 ? <Badge tone="bad">Out of stock</Badge> : <Badge tone={p.stock <= 3 ? 'warn' : 'neutral'}>{p.stock}</Badge>}</td>
                  <td className="text-right"><button className="btn-ghost" onClick={() => setEditing(editing === p.id ? null : p.id)}>{editing === p.id ? 'Close' : 'Adjust'}</button></td>
                </tr>
              ))}</tbody>
            </Table>
          )}
        </Card>
        <Card title="Recent stock movements">
          {!moves.data ? <Loading /> : (
            <Table>
              <tbody>{moves.data.slice(0, 40).map((m) => (
                <tr key={m.id} className="text-[12px]">
                  <td className="whitespace-nowrap">{dateTime(m.created_at)}</td>
                  <td>{m.sku}<span className="block capitalize text-muted">{m.reason}{m.order_number && ` · #${m.order_number}`}{m.staff_name && ` · ${m.staff_name}`}{m.note && ` · ${m.note}`}</span></td>
                  <td className={`text-right tabular-nums ${m.change < 0 ? 'text-bad' : 'text-good'}`}>{m.change > 0 ? '+' : ''}{m.change}</td>
                  <td className="text-right tabular-nums text-muted">= {m.stock_after}</td>
                </tr>
              ))}</tbody>
            </Table>
          )}
        </Card>
      </div>
    </div>
  );
}

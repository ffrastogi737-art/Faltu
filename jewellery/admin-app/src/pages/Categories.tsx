import { useState } from 'react';
import { Icon } from '../components/Icon';
import { SingleUpload } from '../components/MediaPicker';
import { Badge, Card, ErrorBox, Field, Loading, Modal, PageHeader, Spinner } from '../components/ui';
import { api } from '../lib/api';
import { useLoad, useSession } from '../lib/session';
import type { Category } from './Products';

function Editor({ c, onClose }: { c: Partial<Category>; onClose: () => void }) {
  const { notify } = useSession();
  const [name, setName] = useState(c.name || '');
  const [image, setImage] = useState<string | null>(c.image_url || null);
  const [active, setActive] = useState(c.active ?? true);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  return (
    <Modal title={c.id ? 'Edit category' : 'Add category'} onClose={onClose}>
      <form className="space-y-4" onSubmit={async (e) => {
        e.preventDefault();
        setBusy(true);
        try {
          await api(c.id ? `/admin/categories/${c.id}` : '/admin/categories', c.id ? 'PUT' : 'POST', { name, slug: c.slug || name, imageUrl: image, active });
          notify('Category saved');
          onClose();
        } catch (e) { setErr((e as Error).message); setBusy(false); }
      }}>
        <Field label="Name"><input required minLength={2} maxLength={60} value={name} onChange={(e) => setName(e.target.value)} /></Field>
        <div><span className="label">Category image</span><SingleUpload kind="category" label="Image" value={image} onChange={setImage} /></div>
        <label className="flex items-center gap-2"><input type="checkbox" checked={active} onChange={(e) => setActive(e.target.checked)} /> Active (shown in the customer app)</label>
        {err && <ErrorBox message={err} />}
        <button disabled={busy} className="btn-primary w-full">{busy ? <Spinner /> : 'Save'}</button>
      </form>
    </Modal>
  );
}

export default function Categories() {
  const { notify } = useSession();
  const { data, error, reload, setData } = useLoad(() => api<Category[]>('/admin/categories'), []);
  const [edit, setEdit] = useState<Partial<Category> | null>(null);
  async function move(i: number, d: number) {
    const list = [...data!];
    [list[i], list[i + d]] = [list[i + d], list[i]];
    setData(list);
    await api('/admin/categories/reorder', 'POST', { ids: list.map((c) => c.id) }).catch((e) => notify(e.message));
  }
  async function remove(c: Category) {
    if (!confirm(`Delete category ${c.name}?`)) return;
    try { await api(`/admin/categories/${c.id}`, 'DELETE'); notify('Category deleted'); reload(); } catch (e) { notify((e as Error).message); }
  }
  return (
    <div>
      <PageHeader title="Categories" subtitle="Order here = order in the customer app." actions={<button className="btn-primary" onClick={() => setEdit({})}><Icon name="plus" /> Add category</button>} />
      {error && <ErrorBox message={error} onRetry={reload} />}
      {!data ? <Loading /> : (
        <Card>
          <ul className="divide-y divide-line">
            {data.map((c, i) => (
              <li key={c.id} className="flex items-center gap-3 py-2.5">
                <span className="flex flex-col">
                  <button aria-label={`Move ${c.name} up`} disabled={i === 0} onClick={() => move(i, -1)} className="disabled:opacity-20"><Icon name="arrowUp" /></button>
                  <button aria-label={`Move ${c.name} down`} disabled={i === data.length - 1} onClick={() => move(i, 1)} className="disabled:opacity-20"><Icon name="arrowDown" /></button>
                </span>
                {c.image_url ? <img src={c.image_url} alt="" className="h-12 w-12 rounded-full object-cover ring-1 ring-line" /> : <span className="h-12 w-12 rounded-full bg-ivory" />}
                <span className="flex-1"><b className="font-medium">{c.name}</b> <span className="text-[12px] text-muted">· {c.product_count} products</span>{c.image_url?.endsWith('.svg') && <Badge tone="gold">Demo image</Badge>}</span>
                {!c.active && <Badge tone="warn">Inactive</Badge>}
                <button className="btn-ghost" onClick={() => setEdit(c)}>Edit</button>
                <button className="btn-danger" onClick={() => remove(c)} aria-label={`Delete ${c.name}`}><Icon name="trash" /></button>
              </li>
            ))}
          </ul>
        </Card>
      )}
      {edit && <Editor c={edit} onClose={() => { setEdit(null); reload(); }} />}
    </div>
  );
}

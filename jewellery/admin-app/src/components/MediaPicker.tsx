import { useState } from 'react';
import { upload } from '../lib/api';
import { Icon } from './Icon';
import { Spinner } from './ui';

const IMAGE_TYPES = 'image/jpeg,image/png,image/webp';

// Multiple product photos: upload from gallery/camera/desktop, preview, reorder, set main, replace, delete.
export function ImageManager({ value, onChange, max = 12 }: { value: string[]; onChange: (v: string[]) => void; max?: number }) {
  const [busy, setBusy] = useState(0);
  const [err, setErr] = useState<string | null>(null);
  async function add(files: FileList | null, replaceAt?: number) {
    if (!files?.length) return;
    setErr(null);
    const list = [...files].slice(0, replaceAt === undefined ? max - value.length : 1);
    setBusy(list.length);
    const urls: string[] = [];
    for (const f of list) {
      try { urls.push((await upload('product', f)).url); } catch (e) { setErr(`${f.name}: ${(e as Error).message}`); }
      setBusy((n) => n - 1);
    }
    if (replaceAt !== undefined && urls[0]) onChange(value.map((u, i) => (i === replaceAt ? urls[0] : u)));
    else onChange([...value, ...urls]);
  }
  const move = (i: number, d: number) => { const v = [...value]; [v[i], v[i + d]] = [v[i + d], v[i]]; onChange(v); };
  return (
    <div>
      <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
        {value.map((src, i) => (
          <li key={src + i} className={`overflow-hidden rounded-lg border ${i === 0 ? 'border-gold ring-2 ring-gold/30' : 'border-line'} bg-white`}>
            <a href={src} target="_blank" rel="noreferrer" title="Preview full size"><img src={src} alt={`Product image ${i + 1}`} className="aspect-square w-full object-cover" /></a>
            <div className="flex items-center justify-between gap-1 border-t border-line px-1.5 py-1 text-[11px]">
              {i === 0 ? <span className="font-semibold text-gold-dark">Main image</span> : <button type="button" className="underline" onClick={() => onChange([src, ...value.filter((_, j) => j !== i)])}>Set main</button>}
              <span className="flex">
                <button type="button" aria-label={`Move image ${i + 1} earlier`} disabled={i === 0} onClick={() => move(i, -1)} className="grid h-7 w-7 place-items-center disabled:opacity-30"><Icon name="back" /></button>
                <button type="button" aria-label={`Move image ${i + 1} later`} disabled={i === value.length - 1} onClick={() => move(i, 1)} className="grid h-7 w-7 place-items-center disabled:opacity-30"><Icon name="chevron" /></button>
                <label className="grid h-7 w-7 cursor-pointer place-items-center" aria-label={`Replace image ${i + 1}`} title="Replace">
                  <Icon name="edit" /><input type="file" accept={IMAGE_TYPES} className="sr-only" onChange={(e) => { add(e.target.files, i); e.target.value = ''; }} />
                </label>
                <button type="button" aria-label={`Delete image ${i + 1}`} onClick={() => onChange(value.filter((_, j) => j !== i))} className="grid h-7 w-7 place-items-center text-bad"><Icon name="trash" /></button>
              </span>
            </div>
          </li>
        ))}
        {value.length < max && (
          <li>
            <label className="grid aspect-square cursor-pointer place-items-center rounded-lg border-2 border-dashed border-gold/50 bg-gold-soft/30 text-center text-[12px] text-gold-dark hover:bg-gold-soft">
              {busy ? <span className="flex items-center gap-2"><Spinner /> Uploading {busy}…</span> : <span><Icon name="upload" className="mx-auto mb-1 block text-2xl" />Add photos<br /><span className="text-muted">JPG, PNG, WebP</span></span>}
              <input type="file" accept={IMAGE_TYPES} multiple className="sr-only" aria-label="Upload product photos" onChange={(e) => { add(e.target.files); e.target.value = ''; }} />
            </label>
          </li>
        )}
      </ul>
      {err && <p role="alert" className="mt-2 text-[12px] text-bad">{err}</p>}
      <p className="mt-2 text-[12px] text-muted">Photos are optimised for the web automatically (max 1600 px, quality kept high). The first photo is shown on product cards.</p>
    </div>
  );
}

// One image or video (logo, icon, category image, banner, product video) with preview, replace and remove.
export function SingleUpload({ kind, value, onChange, label, video = false, round = false }: { kind: string; value: string | null; onChange: (v: string | null) => void; label: string; video?: boolean; round?: boolean }) {
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  async function pick(f?: File) {
    if (!f) return;
    setBusy(true);
    setErr(null);
    try { onChange((await upload(kind, f)).url); } catch (e) { setErr((e as Error).message); } finally { setBusy(false); }
  }
  return (
    <div>
      <div className="flex items-center gap-4">
        <div className={`grid h-24 w-24 shrink-0 place-items-center overflow-hidden border border-line bg-[repeating-conic-gradient(#f3eee2_0_25%,#fff_0_50%)] bg-[length:16px_16px] ${round ? 'rounded-2xl' : 'rounded-lg'}`}>
          {value ? (video ? <video src={value} className="h-full w-full object-cover" muted /> : <img src={value} alt={`${label} preview`} className="h-full w-full object-contain" />) : <span className="text-[11px] text-muted">None</span>}
        </div>
        <div className="flex flex-col gap-2">
          <label className="btn-ghost cursor-pointer">
            {busy ? <Spinner /> : <Icon name="upload" />} {value ? 'Replace' : 'Upload'} {label.toLowerCase()}
            <input type="file" className="sr-only" aria-label={`Upload ${label}`} accept={video ? 'video/mp4,video/webm,video/quicktime' : IMAGE_TYPES} onChange={(e) => { pick(e.target.files?.[0]); e.target.value = ''; }} />
          </label>
          {value && <button type="button" className="btn-danger" onClick={() => onChange(null)}>Remove</button>}
        </div>
      </div>
      {err && <p role="alert" className="mt-2 text-[12px] text-bad">{err}</p>}
    </div>
  );
}

import { useState } from 'react';
import { compact, rupees } from '../lib/format';

// Series colours validated for contrast and colour-blind separation on the paper surface.
export const SERIES = { gold: '#b07a1a', blue: '#3b6fb6' };

type Point = { label: string; value: number; detail?: string };

// Single-series column chart (money over time). Hover/focus a column for its value; table view below.
export function Columns({ points, title, format = rupees }: { points: Point[]; title: string; format?: (n: number) => string }) {
  const [hover, setHover] = useState<number | null>(null);
  const max = Math.max(1, ...points.map((p) => p.value));
  const H = 160;
  const every = Math.ceil(points.length / 6); // keep axis labels from colliding
  const h = hover === null ? null : points[hover];
  return (
    <figure>
      <figcaption className="sr-only">{title}</figcaption>
      <div className="relative">
        <div className="pointer-events-none absolute inset-x-0 top-0 flex justify-between text-[11px] text-muted"><span>{compact(max)}</span></div>
        <div className="flex items-end gap-[2px] border-b border-line pt-5" style={{ height: H + 20 }}>
          {points.map((p, i) => (
            <button key={i} type="button" aria-label={`${p.label}: ${format(p.value)}`}
              onPointerEnter={() => setHover(i)} onPointerLeave={() => setHover(null)} onFocus={() => setHover(i)} onBlur={() => setHover(null)}
              className="group flex h-full min-w-0 flex-1 items-end justify-center focus:outline-none">
              <span className={`w-full max-w-10 rounded-t-[4px] transition-opacity ${hover === null || hover === i ? 'opacity-100' : 'opacity-60'}`}
                style={{ height: `${Math.max(p.value ? 2 : 0, (p.value / max) * H)}px`, background: SERIES.gold }} />
            </button>
          ))}
        </div>
        {h && (
          <div className="pointer-events-none absolute top-0 z-10 -translate-x-1/2 rounded-md border border-line bg-paper px-2.5 py-1.5 text-[12px] shadow-lg"
            style={{ left: `${((hover! + 0.5) / points.length) * 100}%` }}>
            <p className="font-semibold tabular-nums">{format(h.value)}</p>
            <p className="text-muted">{h.label}{h.detail ? ` · ${h.detail}` : ''}</p>
          </div>
        )}
        <div className="mt-1 flex gap-[2px] text-[10px] text-muted">
          {points.map((p, i) => <span key={i} className="min-w-0 flex-1 overflow-visible whitespace-nowrap">{i % every === 0 ? p.label : ''}</span>)}
        </div>
      </div>
      <details className="mt-2 text-[12px]">
        <summary className="cursor-pointer text-muted">Show as table</summary>
        <table className="mt-2"><tbody>{points.map((p, i) => <tr key={i}><td className="py-1">{p.label}</td><td className="py-1 text-right tabular-nums">{format(p.value)}</td>{p.detail && <td className="py-1 text-right text-muted">{p.detail}</td>}</tr>)}</tbody></table>
      </details>
    </figure>
  );
}

// Ranked horizontal bars with the value written beside each bar (no hover needed to read it).
export function Bars({ rows, color = SERIES.gold }: { rows: { label: string; value: number; display: string; color?: string }[]; color?: string }) {
  const max = Math.max(1, ...rows.map((r) => r.value));
  if (!rows.length) return <p className="py-6 text-center text-[13px] text-muted">No data for this period</p>;
  return (
    <ul className="space-y-2.5">
      {rows.map((r) => (
        <li key={r.label} className="grid grid-cols-[minmax(0,9rem)_1fr_auto] items-center gap-3 text-[13px]" title={`${r.label}: ${r.display}`}>
          <span className="truncate">{r.label}</span>
          <span className="h-2.5 rounded-r-[4px] bg-ivory"><span className="block h-full rounded-r-[4px]" style={{ width: `${(r.value / max) * 100}%`, background: r.color || color }} /></span>
          <span className="tabular-nums text-muted">{r.display}</span>
        </li>
      ))}
    </ul>
  );
}

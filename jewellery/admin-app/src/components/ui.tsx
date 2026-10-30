import { cloneElement, isValidElement, useEffect, useId, useRef, type ReactElement, type ReactNode } from 'react';
import { istDate } from '../lib/format';
import { Icon, type IconName } from './Icon';

export function PageHeader({ title, subtitle, actions }: { title: string; subtitle?: ReactNode; actions?: ReactNode }) {
  return (
    <div className="mb-5 flex flex-wrap items-end justify-between gap-3">
      <div>
        <h1 className="font-display text-[30px] font-semibold leading-tight">{title}</h1>
        {subtitle && <p className="text-[13px] text-muted">{subtitle}</p>}
      </div>
      {actions && <div className="flex flex-wrap gap-2">{actions}</div>}
    </div>
  );
}

export function Card({ title, actions, children, className = '' }: { title?: ReactNode; actions?: ReactNode; children: ReactNode; className?: string }) {
  return (
    <section className={`card ${className}`}>
      {(title || actions) && (
        <div className="flex items-center justify-between gap-3 border-b border-line px-4 py-3">
          <h2 className="text-[13px] font-semibold uppercase tracking-wider text-muted">{title}</h2>
          {actions}
        </div>
      )}
      <div className="p-4">{children}</div>
    </section>
  );
}

export function Stat({ label, value, hint, tone }: { label: string; value: ReactNode; hint?: ReactNode; tone?: 'good' | 'warn' | 'bad' }) {
  const color = tone === 'good' ? 'text-good' : tone === 'warn' ? 'text-warn' : tone === 'bad' ? 'text-bad' : 'text-ink';
  return (
    <div className="card px-4 py-3.5">
      <p className="text-[12px] font-medium text-muted">{label}</p>
      <p className={`mt-1 font-display text-[28px] font-semibold leading-none tabular-nums ${color}`}>{value}</p>
      {hint && <p className="mt-1.5 text-[12px] text-muted">{hint}</p>}
    </div>
  );
}

const TONES = {
  neutral: 'bg-ivory text-ink border-line',
  gold: 'bg-gold-soft text-gold-dark border-gold/30',
  good: 'bg-good/10 text-good border-good/20',
  warn: 'bg-warn/10 text-warn border-warn/20',
  bad: 'bg-bad/10 text-bad border-bad/20',
  dark: 'bg-ink text-paper border-ink',
};
export function Badge({ children, tone = 'neutral' }: { children: ReactNode; tone?: keyof typeof TONES }) {
  return <span className={`inline-flex items-center whitespace-nowrap rounded-full border px-2 py-0.5 text-[11px] font-medium ${TONES[tone]}`}>{children}</span>;
}

export const orderTone = (s: string) => (s === 'delivered' ? 'good' : s === 'cancelled' ? 'bad' : s === 'new' ? 'gold' : 'neutral') as keyof typeof TONES;
export const paymentTone = (s: string) => (s === 'verified' ? 'good' : s === 'failed' ? 'bad' : s === 'verification_pending' ? 'warn' : 'neutral') as keyof typeof TONES;

export function Spinner() {
  return <span className="inline-block h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent" role="status" aria-label="Loading" />;
}

export function Loading() {
  return <div className="grid place-items-center py-16 text-gold"><Spinner /></div>;
}

export function Empty({ icon = 'box', title, body, action }: { icon?: IconName; title: string; body?: ReactNode; action?: ReactNode }) {
  return (
    <div className="flex flex-col items-center px-6 py-12 text-center">
      <span className="mb-3 grid h-12 w-12 place-items-center rounded-full bg-gold-soft text-gold-dark"><Icon name={icon} className="text-xl" /></span>
      <p className="font-medium">{title}</p>
      {body && <p className="mt-1 max-w-sm text-[13px] text-muted">{body}</p>}
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}

export function ErrorBox({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return (
    <div role="alert" className="rounded-lg border border-bad/30 bg-bad/5 px-4 py-3 text-[13px] text-bad">
      {message} {onRetry && <button onClick={onRetry} className="ml-2 underline">Retry</button>}
    </div>
  );
}

export function Field({ label, hint, children, className = '' }: { label: string; hint?: ReactNode; children: ReactNode; className?: string }) {
  const id = useId();
  return (
    <div className={className}>
      <label htmlFor={id} className="label">{label}</label>
      {isValidElement(children) ? cloneElement(children as ReactElement<{ id?: string; 'aria-describedby'?: string }>, { id, 'aria-describedby': hint ? `${id}-hint` : undefined }) : children}
      {hint && <p id={`${id}-hint`} className="mt-1 text-[12px] text-muted">{hint}</p>}
    </div>
  );
}

export function Modal({ title, onClose, children, wide = false }: { title: string; onClose: () => void; children: ReactNode; wide?: boolean }) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => { ref.current?.showModal(); }, []);
  return (
    <dialog ref={ref} onClose={onClose} aria-label={title}
      className={`m-auto w-[calc(100%-2rem)] ${wide ? 'max-w-3xl' : 'max-w-lg'} rounded-xl border border-line bg-paper p-0 text-ink shadow-2xl backdrop:bg-ink/40`}>
      <div className="flex items-center justify-between border-b border-line px-5 py-3">
        <h2 className="font-display text-xl font-semibold">{title}</h2>
        <button onClick={() => ref.current?.close()} aria-label="Close" className="grid h-8 w-8 place-items-center rounded-md hover:bg-ivory"><Icon name="close" /></button>
      </div>
      <div className="max-h-[75vh] overflow-y-auto p-5">{children}</div>
    </dialog>
  );
}

export type Range = { from: string; to: string };
const shift = (days: number) => istDate(new Date(Date.now() - days * 864e5));
export const PRESETS: [string, () => Range][] = [
  ['Today', () => ({ from: shift(0), to: shift(0) })],
  ['Yesterday', () => ({ from: shift(1), to: shift(1) })],
  ['Last 7 days', () => ({ from: shift(6), to: shift(0) })],
  ['Last 30 days', () => ({ from: shift(29), to: shift(0) })],
];

export function DateRange({ value, onChange }: { value: Range; onChange: (r: Range) => void }) {
  const active = PRESETS.find(([, f]) => { const r = f(); return r.from === value.from && r.to === value.to; })?.[0] || 'Custom';
  return (
    <div className="flex flex-wrap items-center gap-2" role="group" aria-label="Date range">
      {PRESETS.map(([label, f]) => (
        <button key={label} onClick={() => onChange(f())} aria-pressed={active === label}
          className={`btn px-3 py-1.5 ${active === label ? 'bg-ink text-paper' : 'border border-line bg-white hover:border-gold'}`}>{label}</button>
      ))}
      <span className="flex items-center gap-1.5 text-[12px] text-muted">
        <input type="date" aria-label="From date" value={value.from} max={value.to} onChange={(e) => e.target.value && onChange({ ...value, from: e.target.value })} className="!w-auto !py-1.5" />
        to
        <input type="date" aria-label="To date" value={value.to} min={value.from} onChange={(e) => e.target.value && onChange({ ...value, to: e.target.value })} className="!w-auto !py-1.5" />
      </span>
    </div>
  );
}

export function Table({ children }: { children: ReactNode }) {
  return <div className="-mx-4 overflow-x-auto"><table className="min-w-full">{children}</table></div>;
}

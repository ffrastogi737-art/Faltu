// The design system: every page is built from these pieces.
import { CheckCircle2, CircleAlert, Loader2, X } from "lucide-react";
import type { ButtonHTMLAttributes, InputHTMLAttributes, ReactNode, SelectHTMLAttributes, TextareaHTMLAttributes } from "react";
import { useEffect, useState } from "react";
import { type Job, JOB_LABEL, get, post } from "../services/api";
import { useApp } from "../stores/app";

const cx = (...c: (string | false | undefined | null)[]) => c.filter(Boolean).join(" ");

type BtnProps = ButtonHTMLAttributes<HTMLButtonElement> & { variant?: "primary" | "ghost" | "danger" | "soft"; small?: boolean; busy?: boolean };
export function Button({ variant = "soft", small, busy, className, children, disabled, ...rest }: BtnProps) {
  const styles = {
    primary: "bg-accent text-white hover:brightness-110 shadow-[0_0_24px_-8px] shadow-accent",
    soft: "bg-panel2 text-ink border border-line hover:border-accent/60",
    ghost: "text-muted hover:text-ink hover:bg-panel2",
    danger: "bg-bad/10 text-bad border border-bad/30 hover:bg-bad/20",
  }[variant];
  return (
    <button {...rest} disabled={disabled || busy} type={rest.type || "button"}
      className={cx("inline-flex items-center justify-center gap-2 rounded-lg font-medium transition disabled:opacity-50 disabled:cursor-not-allowed",
        small ? "px-2.5 py-1 text-xs" : "px-3.5 py-2 text-sm", styles, className)}>
      {busy && <Loader2 className="size-4 animate-spin" />}
      {children}
    </button>
  );
}

export const Card = ({ className, children }: { className?: string; children: ReactNode }) => (
  <div className={cx("rounded-xl border border-line bg-panel p-5", className)}>{children}</div>
);

export function PageHeader({ title, subtitle, actions }: { title: string; subtitle?: string; actions?: ReactNode }) {
  return (
    <div className="mb-6 flex flex-wrap items-end justify-between gap-3">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">{title}</h1>
        {subtitle && <p className="mt-1 text-sm text-muted">{subtitle}</p>}
      </div>
      <div className="flex flex-wrap gap-2">{actions}</div>
    </div>
  );
}

const field = "w-full rounded-lg border border-line bg-base px-3 py-2 text-sm text-ink placeholder:text-muted/60 focus:border-accent focus:outline-none";
export const Input = ({ className, ...p }: InputHTMLAttributes<HTMLInputElement>) => <input {...p} className={cx(field, className)} />;
export const Textarea = ({ className, ...p }: TextareaHTMLAttributes<HTMLTextAreaElement>) => <textarea {...p} className={cx(field, className)} />;
export const Select = ({ className, ...p }: SelectHTMLAttributes<HTMLSelectElement>) => <select {...p} className={cx(field, className)} />;

export function Field({ label, hint, children, className }: { label: string; hint?: string; children: ReactNode; className?: string }) {
  return (
    <label className={cx("block", className)}>
      <span className="mb-1 block text-xs font-medium text-muted">{label}</span>
      {children}
      {hint && <span className="mt-1 block text-xs text-muted/80">{hint}</span>}
    </label>
  );
}

/** Number input that only reports valid numbers, so half-typed values never reach the server. */
export function NumberInput({ value, onChange, ...p }: Omit<InputHTMLAttributes<HTMLInputElement>, "value" | "onChange"> & { value: number | null; onChange: (v: number | null) => void }) {
  const [text, setText] = useState(value === null ? "" : String(value));
  useEffect(() => { if (Number(text) !== value) setText(value === null ? "" : String(value)); }, [value]); // eslint-disable-line
  return <Input {...p} type="number" value={text} onChange={(e) => {
    setText(e.target.value);
    if (e.target.value === "") onChange(null);
    else if (!Number.isNaN(Number(e.target.value))) onChange(Number(e.target.value));
  }} />;
}

export function Slider({ label, value, min, max, step, onChange, format }: { label: string; value: number; min: number; max: number; step: number; onChange: (v: number) => void; format?: (v: number) => string }) {
  return (
    <label className="block">
      <span className="mb-1 flex justify-between text-xs text-muted"><span>{label}</span><span className="tabular-nums text-ink">{format ? format(value) : value}</span></span>
      <input type="range" className="w-full" min={min} max={max} step={step} value={value} onChange={(e) => onChange(Number(e.target.value))} />
    </label>
  );
}

export function Toggle({ label, checked, onChange, hint }: { label: string; checked: boolean; onChange: (v: boolean) => void; hint?: string }) {
  return (
    <label className="flex cursor-pointer items-start gap-3">
      <input type="checkbox" className="mt-0.5 size-4 accent-[var(--color-accent)]" checked={checked} onChange={(e) => onChange(e.target.checked)} />
      <span className="text-sm">{label}{hint && <span className="block text-xs text-muted">{hint}</span>}</span>
    </label>
  );
}

const tones: Record<string, string> = {
  good: "bg-good/10 text-good border-good/30", bad: "bg-bad/10 text-bad border-bad/30", warn: "bg-warn/10 text-warn border-warn/30",
  accent: "bg-accent/10 text-accent border-accent/30", muted: "bg-panel2 text-muted border-line",
};
const statusTone: Record<string, string> = {
  completed: "good", rendered: "good", approved: "good", accepted: "good", pass: "good", active: "good", analyzed: "good", transcribed: "good",
  failed: "bad", rejected: "bad", fail: "bad", running: "accent", rendering: "accent", submitted: "accent",
  queued: "warn", pending: "warn", manual: "warn", paused: "warn",
};
export const Badge = ({ children, tone }: { children: string; tone?: string }) => (
  <span className={cx("inline-flex items-center rounded-full border px-2 py-0.5 text-[11px] font-medium capitalize", tones[tone || statusTone[children] || "muted"])}>
    {children.replace(/_/g, " ")}
  </span>
);

export const Spinner = ({ label = "Loading" }: { label?: string }) => (
  <div className="flex items-center justify-center gap-2 py-16 text-sm text-muted"><Loader2 className="size-4 animate-spin" />{label}</div>
);

export function Empty({ icon, title, text, action }: { icon?: ReactNode; title: string; text?: string; action?: ReactNode }) {
  return (
    <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-line px-6 py-14 text-center">
      {icon && <div className="mb-3 text-muted">{icon}</div>}
      <div className="font-medium">{title}</div>
      {text && <p className="mt-1 max-w-md text-sm text-muted">{text}</p>}
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}

export function Modal({ title, onClose, children, wide }: { title: string; onClose: () => void; children: ReactNode; wide?: boolean }) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);
  return (
    <div className="fixed inset-0 z-40 flex items-start justify-center overflow-y-auto bg-black/70 p-6 backdrop-blur-sm" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div role="dialog" aria-modal="true" aria-label={title} className={cx("w-full rounded-2xl border border-line bg-panel p-6 shadow-2xl", wide ? "max-w-3xl" : "max-w-lg")}>
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-lg font-semibold">{title}</h2>
          <button aria-label="Close" onClick={onClose} className="rounded p-1 text-muted hover:text-ink"><X className="size-5" /></button>
        </div>
        {children}
      </div>
    </div>
  );
}

export const ProgressBar = ({ value }: { value: number }) => (
  <div className="h-1.5 w-full overflow-hidden rounded-full bg-panel2" role="progressbar" aria-valuenow={Math.round(value)} aria-valuemin={0} aria-valuemax={100}>
    <div className="h-full rounded-full bg-gradient-to-r from-accent to-accent2 transition-[width] duration-300" style={{ width: `${value}%` }} />
  </div>
);

/** One job with live progress, cancel/retry, and its processing log on demand. */
export function JobRow({ job }: { job: Job }) {
  const toast = useApp((s) => s.toast);
  const [log, setLog] = useState<string | null>(null);
  const act = (what: "cancel" | "retry") => post(`/api/jobs/${job.id}/${what}`).catch((e) => toast(e.message, "error"));
  const live = job.status === "queued" || job.status === "running";
  return (
    <div className="rounded-lg border border-line bg-panel2/50 p-3">
      <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1">
        <div className="min-w-0">
          <div className="truncate text-sm font-medium">{JOB_LABEL[job.type] || job.type} <span className="text-muted">#{job.id}</span></div>
          <div className="truncate text-xs text-muted">{job.status === "failed" ? job.error : job.stage}</div>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <Badge>{job.status}</Badge>
          {live && <Button small variant="ghost" onClick={() => act("cancel")}>Cancel</Button>}
          {(job.status === "failed" || job.status === "cancelled") && <Button small onClick={() => act("retry")}>Retry</Button>}
          <Button small variant="ghost" onClick={() => (log === null ? get<Job>(`/api/jobs/${job.id}`).then((j) => setLog(j.log || "(empty)")) : setLog(null))}>
            {log === null ? "Log" : "Hide log"}
          </Button>
        </div>
      </div>
      {job.status === "running" && <div className="mt-2 flex items-center gap-2"><ProgressBar value={job.progress} /><span className="w-10 text-right text-xs tabular-nums text-muted">{Math.round(job.progress)}%</span></div>}
      {log !== null && <pre className="mt-2 max-h-56 overflow-auto whitespace-pre-wrap rounded bg-base p-2 text-[11px] text-muted">{log}</pre>}
    </div>
  );
}

export function Toasts() {
  const toasts = useApp((s) => s.toasts);
  return (
    <div className="pointer-events-none fixed bottom-4 right-4 z-50 flex w-96 max-w-[calc(100vw-2rem)] flex-col gap-2" aria-live="polite">
      {toasts.map((t) => (
        <div key={t.id} className={cx("pointer-events-auto flex items-start gap-2 rounded-lg border bg-panel p-3 text-sm shadow-xl", t.kind === "error" ? "border-bad/40" : "border-good/40")}>
          {t.kind === "error" ? <CircleAlert className="mt-0.5 size-4 shrink-0 text-bad" /> : <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-good" />}
          <span className="break-words">{t.text}</span>
        </div>
      ))}
    </div>
  );
}

/** Load data, and reload whenever `deps` change. Returns [data, reload, error]. */
export function useLoad<T>(loader: () => Promise<T>, deps: unknown[] = []): [T | undefined, () => void, string | null] {
  const [data, setData] = useState<T>();
  const [error, setError] = useState<string | null>(null);
  const [tick, setTick] = useState(0);
  useEffect(() => {
    let alive = true;
    loader().then((d) => alive && (setData(d), setError(null))).catch((e) => alive && setError(e.message));
    return () => { alive = false; };
  }, [...deps, tick]); // eslint-disable-line
  return [data, () => setTick((t) => t + 1), error];
}

export const ErrorBox = ({ text }: { text: string }) => (
  <div className="flex items-center gap-2 rounded-lg border border-bad/30 bg-bad/10 p-3 text-sm text-bad"><CircleAlert className="size-4 shrink-0" />{text}</div>
);

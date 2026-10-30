import { useState, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { assetUrl } from '../lib/api';
import { rupees } from '../lib/format';
import { Icon, type IconName } from './Icon';

export function Img({ src, alt, className = '', eager = false }: { src?: string | null; alt: string; className?: string; eager?: boolean }) {
  const [loaded, setLoaded] = useState(false);
  const [failed, setFailed] = useState(false);
  return (
    <div className={`relative overflow-hidden bg-cream ${className}`}>
      {!loaded && !failed && <div className="shimmer absolute inset-0" />}
      {src && !failed ? (
        <img src={assetUrl(src)} alt={alt} loading={eager ? 'eager' : 'lazy'} decoding="async" onLoad={() => setLoaded(true)} onError={() => setFailed(true)}
          className={`h-full w-full object-cover transition duration-700 ease-[var(--ease-lux)] ${loaded ? 'opacity-100' : 'opacity-0'}`} />
      ) : (
        <div className="absolute inset-0 grid place-items-center text-champagne/60"><Icon name="spark" className="text-3xl" /></div>
      )}
    </div>
  );
}

export function Price({ selling, original, size = 'md' }: { selling: number; original?: number; size?: 'md' | 'lg' }) {
  const off = original && original > selling ? Math.round(((original - selling) / original) * 100) : 0;
  return (
    <div className="flex flex-wrap items-baseline gap-x-2">
      <span className={size === 'lg' ? 'font-display text-3xl font-semibold' : 'text-[15px] font-medium'}>{rupees(selling)}</span>
      {off > 0 && (
        <>
          <span className={`text-muted line-through ${size === 'lg' ? 'text-base' : 'text-xs'}`}>{rupees(original!)}</span>
          <span className={`font-medium text-champagne-dark ${size === 'lg' ? 'text-sm' : 'text-xs'}`}>{off}% off</span>
        </>
      )}
    </div>
  );
}

export function SectionTitle({ eyebrow, title, to }: { eyebrow?: string; title: string; to?: string }) {
  return (
    <div className="mb-4 flex items-end justify-between px-4">
      <div>
        {eyebrow && <p className="eyebrow">{eyebrow}</p>}
        <h2 className="text-[26px] font-medium leading-tight">{title}</h2>
      </div>
      {to && <Link to={to} className="text-xs uppercase tracking-[0.2em] text-muted underline-offset-4 hover:underline">View all</Link>}
    </div>
  );
}

export function Spinner({ className = '' }: { className?: string }) {
  return <span className={`inline-block h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent ${className}`} role="status" aria-label="Loading" />;
}

export function Empty({ icon, title, body, action }: { icon: IconName; title: string; body?: string; action?: ReactNode }) {
  return (
    <div className="fade-up flex flex-col items-center px-8 py-20 text-center">
      <div className="mb-5 grid h-16 w-16 place-items-center rounded-full border border-champagne/50 text-champagne-dark"><Icon name={icon} className="text-2xl" /></div>
      <h2 className="text-2xl">{title}</h2>
      {body && <p className="mt-2 max-w-xs text-sm text-muted">{body}</p>}
      {action && <div className="mt-6">{action}</div>}
    </div>
  );
}

export function ErrorState({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return (
    <div className="px-6 py-16 text-center">
      <p className="text-sm text-muted">{message}</p>
      {onRetry && <button onClick={onRetry} className="btn-line mt-4">Try again</button>}
    </div>
  );
}

export function PageHeader({ title, back = true, right }: { title: string; back?: boolean; right?: ReactNode }) {
  return (
    <div className="sticky top-0 z-30 flex h-14 items-center gap-2 border-b border-sand/60 bg-ivory/90 px-2 backdrop-blur">
      {back ? (
        <button onClick={() => history.length > 1 ? history.back() : (location.href = '/')} className="grid h-10 w-10 place-items-center" aria-label="Back"><Icon name="back" /></button>
      ) : <span className="w-2" />}
      <h1 className="flex-1 truncate text-xl font-medium">{title}</h1>
      {right}
    </div>
  );
}

export function Badge({ children, tone = 'neutral' }: { children: ReactNode; tone?: 'neutral' | 'gold' | 'green' | 'red' | 'dark' }) {
  const tones = {
    neutral: 'bg-cream text-ink',
    gold: 'bg-champagne-light text-champagne-dark',
    green: 'bg-jade/10 text-jade',
    red: 'bg-ruby/10 text-ruby',
    dark: 'bg-ink text-ivory',
  };
  return <span className={`inline-flex items-center px-2 py-0.5 text-[10px] font-medium uppercase tracking-[0.15em] ${tones[tone]}`}>{children}</span>;
}

export function Skeleton({ className = '' }: { className?: string }) {
  return <div className={`shimmer ${className}`} />;
}

export function Field({ label, error, children }: { label: string; error?: string; children: ReactNode }) {
  return (
    <label className="block">
      <span className="label">{label}</span>
      {children}
      {error && <span className="mt-1 block text-xs text-ruby">{error}</span>}
    </label>
  );
}

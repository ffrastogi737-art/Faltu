import { Link } from 'react-router-dom';
import { useStore } from '../lib/store';
import { Icon } from './Icon';

export function PolicyNote({ compact = false }: { compact?: boolean }) {
  const hours = useStore().settings?.replacementWindowHours ?? 3;
  return (
    <div className="border border-champagne/40 bg-champagne-light/40 p-4 text-[13px] leading-relaxed">
      <p className="mb-1 flex items-center gap-2 font-medium"><Icon name="shield" className="text-champagne-dark" /> No return · No refund · Eligible replacement only</p>
      <p className="text-muted">
        Report a wrong, damaged or manufacturing-defective product within <b className="text-ink">{hours} hours of delivery</b> with photos for a replacement.
        {!compact && ' Change of mind, used products and damage caused after delivery are not eligible.'}{' '}
        <Link to="/policy" className="text-ink underline underline-offset-2">Full policy</Link>
      </p>
    </div>
  );
}

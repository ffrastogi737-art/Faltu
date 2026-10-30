import { Badge } from './ui';
import { ORDER_STATUS, PAYMENT_STATUS } from '../lib/format';
import type { OrderStatus, PaymentStatus } from '../lib/types';

export function StatusBadge({ status }: { status: OrderStatus }) {
  const tone = status === 'delivered' ? 'green' : status === 'cancelled' ? 'red' : status === 'new' ? 'gold' : 'dark';
  return <Badge tone={tone}>{ORDER_STATUS[status]}</Badge>;
}

export function PaymentBadge({ method, status }: { method: 'upi' | 'cod'; status: PaymentStatus }) {
  if (method === 'cod') return <Badge tone={status === 'verified' ? 'green' : 'neutral'}>{status === 'verified' ? 'Paid · COD' : 'Cash on delivery'}</Badge>;
  const tone = status === 'verified' ? 'green' : status === 'failed' ? 'red' : 'gold';
  return <Badge tone={tone}>{PAYMENT_STATUS[status]}</Badge>;
}

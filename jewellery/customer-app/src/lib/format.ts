import type { OrderStatus, PaymentStatus, ReplacementIssue, ReplacementStatus } from './types';

const inr = new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 2, minimumFractionDigits: 0 });
export const rupees = (paise: number) => inr.format(paise / 100);

export const dateTime = (iso: string) =>
  new Date(iso).toLocaleString('en-IN', { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' });
export const date = (iso: string) => new Date(iso).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });

export const ORDER_FLOW: OrderStatus[] = ['new', 'confirmed', 'preparing', 'ready_for_delivery', 'out_for_delivery', 'delivered'];
export const ORDER_STATUS: Record<OrderStatus, string> = {
  new: 'New Order',
  confirmed: 'Confirmed',
  preparing: 'Preparing',
  ready_for_delivery: 'Ready for Delivery',
  out_for_delivery: 'Out for Delivery',
  delivered: 'Delivered',
  cancelled: 'Cancelled',
};
export const PAYMENT_STATUS: Record<PaymentStatus, string> = {
  pending: 'Payment Pending',
  verification_pending: 'Verification Pending',
  verified: 'Payment Verified',
  failed: 'Payment Failed',
};
export const REPLACEMENT_STATUS: Record<ReplacementStatus, string> = {
  requested: 'Requested',
  under_review: 'Under Review',
  approved: 'Approved',
  rejected: 'Rejected',
  replacement_preparing: 'Replacement Preparing',
  replacement_delivered: 'Replacement Delivered',
  completed: 'Completed',
};
export const ISSUES: Record<ReplacementIssue, string> = {
  wrong_product: 'Wrong product delivered',
  damaged: 'Product received damaged',
  manufacturing_defect: 'Manufacturing defect',
};

export function waLink(number: string, text: string) {
  return `https://wa.me/${number.replace(/\D/g, '')}?text=${encodeURIComponent(text)}`;
}

export function countdown(ms: number) {
  if (ms <= 0) return 'closed';
  const h = Math.floor(ms / 3600e3);
  const m = Math.floor((ms % 3600e3) / 60e3);
  const s = Math.floor((ms % 60e3) / 1e3);
  return h ? `${h}h ${m}m` : `${m}m ${String(s).padStart(2, '0')}s`;
}

const inr = new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 2, minimumFractionDigits: 0 });
export const rupees = (paise: number | string | null | undefined) => inr.format(Number(paise || 0) / 100);
export const compact = (paise: number) => '₹' + new Intl.NumberFormat('en-IN', { notation: 'compact', maximumFractionDigits: 1 }).format(paise / 100);
export const dateTime = (iso?: string | null) => (iso ? new Date(iso).toLocaleString('en-IN', { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' }) : '—');
export const date = (iso?: string | null) => (iso ? new Date(iso).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' }) : '—');
export const istDate = (d = new Date()) => d.toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' });

export const ORDER_STATUS: Record<string, string> = {
  new: 'New Order', confirmed: 'Confirmed', preparing: 'Preparing', ready_for_delivery: 'Ready for Delivery',
  out_for_delivery: 'Out for Delivery', delivered: 'Delivered', cancelled: 'Cancelled',
};
export const ORDER_FLOW = ['new', 'confirmed', 'preparing', 'ready_for_delivery', 'out_for_delivery', 'delivered'];
export const PAYMENT_STATUS: Record<string, string> = { pending: 'Pending', verification_pending: 'Verification Pending', verified: 'Verified', failed: 'Failed' };
export const REPLACEMENT_STATUS: Record<string, string> = {
  requested: 'Requested', under_review: 'Under Review', approved: 'Approved', rejected: 'Rejected',
  replacement_preparing: 'Replacement Preparing', replacement_delivered: 'Replacement Delivered', completed: 'Completed',
};
export const ISSUES: Record<string, string> = { wrong_product: 'Wrong product delivered', damaged: 'Received damaged', manufacturing_defect: 'Manufacturing defect' };
export const toRupees = (paise: number | null | undefined) => (paise == null ? '' : String(paise / 100));

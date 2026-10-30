export type Settings = {
  shopName: string;
  brandName: string;
  tagline: string;
  description: string;
  appIconUrl: string | null;
  splashLogoUrl: string | null;
  contact: { phone: string; email: string; address: string; city: string; state: string; pincode: string; openingHours: string; social: Record<string, string> };
  paymentInstructions: string;
  minOrderPaise: number;
  deliveryAreasNote: string;
  replacementPolicy: string;
  upiDiscountMinOrderPaise: number;
  upiDiscountMaxPaise: number;
  logoUrl: string | null;
  upiEnabled: boolean;
  codEnabled: boolean;
  upiDiscountPercent: number;
  deliveryChargePaise: number;
  freeDeliveryMinPaise: number;
  whatsappNumber: string;
  supportPhone: string;
  replacementWindowHours: number;
  cancellableStatuses: OrderStatus[];
  banners: { title: string; subtitle?: string; cta?: string; link?: string; image?: string }[];
};

export type Category = { slug: string; name: string; imageUrl: string | null; productCount: number };

export type Product = {
  id: number;
  sku: string;
  slug: string;
  name: string;
  images: string[];
  stock: number;
  tags: string[];
  originalPricePaise: number;
  sellingPricePaise: number;
  discountPercent: number;
  category: { slug: string; name: string } | null;
};

export type ProductDetail = Product & {
  description: string;
  videoUrl: string | null;
  specifications: Record<string, string>;
  related: Product[];
};

export type Totals = {
  subtotalPaise: number;
  productDiscountPaise: number;
  upiDiscountPercent: number;
  upiDiscountPaise: number;
  deliveryChargePaise: number;
  totalPaise: number;
};

export type QuoteLine = { productId: number; sku: string; slug: string; name: string; imageUrl: string | null; stock: number; unitOriginalPaise: number; unitPricePaise: number; quantity: number };
export type StockProblem = { productId: number; issue: 'unavailable' | 'out_of_stock' | 'insufficient_stock'; available: number };
export type Quote = { lines: QuoteLine[]; problems: StockProblem[]; upi: Totals; cod: Totals };

export type Customer = { id: number; name: string; mobile: string; email: string | null; marketing_opt_in?: boolean };

export type Address = {
  id?: number;
  label?: string;
  name: string;
  mobile: string;
  house: string;
  street: string;
  area: string;
  city: string;
  state: string;
  pincode: string;
  landmark: string;
  is_default?: boolean;
};

export type OrderStatus = 'new' | 'confirmed' | 'preparing' | 'ready_for_delivery' | 'out_for_delivery' | 'delivered' | 'cancelled';
export type PaymentStatus = 'pending' | 'verification_pending' | 'verified' | 'failed';
export type ReplacementStatus = 'requested' | 'under_review' | 'approved' | 'rejected' | 'replacement_preparing' | 'replacement_delivered' | 'completed';
export type ReplacementIssue = 'wrong_product' | 'damaged' | 'manufacturing_defect';

export type Order = {
  orderNumber: string;
  status: OrderStatus;
  paymentMethod: 'upi' | 'cod';
  paymentStatus: PaymentStatus;
  paymentReference: string | null;
  contact: { name: string; mobile: string };
  address: Omit<Address, 'name' | 'mobile'>;
  deliveryInstructions: string;
  deliveryAgentName: string | null;
  totals: Totals;
  items: { id: number; productId: number | null; sku: string; name: string; imageUrl: string | null; unitOriginalPaise: number; unitPricePaise: number; quantity: number }[];
  timeline: { status: OrderStatus; at: string }[];
  replacements: { id: number; orderItemId: number; issue: ReplacementIssue; description: string; photos: string[]; status: ReplacementStatus; adminNote: string | null; createdAt: string; updatedAt: string }[];
  canCancel: boolean;
  upiLink: string | null;
  deliveredAt: string | null;
  replacementDeadline: string | null;
  cancelReason: string | null;
  createdAt: string;
  guestToken?: string | null;
};

export type OrderSummary = Pick<Order, 'orderNumber' | 'status' | 'paymentMethod' | 'paymentStatus' | 'createdAt' | 'deliveredAt'> & {
  totalPaise: number;
  items: { name: string; imageUrl: string | null; quantity: number }[];
};

export type AppNotification = { id: number; type: string; title: string; body: string; link: string | null; created_at: string; read: boolean };

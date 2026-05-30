export type Role = "BUYER" | "SELLER" | "ADMIN";
export type OrderStatus = "PLACED" | "PAID" | "PACKED" | "SHIPPED" | "DELIVERED" | "CANCELLED";

export type User = {
  id: string;
  name: string;
  email: string;
  role: Role;
  avatarUrl?: string;
  phone?: string;
};

export type Variant = {
  id: string;
  productId: string;
  sku: string;
  size: string;
  color: string;
  stock: number;
};

export type Product = {
  id: string;
  sellerId: string;
  storeName: string;
  title: string;
  slug: string;
  description: string;
  brand: string;
  category: string;
  gender: string;
  imageUrl: string;
  mrpCents: number;
  salePriceCents: number;
  active: boolean;
  approved: boolean;
  variants: Variant[];
};

export type CartItem = {
  id: string;
  quantity: number;
  variant: Variant;
  product: Product;
};

export type Order = {
  id: string;
  status: OrderStatus;
  subtotalCents: number;
  shippingCents: number;
  totalCents: number;
  shippingName: string;
  shippingPhone: string;
  shippingAddress: string;
  paymentStatus: string;
  createdAt: string;
  items: Array<{
    id: string;
    productTitle: string;
    sellerStore: string;
    size: string;
    color: string;
    quantity: number;
    unitPriceCents: number;
    sellerAmountCents: number;
  }>;
};

export type Seller = {
  id: string;
  name?: string;
  email?: string;
  storeName: string;
  legalName?: string;
  gstin?: string;
  payoutAccount?: string;
  status: "PENDING" | "APPROVED" | "SUSPENDED" | "REJECTED" | "HOLD";
  canListProducts: boolean;
  canReceivePayouts: boolean;
  commissionBps?: number;
  logoUrl?: string;
  bannerUrl?: string;
  documentUrl?: string;
  adminComment?: string;
};

export type Payout = {
  id: string;
  orderId: string;
  amountCents: number;
  status: string;
  createdAt: string;
};

export type Address = {
  id: string;
  userId: string;
  addressName: string;
  recipientName: string;
  phone: string;
  addressLine1: string;
  addressLine2?: string;
  city: string;
  state: string;
  postalCode: string;
  country: string;
  latitude?: number;
  longitude?: number;
  isDefault: boolean;
};

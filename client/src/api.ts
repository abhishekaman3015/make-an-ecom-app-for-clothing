import type { CartItem, Order, OrderStatus, Payout, Product, Seller, User } from "./types";

const API_BASE = import.meta.env.VITE_API_BASE_URL || "";

export type AuthPayload = {
  token: string;
  user: User;
};

type SignupPayload = {
  name: string;
  email: string;
  password: string;
  role: "BUYER" | "SELLER";
  phone?: string;
  storeName?: string;
  legalName?: string;
  gstin?: string;
  payoutAccount?: string;
};

type ProductPayload = {
  title: string;
  description: string;
  brand: string;
  category: string;
  gender: string;
  imageUrl: string;
  mrpCents: number;
  salePriceCents: number;
  variants: Array<{ sku?: string; size: string; color: string; stock: number }>;
};

async function request<T>(path: string, options: RequestInit = {}, token?: string): Promise<T> {
  const response = await fetch(`${API_BASE}${path}`, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...options.headers
    }
  });
  if (!response.ok) {
    const error = await response.json().catch(() => ({ message: response.statusText }));
    throw new Error(error.message || "Request failed");
  }
  if (response.status === 204) return undefined as T;
  return response.json();
}

async function requestArray<T>(path: string, options: RequestInit = {}, token?: string): Promise<T[]> {
  const value = await request<T[] | null>(path, options, token);
  return Array.isArray(value) ? value : [];
}

export const api = {
  login: (email: string, password: string) =>
    request<AuthPayload>("/api/auth/login", { method: "POST", body: JSON.stringify({ email, password }) }),
  signup: (payload: SignupPayload) =>
    request<AuthPayload>("/api/auth/signup", { method: "POST", body: JSON.stringify(payload) }),
  googleLogin: (idToken: string) =>
    request<AuthPayload>("/api/auth/google", { method: "POST", body: JSON.stringify({ idToken }) }),
  products: () => requestArray<Product>("/api/products"),
  cart: (token: string) => requestArray<CartItem>("/api/cart", {}, token),
  addCart: (token: string, variantId: string, quantity = 1) =>
    request<{ ok: boolean }>("/api/cart", { method: "POST", body: JSON.stringify({ variantId, quantity }) }, token),
  updateCart: (token: string, id: string, quantity: number) =>
    request<{ ok: boolean }>(`/api/cart/${id}`, { method: "PATCH", body: JSON.stringify({ quantity }) }, token),
  removeCart: (token: string, id: string) => request<void>(`/api/cart/${id}`, { method: "DELETE" }, token),
  checkout: (token: string, payload: { shippingName: string; shippingPhone: string; shippingAddress: string; paymentMethod: string }) =>
    request<{ id: string; paymentReference: string; totalCents: number; status: string }>("/api/checkout", { method: "POST", body: JSON.stringify(payload) }, token),
  orders: (token: string) => requestArray<Order>("/api/orders", {}, token),
  sellerMe: (token: string) => request<Seller>("/api/seller/me", {}, token),
  sellerProducts: (token: string) => requestArray<Product>("/api/seller/products", {}, token),
  createSellerProduct: (token: string, payload: ProductPayload) =>
    request<{ id: string; approved: boolean }>("/api/seller/products", { method: "POST", body: JSON.stringify(payload) }, token),
  payouts: (token: string) => requestArray<Payout>("/api/seller/payouts", {}, token),
  adminSellers: (token: string) => requestArray<Seller>("/api/admin/sellers", {}, token),
  updateSeller: (token: string, id: string, payload: Partial<Seller>) =>
    request<{ ok: boolean }>(`/api/admin/sellers/${id}`, { method: "PATCH", body: JSON.stringify(payload) }, token),
  adminOrders: (token: string) => requestArray<Order>("/api/admin/orders", {}, token),
  updateProduct: (token: string, id: string, payload: { approved?: boolean; active?: boolean }) =>
    request<{ ok: boolean }>(`/api/admin/products/${id}`, { method: "PATCH", body: JSON.stringify(payload) }, token)
};

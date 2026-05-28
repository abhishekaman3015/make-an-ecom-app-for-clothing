import React, { useState } from "react";
import { ShieldCheck, Store, Truck, LayoutDashboard, Check, X, ShieldAlert } from "lucide-react";
import { api } from "../api";
import type { Seller, Order, Product } from "../types";

const rupee = new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 0 });
const money = (cents: number) => rupee.format(cents / 100);

interface AdminConsoleProps {
  token: string;
  sellers: Seller[];
  orders: Order[];
  products: Product[];
  refresh: () => Promise<void>;
}

export function AdminConsole({
  token,
  sellers,
  orders,
  products,
  refresh,
}: AdminConsoleProps) {
  const [updating, setUpdating] = useState<string | null>(null);

  const handleApproveSeller = async (seller: Seller, approve: boolean) => {
    setUpdating(seller.id);
    try {
      await api.updateSeller(token, seller.id, {
        status: approve ? "APPROVED" : "SUSPENDED",
        canListProducts: approve,
        canReceivePayouts: approve,
        commissionBps: seller.commissionBps || 1200,
      });
      await refresh();
    } catch (err) {
      console.error("Seller action failed", err);
    } finally {
      setUpdating(null);
    }
  };

  const handleApproveProduct = async (product: Product, approve: boolean) => {
    setUpdating(product.id);
    try {
      await api.updateProduct(token, product.id, { approved: approve });
      await refresh();
    } catch (err) {
      console.error("Product action failed", err);
    } finally {
      setUpdating(null);
    }
  };

  return (
    <section className="dashboard-container">
      {/* Header */}
      <div className="dashboard-header">
        <div>
          <h1>Admin Console</h1>
          <p style={{ color: "var(--text-muted)", fontSize: "14px" }}>
            Control center for sellers, listings, and order monitoring.
          </p>
        </div>
      </div>

      {/* Metrics */}
      <div className="dashboard-grid">
        <article className="metrics-card">
          <div className="metrics-icon-container" style={{ backgroundColor: "#eefaf6", color: "#03a685" }}>
            <Store size={28} />
          </div>
          <div className="metrics-info">
            <span>Active Sellers</span>
            <strong>{sellers.length} registered</strong>
          </div>
        </article>

        <article className="metrics-card">
          <div className="metrics-icon-container" style={{ backgroundColor: "#eff5ff", color: "#4f46e5" }}>
            <Truck size={28} />
          </div>
          <div className="metrics-info">
            <span>System Orders</span>
            <strong>{orders.length} transactions</strong>
          </div>
        </article>

        <article className="metrics-card">
          <div className="metrics-icon-container" style={{ backgroundColor: "var(--primary-light)", color: "var(--primary)" }}>
            <LayoutDashboard size={28} />
          </div>
          <div className="metrics-info">
            <span>Global Catalog</span>
            <strong>{products.length} products</strong>
          </div>
        </article>
      </div>

      {/* Splitted Panel Layout */}
      <div className="dashboard-row-split">
        {/* Left Side: Seller and Product Approvals */}
        <div style={{ display: "flex", flexDirection: "column", gap: "30px" }}>
          {/* Seller Permissions */}
          <section className="dashboard-section">
            <h2>
              <Store size={18} style={{ verticalAlign: "middle", marginRight: "8px", color: "var(--primary)" }} />
              Seller Accounts Approval
            </h2>

            <div className="glass-table-container">
              <table className="glass-table">
                <thead>
                  <tr>
                    <th>Store Details</th>
                    <th>Permissions</th>
                    <th>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {sellers.length === 0 ? (
                    <tr>
                      <td colSpan={3} style={{ textAlign: "center", color: "var(--text-muted)", padding: "20px" }}>
                        No sellers registered.
                      </td>
                    </tr>
                  ) : (
                    sellers.map((s) => (
                      <tr key={s.id}>
                        <td>
                          <strong>{s.storeName}</strong>
                          <span style={{ display: "block", fontSize: "11px", color: "var(--text-muted)", marginTop: "2px" }}>
                            {s.email} · Status: <strong style={{ color: "var(--text-dark)" }}>{s.status}</strong>
                          </span>
                        </td>
                        <td>
                          <span className={`status-pill ${s.canListProducts ? "approved" : "suspended"}`}>
                            {s.canListProducts ? "Can List" : "Blocked"}
                          </span>
                        </td>
                        <td>
                          <div style={{ display: "flex", gap: "6px" }}>
                            <button
                              className="btn-action-small primary-style"
                              disabled={updating === s.id || s.status === "APPROVED"}
                              onClick={() => handleApproveSeller(s, true)}
                            >
                              Approve
                            </button>
                            <button
                              className="btn-action-small"
                              disabled={updating === s.id || s.status === "SUSPENDED"}
                              onClick={() => handleApproveSeller(s, false)}
                              style={{ color: "var(--primary)" }}
                            >
                              Suspend
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </section>

          {/* Catalog Gating & Approvals */}
          <section className="dashboard-section">
            <h2>
              <ShieldCheck size={18} style={{ verticalAlign: "middle", marginRight: "8px", color: "var(--primary)" }} />
              Product Approvals
            </h2>

            <div className="glass-table-container">
              <table className="glass-table">
                <thead>
                  <tr>
                    <th>Product Title</th>
                    <th>Seller</th>
                    <th>Action</th>
                  </tr>
                </thead>
                <tbody>
                  {products.length === 0 ? (
                    <tr>
                      <td colSpan={3} style={{ textAlign: "center", color: "var(--text-muted)", padding: "20px" }}>
                        No products listed in catalog.
                      </td>
                    </tr>
                  ) : (
                    products.map((p) => (
                      <tr key={p.id}>
                        <td>
                          <strong>{p.title}</strong>
                          <span style={{ display: "block", fontSize: "11px", color: "var(--text-muted)", marginTop: "2px" }}>
                            {p.brand} · {p.category}
                          </span>
                        </td>
                        <td>
                          <strong>{p.storeName}</strong>
                        </td>
                        <td>
                          <button
                            className={`btn-action-small ${!p.approved ? "primary-style" : ""}`}
                            disabled={updating === p.id}
                            onClick={() => handleApproveProduct(p, !p.approved)}
                          >
                            {p.approved ? "Reject/Unapprove" : "Approve Listing"}
                          </button>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </section>
        </div>

        {/* Right Side: Global Transactions Tracker */}
        <div>
          <section className="dashboard-section">
            <h2>
              <Truck size={18} style={{ verticalAlign: "middle", marginRight: "8px", color: "var(--primary)" }} />
              System Wide Orders ({orders.length})
            </h2>

            <div className="glass-table-container">
              <table className="glass-table">
                <thead>
                  <tr>
                    <th>Order Ref</th>
                    <th>Status</th>
                    <th>Grand Total</th>
                  </tr>
                </thead>
                <tbody>
                  {orders.length === 0 ? (
                    <tr>
                      <td colSpan={3} style={{ textAlign: "center", color: "var(--text-muted)", padding: "20px" }}>
                        No transactions registered in system.
                      </td>
                    </tr>
                  ) : (
                    orders.map((o) => (
                      <tr key={o.id}>
                        <td>
                          <strong>#{o.id.slice(0, 8).toUpperCase()}</strong>
                          <span style={{ display: "block", fontSize: "11px", color: "var(--text-muted)", marginTop: "2px" }}>
                            {o.shippingName} · {new Date(o.createdAt).toLocaleDateString()}
                          </span>
                        </td>
                        <td>
                          <span className={`status-pill ${o.status.toLowerCase()}`}>
                            {o.status}
                          </span>
                        </td>
                        <td>
                          <strong>{money(o.totalCents)}</strong>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </section>
        </div>
      </div>
    </section>
  );
}

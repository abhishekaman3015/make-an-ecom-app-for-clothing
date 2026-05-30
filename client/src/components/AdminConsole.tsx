import React, { useState } from "react";
import { ShieldCheck, Store, Truck, LayoutDashboard, Check, X, ShieldAlert, ExternalLink, AlertTriangle, Eye } from "lucide-react";
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

  // Status Comment modal state
  const [commentModalSeller, setCommentModalSeller] = useState<Seller | null>(null);
  const [commentAction, setCommentAction] = useState<"HOLD" | "REJECTED" | "SUSPENDED" | null>(null);
  const [adminComment, setAdminComment] = useState("");

  const handleApproveSeller = async (seller: Seller, approve: boolean) => {
    setUpdating(seller.id);
    try {
      await api.updateSeller(token, seller.id, {
        status: approve ? "APPROVED" : "SUSPENDED",
        canListProducts: approve,
        canReceivePayouts: approve,
        commissionBps: seller.commissionBps || 1200,
        adminComment: approve ? "" : seller.adminComment,
      });
      await refresh();
    } catch (err) {
      console.error("Seller action failed", err);
    } finally {
      setUpdating(null);
    }
  };

  const handleUpdateSellerStatusWithComment = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!commentModalSeller || !commentAction) return;

    setUpdating(commentModalSeller.id);
    try {
      await api.updateSeller(token, commentModalSeller.id, {
        status: commentAction,
        canListProducts: false,
        canReceivePayouts: false,
        adminComment: adminComment.trim() || undefined,
      });
      setCommentModalSeller(null);
      setCommentAction(null);
      setAdminComment("");
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
        <div style={{ display: "flex", flexDirection: "column", gap: "30px", flex: "2 1 0" }}>
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
                    <th>Status & Verification</th>
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
                          <div style={{ display: "flex", gap: "10px", alignItems: "center" }}>
                            {s.logoUrl ? (
                              <img src={s.logoUrl} alt="Store Logo" style={{ width: "32px", height: "32px", borderRadius: "50%", objectFit: "cover", border: "1px solid var(--border-color)" }} />
                            ) : (
                              <div style={{ width: "32px", height: "32px", borderRadius: "50%", backgroundColor: "var(--bg-light)", display: "flex", alignItems: "center", justifyContent: "center" }}>
                                <Store size={16} style={{ color: "var(--text-muted)" }} />
                              </div>
                            )}
                            <div>
                              <strong>{s.storeName}</strong>
                              <span style={{ display: "block", fontSize: "11px", color: "var(--text-muted)", marginTop: "2px" }}>
                                {s.email}
                              </span>
                              <span style={{ display: "block", fontSize: "11px", color: "var(--text-muted)" }}>
                                Legal Name: <strong>{s.legalName || "N/A"}</strong>
                              </span>
                              {s.gstin && (
                                <span style={{ display: "block", fontSize: "10px", color: "var(--text-muted)" }}>
                                  GSTIN: <strong>{s.gstin}</strong>
                                </span>
                              )}
                            </div>
                          </div>
                        </td>
                        <td>
                          <div style={{ display: "flex", flexDirection: "column", gap: "4px" }}>
                            <strong className={`status-pill ${s.status?.toLowerCase() || "pending"}`} style={{ alignSelf: "flex-start" }}>
                              {s.status}
                            </strong>
                            
                            {s.documentUrl ? (
                              <a
                                href={s.documentUrl}
                                target="_blank"
                                rel="noreferrer"
                                className="btn-action-small"
                                style={{ display: "inline-flex", alignItems: "center", gap: "4px", padding: "4px 8px", width: "max-content", marginTop: "2px" }}
                              >
                                <Eye size={12} /> View Document
                              </a>
                            ) : (
                              <span style={{ fontSize: "11px", color: "#b91c1c", display: "inline-flex", alignItems: "center", gap: "2px" }}>
                                <AlertTriangle size={12} /> No document uploaded
                              </span>
                            )}

                            {s.adminComment && (
                              <span style={{ fontSize: "11px", color: "var(--text-normal)", fontStyle: "italic", maxWidth: "200px", display: "block", wordBreak: "break-word" }}>
                                "{s.adminComment}"
                              </span>
                            )}
                          </div>
                        </td>
                        <td>
                          <div style={{ display: "flex", gap: "4px", flexWrap: "wrap" }}>
                            <button
                              className="btn-action-small primary-style"
                              disabled={updating === s.id || s.status === "APPROVED"}
                              onClick={() => handleApproveSeller(s, true)}
                            >
                              Approve
                            </button>
                            <button
                              className="btn-action-small"
                              disabled={updating === s.id || s.status === "HOLD"}
                              onClick={() => { setCommentModalSeller(s); setCommentAction("HOLD"); }}
                            >
                              Hold
                            </button>
                            <button
                              className="btn-action-small"
                              disabled={updating === s.id || s.status === "REJECTED"}
                              onClick={() => { setCommentModalSeller(s); setCommentAction("REJECTED"); }}
                              style={{ color: "#b91c1c" }}
                            >
                              Reject
                            </button>
                            <button
                              className="btn-action-small"
                              disabled={updating === s.id || s.status === "SUSPENDED"}
                              onClick={() => { setCommentModalSeller(s); setCommentAction("SUSPENDED"); }}
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
        <div style={{ flex: "1 1 0" }}>
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

      {/* Admin Action Comments Modal */}
      {commentModalSeller && commentAction && (
        <div className="modal-backdrop">
          <div className="modal-window" style={{ maxWidth: "450px", padding: "24px" }}>
            <h3 style={{ marginBottom: "12px", fontFamily: "var(--font-title)", fontSize: "16px", fontWeight: 800 }}>
              Set Store Status: {commentAction}
            </h3>
            <p style={{ fontSize: "13px", color: "var(--text-muted)", marginBottom: "16px", lineHeight: "1.4" }}>
              Please provide a reason or instruction for placing <strong>{commentModalSeller.storeName}</strong> on <strong>{commentAction}</strong>. This comment will be displayed directly to the seller in their console.
            </p>
            <form onSubmit={handleUpdateSellerStatusWithComment}>
              <div style={{ display: "flex", flexDirection: "column", gap: "8px", marginBottom: "20px" }}>
                <label style={{ fontSize: "12px", fontWeight: 700 }}>Admin Comment / Reason</label>
                <textarea
                  value={adminComment}
                  onChange={(e) => setAdminComment(e.target.value)}
                  placeholder="e.g. Please upload a clear photocopy of your GST certificate."
                  className="auth-input"
                  style={{ minHeight: "100px", resize: "none", padding: "10px" }}
                  required
                />
              </div>
              <div style={{ display: "flex", gap: "10px", justifyContent: "flex-end" }}>
                <button
                  type="button"
                  onClick={() => { setCommentModalSeller(null); setCommentAction(null); setAdminComment(""); }}
                  className="btn-action-small"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="btn-action-small primary-style"
                  disabled={updating === commentModalSeller.id}
                >
                  Submit Status Update
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </section>
  );
}

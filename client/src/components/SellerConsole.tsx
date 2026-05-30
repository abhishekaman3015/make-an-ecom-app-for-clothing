import React, { FormEvent, useState } from "react";
import { BadgeCheck, Boxes, CreditCard, PackagePlus, Store, FileText, ShoppingCart, Upload, Image, FileUp, ExternalLink, AlertCircle } from "lucide-react";
import { api } from "../api";
import type { Product, Payout, Order, Seller } from "../types";

const rupee = new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 0 });
const money = (cents: number) => rupee.format(cents / 100);

const PRODUCT_CATEGORIES = [
  "Men Topwear",
  "Women Topwear",
  "Men Bottomwear",
  "Women Bottomwear",
  "Ethnic Wear",
  "Footwear",
  "Accessories",
  "Sportswear",
  "Kids Wear"
];

// Presets for gorgeous sample images
const IMAGE_PRESETS = [
  { name: "Ridge Overshirt", url: "/assets/ridge-overshirt.svg" },
  { name: "Loopback Hoodie", url: "/assets/loopback-hoodie.svg" },
  { name: "Everyday Tee", url: "/assets/everyday-tee.svg" },
  { name: "Utility Pant", url: "/assets/utility-pant.svg" }
];

interface SellerConsoleProps {
  token: string;
  seller: Seller | null;
  products: Product[];
  payouts: Payout[];
  orders: Order[];
  refresh: () => Promise<void>;
}

export function SellerConsole({
  token,
  seller,
  products,
  payouts,
  orders,
  refresh,
}: SellerConsoleProps) {
  const [formImage, setFormImage] = useState("/assets/everyday-tee.svg");
  const [submitting, setSubmitting] = useState(false);

  // Shop details form state
  const [storeName, setStoreName] = useState("");
  const [legalName, setLegalName] = useState("");
  const [gstin, setGstin] = useState("");
  const [logoUrl, setLogoUrl] = useState("");
  const [bannerUrl, setBannerUrl] = useState("");
  const [documentUrl, setDocumentUrl] = useState("");
  const [savingShop, setSavingShop] = useState(false);
  const [shopError, setShopError] = useState("");
  const [shopSuccess, setShopSuccess] = useState("");

  React.useEffect(() => {
    if (seller) {
      setStoreName(seller.storeName || "");
      setLegalName(seller.legalName || "");
      setGstin(seller.gstin || "");
      setLogoUrl(seller.logoUrl || "");
      setBannerUrl(seller.bannerUrl || "");
      setDocumentUrl(seller.documentUrl || "");
    }
  }, [seller]);

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>, type: "logo" | "banner" | "document") => {
    const file = e.target.files?.[0];
    if (!file) return;

    try {
      setSavingShop(true);
      setShopError("");
      setShopSuccess("");
      const result = await api.upload(file);
      if (type === "logo") setLogoUrl(result.url);
      else if (type === "banner") setBannerUrl(result.url);
      else if (type === "document") setDocumentUrl(result.url);
      setShopSuccess("File uploaded successfully! Click 'Save Shop Settings' below to persist changes.");
    } catch (err: any) {
      setShopError(err.message || "Failed to upload file.");
    } finally {
      setSavingShop(false);
    }
  };

  const handleSaveShopSettings = async (e: FormEvent) => {
    e.preventDefault();
    setSavingShop(true);
    setShopError("");
    setShopSuccess("");
    try {
      await api.updateSellerMe(token, {
        storeName,
        legalName,
        gstin,
        logoUrl: logoUrl || undefined,
        bannerUrl: bannerUrl || undefined,
        documentUrl: documentUrl || undefined,
      });
      setShopSuccess("Shop profile updated successfully!");
      await refresh();
    } catch (err: any) {
      setShopError(err.message || "Failed to update shop profile.");
    } finally {
      setSavingShop(false);
    }
  };

  const earningsCents = payouts.reduce((sum, item) => sum + item.amountCents, 0);

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setSubmitting(true);
    const form = new FormData(event.currentTarget);

    try {
      await api.createSellerProduct(token, {
        title: String(form.get("title")),
        description: String(form.get("description")),
        brand: String(form.get("brand")),
        category: String(form.get("category")),
        gender: String(form.get("gender")),
        imageUrl: formImage,
        mrpCents: Math.round(Number(form.get("mrp")) * 100),
        salePriceCents: Math.round(Number(form.get("price")) * 100),
        variants: [
          {
            size: String(form.get("size")),
            color: String(form.get("color")),
            stock: Number(form.get("stock")),
          },
        ],
      });
      event.currentTarget.reset();
      await refresh();
    } catch (err) {
      console.error("Failed to add product", err);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <section className="dashboard-container">
      {/* Header */}
      <div className="dashboard-header">
        <div>
          <h1>Seller Studio</h1>
          <p style={{ color: "var(--text-muted)", fontSize: "14px" }}>
            Store: <strong style={{ color: "var(--text-dark)" }}>{seller?.storeName || "Loading..."}</strong>
          </p>
        </div>
      </div>

      {/* Alert Banner based on Seller Status */}
      {seller && (
        <div style={{ marginBottom: "20px" }}>
          {seller.status === "PENDING" && (
            <div className="warning" style={{ background: "#fffbeb", borderColor: "#fef3c7", color: "#b45309", padding: "16px", borderRadius: "8px", border: "1px solid" }}>
              <div style={{ display: "flex", gap: "10px", alignItems: "center" }}>
                <span style={{ fontSize: "20px" }}>⏳</span>
                <div>
                  <strong style={{ display: "block" }}>Registration Under Review</strong>
                  <span style={{ fontSize: "13px" }}>We are verifying your documents. You can add products to your catalog in the meantime; they will automatically go live once approved!</span>
                </div>
              </div>
            </div>
          )}
          {seller.status === "HOLD" && (
            <div className="warning" style={{ background: "#fff7ed", borderColor: "#ffedd5", color: "#c2410c", padding: "16px", borderRadius: "8px", border: "1px solid" }}>
              <div style={{ display: "flex", gap: "10px", alignItems: "center" }}>
                <span style={{ fontSize: "20px" }}>⚠️</span>
                <div>
                  <strong style={{ display: "block" }}>Registration Placed on Hold</strong>
                  <span style={{ fontSize: "13px" }}>Reason: <strong style={{ textDecoration: "underline" }}>{seller.adminComment || "Please contact admin."}</strong></span>
                  <span style={{ display: "block", fontSize: "12px", marginTop: "4px" }}>Please upload a valid verification document below to submit for re-evaluation.</span>
                </div>
              </div>
            </div>
          )}
          {seller.status === "REJECTED" && (
            <div className="warning" style={{ background: "#fef2f2", borderColor: "#fee2e2", color: "#b91c1c", padding: "16px", borderRadius: "8px", border: "1px solid" }}>
              <div style={{ display: "flex", gap: "10px", alignItems: "center" }}>
                <span style={{ fontSize: "20px" }}>❌</span>
                <div>
                  <strong style={{ display: "block" }}>Registration Rejected</strong>
                  <span style={{ fontSize: "13px" }}>Reason: <strong>{seller.adminComment || "Please contact admin."}</strong></span>
                  <span style={{ display: "block", fontSize: "12px", marginTop: "4px" }}>You can update your shop details or upload a new verification document below to apply again.</span>
                </div>
              </div>
            </div>
          )}
          {seller.status === "SUSPENDED" && (
            <div className="warning" style={{ background: "#faf5ff", borderColor: "#f3e8ff", color: "#6b21a8", padding: "16px", borderRadius: "8px", border: "1px solid" }}>
              <div style={{ display: "flex", gap: "10px", alignItems: "center" }}>
                <span style={{ fontSize: "20px" }}>🚫</span>
                <div>
                  <strong style={{ display: "block" }}>Shop Suspended</strong>
                  <span style={{ fontSize: "13px" }}>Reason: <strong>{seller.adminComment || "Suspended by Administrator."}</strong></span>
                  <span style={{ display: "block", fontSize: "12px", marginTop: "4px" }}>Your products are currently hidden from the buyer marketplace. Please resolve this with admin.</span>
                </div>
              </div>
            </div>
          )}
          {seller.status === "APPROVED" && (
            <div className="warning" style={{ background: "#f0fdf4", borderColor: "#dcfce7", color: "#15803d", padding: "16px", borderRadius: "8px", border: "1px solid" }}>
              <div style={{ display: "flex", gap: "10px", alignItems: "center" }}>
                <span style={{ fontSize: "20px" }}>✅</span>
                <div>
                  <strong style={{ display: "block" }}>Seller Account Approved</strong>
                  <span style={{ fontSize: "13px" }}>Congratulations! Your store is fully verified and products are live on MaithilCart.</span>
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Metrics */}
      <div className="dashboard-grid">
        <article className="metrics-card">
          <div className="metrics-icon-container">
            <BadgeCheck size={28} />
          </div>
          <div className="metrics-info">
            <span>Seller Status</span>
            <strong className={`status-pill ${seller?.status?.toLowerCase() || "pending"}`} style={{ display: "inline-block", marginTop: "4px" }}>
              {seller?.status || "PENDING"}
            </strong>
          </div>
        </article>

        <article className="metrics-card">
          <div className="metrics-icon-container">
            <Boxes size={28} />
          </div>
          <div className="metrics-info">
            <span>Total Products</span>
            <strong>{products.length} Items</strong>
          </div>
        </article>

        <article className="metrics-card">
          <div className="metrics-icon-container">
            <CreditCard size={28} />
          </div>
          <div className="metrics-info">
            <span>Total Earnings</span>
            <strong>{money(earningsCents)}</strong>
          </div>
        </article>
      </div>

      {/* Splitted panels */}
      <div className="dashboard-row-split">
        {/* Left Side: Forms and Inventory */}
        <div style={{ display: "flex", flexDirection: "column", gap: "30px" }}>
          {/* Shop Settings & Verification */}
          <section className="dashboard-section">
            <h2>
              <Store size={18} style={{ verticalAlign: "middle", marginRight: "8px", color: "var(--primary)" }} />
              Shop Settings & Verification
            </h2>

            <form className="upload-card-form" onSubmit={handleSaveShopSettings}>
              {shopError && (
                <div className="warning" style={{ background: "#fef2f2", color: "#b91c1c", borderColor: "#fee2e2" }}>
                  {shopError}
                </div>
              )}
              {shopSuccess && (
                <div className="warning" style={{ background: "#f0fdf4", color: "#15803d", borderColor: "#dcfce7" }}>
                  {shopSuccess}
                </div>
              )}

              <div className="grid-2col">
                <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
                  <label style={{ fontSize: "12px", fontWeight: 700 }}>Store Display Name</label>
                  <input
                    value={storeName}
                    onChange={(e) => setStoreName(e.target.value)}
                    placeholder="e.g. Urban Loom"
                    className="auth-input"
                    required
                  />
                </div>
                <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
                  <label style={{ fontSize: "12px", fontWeight: 700 }}>Legal Business Name</label>
                  <input
                    value={legalName}
                    onChange={(e) => setLegalName(e.target.value)}
                    placeholder="e.g. Urban Loom Pvt Ltd"
                    className="auth-input"
                    required
                  />
                </div>
              </div>

              <div className="grid-2col">
                <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
                  <label style={{ fontSize: "12px", fontWeight: 700 }}>GSTIN (GST Number)</label>
                  <input
                    value={gstin}
                    onChange={(e) => setGstin(e.target.value)}
                    placeholder="e.g. 29ABCDE1234F1Z5"
                    className="auth-input"
                  />
                </div>
                <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
                  <label style={{ fontSize: "12px", fontWeight: 700 }}>Verification Document (PDF/Image)</label>
                  <div style={{ display: "flex", gap: "10px", alignItems: "center" }}>
                    <label className="btn-action-small primary-style" style={{ display: "inline-flex", gap: "6px", alignItems: "center", cursor: "pointer", margin: 0 }}>
                      <FileUp size={14} />
                      Upload Doc
                      <input
                        type="file"
                        accept=".pdf,.jpg,.jpeg,.png"
                        onChange={(e) => handleFileUpload(e, "document")}
                        style={{ display: "none" }}
                      />
                    </label>
                    {documentUrl ? (
                      <a href={documentUrl} target="_blank" rel="noreferrer" style={{ fontSize: "12px", color: "var(--primary)", display: "inline-flex", alignItems: "center", gap: "4px" }}>
                        View Document <ExternalLink size={12} />
                      </a>
                    ) : (
                      <span style={{ fontSize: "12px", color: "var(--text-muted)" }}>No document uploaded</span>
                    )}
                  </div>
                </div>
              </div>

              {/* Branding Customizations */}
              <div style={{ borderTop: "1px solid var(--border-color)", paddingTop: "14px", marginTop: "10px" }}>
                <h4 style={{ fontSize: "13px", fontWeight: 800, marginBottom: "12px", color: "var(--text-dark)" }}>Shop Branding</h4>
                
                <div style={{ display: "flex", gap: "30px", flexWrap: "wrap" }}>
                  <div style={{ display: "flex", flexDirection: "column", gap: "6px", flex: "1 1 200px" }}>
                    <label style={{ fontSize: "12px", fontWeight: 700 }}>Shop Logo</label>
                    <div style={{ display: "flex", gap: "12px", alignItems: "center" }}>
                      <div style={{ width: "60px", height: "60px", borderRadius: "8px", border: "1px solid var(--border-color)", backgroundColor: "#fafafa", overflow: "hidden", display: "flex", alignItems: "center", justifyItems: "center" }}>
                        {logoUrl ? (
                          <img src={logoUrl} alt="Logo Preview" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
                        ) : (
                          <Image size={24} style={{ margin: "auto", color: "var(--text-muted)" }} />
                        )}
                      </div>
                      <label className="btn-action-small" style={{ cursor: "pointer", display: "inline-flex", gap: "6px", alignItems: "center" }}>
                        <Upload size={12} /> Upload Logo
                        <input
                          type="file"
                          accept="image/*"
                          onChange={(e) => handleFileUpload(e, "logo")}
                          style={{ display: "none" }}
                        />
                      </label>
                    </div>
                  </div>

                  <div style={{ display: "flex", flexDirection: "column", gap: "6px", flex: "2 1 300px" }}>
                    <label style={{ fontSize: "12px", fontWeight: 700 }}>Shop Banner</label>
                    <div style={{ display: "flex", gap: "12px", alignItems: "center" }}>
                      <div style={{ height: "60px", flexGrow: 1, borderRadius: "8px", border: "1px solid var(--border-color)", backgroundColor: "#fafafa", overflow: "hidden", display: "flex", alignItems: "center", justifyItems: "center" }}>
                        {bannerUrl ? (
                          <img src={bannerUrl} alt="Banner Preview" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
                        ) : (
                          <Image size={24} style={{ margin: "auto", color: "var(--text-muted)" }} />
                        )}
                      </div>
                      <label className="btn-action-small" style={{ cursor: "pointer", display: "inline-flex", gap: "6px", alignItems: "center" }}>
                        <Upload size={12} /> Upload Banner
                        <input
                          type="file"
                          accept="image/*"
                          onChange={(e) => handleFileUpload(e, "banner")}
                          style={{ display: "none" }}
                        />
                      </label>
                    </div>
                  </div>
                </div>
              </div>

              <button className="btn-place-order" type="submit" disabled={savingShop} style={{ marginTop: "14px" }}>
                {savingShop ? "Saving..." : "Save Shop Settings"}
              </button>
            </form>
          </section>

          {/* Upload Product Form */}
          <section className="dashboard-section">
            <h2>
              <PackagePlus size={18} style={{ verticalAlign: "middle", marginRight: "8px", color: "var(--primary)" }} />
              Upload New Product
            </h2>

            <form className="upload-card-form" onSubmit={handleSubmit}>
              {seller && (!seller.canListProducts || seller.status !== "APPROVED") && (
                <div className="warning">
                  ⚠️ Your shop registration is pending admin approval. Products will be queued and shown once you are approved.
                </div>
              )}

              <div className="grid-2col">
                <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
                  <label style={{ fontSize: "12px", fontWeight: 700 }}>Product Title</label>
                  <input name="title" placeholder="e.g. Slim Fit Cotton Shirt" className="auth-input" required />
                </div>
                <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
                  <label style={{ fontSize: "12px", fontWeight: 700 }}>Brand</label>
                  <input name="brand" placeholder="e.g. Roadster" className="auth-input" required />
                </div>
              </div>

              <div className="grid-2col">
                <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
                  <label style={{ fontSize: "12px", fontWeight: 700 }}>Category</label>
                  <select name="category" defaultValue="Men Topwear" className="auth-input" required>
                    {PRODUCT_CATEGORIES.map((c) => (
                      <option key={c} value={c}>{c}</option>
                    ))}
                  </select>
                </div>
                <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
                  <label style={{ fontSize: "12px", fontWeight: 700 }}>Target Gender</label>
                  <select name="gender" defaultValue="Men" className="auth-input" required>
                    <option value="Men">Men</option>
                    <option value="Women">Women</option>
                    <option value="Kids">Kids</option>
                    <option value="Unisex">Unisex</option>
                  </select>
                </div>
              </div>

              <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
                <label style={{ fontSize: "12px", fontWeight: 700 }}>Choose Style Preset Image</label>
                <div style={{ display: "flex", gap: "10px", flexWrap: "wrap", margin: "4px 0" }}>
                  {IMAGE_PRESETS.map((preset) => (
                    <button
                      key={preset.url}
                      type="button"
                      onClick={() => setFormImage(preset.url)}
                      style={{
                        padding: "6px 12px",
                        border: "1px solid",
                        borderColor: formImage === preset.url ? "var(--primary)" : "var(--border-color)",
                        borderRadius: "20px",
                        fontSize: "12px",
                        fontWeight: 600,
                        backgroundColor: formImage === preset.url ? "var(--primary-light)" : "white",
                        color: formImage === preset.url ? "var(--primary)" : "var(--text-normal)"
                      }}
                    >
                      {preset.name}
                    </button>
                  ))}
                </div>
              </div>

              <div className="grid-2col">
                <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
                  <label style={{ fontSize: "12px", fontWeight: 700 }}>MRP (Original Price in INR)</label>
                  <input name="mrp" type="number" placeholder="e.g. 999" className="auth-input" required />
                </div>
                <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
                  <label style={{ fontSize: "12px", fontWeight: 700 }}>Selling Price (Price after Discount)</label>
                  <input name="price" type="number" placeholder="e.g. 499" className="auth-input" required />
                </div>
              </div>

              <div className="grid-3col">
                <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
                  <label style={{ fontSize: "12px", fontWeight: 700 }}>Initial Size</label>
                  <input name="size" placeholder="e.g. M" className="auth-input" required />
                </div>
                <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
                  <label style={{ fontSize: "12px", fontWeight: 700 }}>Color</label>
                  <input name="color" placeholder="e.g. Black" className="auth-input" required />
                </div>
                <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
                  <label style={{ fontSize: "12px", fontWeight: 700 }}>Stock Qty</label>
                  <input name="stock" type="number" placeholder="e.g. 50" className="auth-input" required />
                </div>
              </div>

              <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
                <label style={{ fontSize: "12px", fontWeight: 700 }}>Description</label>
                <textarea name="description" placeholder="Product details..." className="auth-input" style={{ minHeight: "80px", resize: "none" }} required />
              </div>

              <button className="btn-place-order" type="submit" disabled={submitting}>
                {submitting ? "Uploading..." : "Submit for Catalog Approval"}
              </button>
            </form>
          </section>

          {/* Product Inventory */}
          <section className="dashboard-section">
            <h2>
              <Boxes size={18} style={{ verticalAlign: "middle", marginRight: "8px", color: "var(--primary)" }} />
              Active Inventory ({products.length})
            </h2>

            <div className="glass-table-container">
              <table className="glass-table">
                <thead>
                  <tr>
                    <th>Product details</th>
                    <th>Stock status</th>
                    <th>Catalog approval</th>
                  </tr>
                </thead>
                <tbody>
                  {products.length === 0 ? (
                    <tr>
                      <td colSpan={3} style={{ textAlign: "center", color: "var(--text-muted)", padding: "20px" }}>
                        No products uploaded yet.
                      </td>
                    </tr>
                  ) : (
                    products.map((p) => {
                      const totalStock = p.variants.reduce((sum, v) => sum + v.stock, 0);
                      return (
                        <tr key={p.id}>
                          <td>
                            <strong>{p.title}</strong>
                            <span style={{ display: "block", fontSize: "11px", color: "var(--text-muted)", marginTop: "2px" }}>
                              {p.brand} · {p.category}
                            </span>
                          </td>
                          <td>
                            <strong>{totalStock} units</strong>
                          </td>
                          <td>
                            <span className={`status-pill ${p.approved ? "approved" : "pending"}`}>
                              {p.approved ? "Live" : "Awaiting"}
                            </span>
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
          </section>
        </div>

        {/* Right Side: Payouts and Orders */}
        <div style={{ display: "flex", flexDirection: "column", gap: "30px" }}>
          {/* Orders Received */}
          <section className="dashboard-section">
            <h2>
              <ShoppingCart size={18} style={{ verticalAlign: "middle", marginRight: "8px", color: "var(--primary)" }} />
              Incoming Orders
            </h2>

            <div className="glass-table-container">
              <table className="glass-table">
                <thead>
                  <tr>
                    <th>Order Ref</th>
                    <th>Status</th>
                    <th>Grand total</th>
                  </tr>
                </thead>
                <tbody>
                  {orders.length === 0 ? (
                    <tr>
                      <td colSpan={3} style={{ textAlign: "center", color: "var(--text-muted)", padding: "20px" }}>
                        No orders received yet.
                      </td>
                    </tr>
                  ) : (
                    orders.map((o) => (
                      <tr key={o.id}>
                        <td>
                          <strong>#{o.id.slice(0, 8).toUpperCase()}</strong>
                          <span style={{ display: "block", fontSize: "11px", color: "var(--text-muted)", marginTop: "2px" }}>
                            {new Date(o.createdAt).toLocaleDateString()}
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

          {/* Payouts Ledger */}
          <section className="dashboard-section">
            <h2>
              <FileText size={18} style={{ verticalAlign: "middle", marginRight: "8px", color: "var(--primary)" }} />
              Payout History
            </h2>

            <div className="glass-table-container">
              <table className="glass-table">
                <thead>
                  <tr>
                    <th>Payout Ref</th>
                    <th>Amount paid</th>
                    <th>Status</th>
                  </tr>
                </thead>
                <tbody>
                  {payouts.length === 0 ? (
                    <tr>
                      <td colSpan={3} style={{ textAlign: "center", color: "var(--text-muted)", padding: "20px" }}>
                        No payouts issued yet.
                      </td>
                    </tr>
                  ) : (
                    payouts.map((pay) => (
                      <tr key={pay.id}>
                        <td>
                          <strong>#{pay.id.slice(0, 8).toUpperCase()}</strong>
                          <span style={{ display: "block", fontSize: "11px", color: "var(--text-muted)", marginTop: "2px" }}>
                            {new Date(pay.createdAt).toLocaleDateString()}
                          </span>
                        </td>
                        <td>
                          <strong>{money(pay.amountCents)}</strong>
                        </td>
                        <td>
                          <span className={`status-pill ${pay.status.toLowerCase()}`}>
                            {pay.status}
                          </span>
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

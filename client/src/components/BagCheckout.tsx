import React, { useState } from "react";
import { X, CreditCard, ArrowLeft, Shield } from "lucide-react";
import { api } from "../api";
import type { CartItem } from "../types";

const rupee = new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 0 });
const money = (cents: number) => rupee.format(cents / 100);

interface BagCheckoutProps {
  cart: CartItem[];
  token: string | undefined;
  refresh: () => Promise<void>;
  onPlaceOrder: (payload: { shippingName: string; shippingPhone: string; shippingAddress: string; paymentMethod: string }) => Promise<void>;
  onRemoveItem: (id: string) => Promise<void>;
  setView: (view: "shop" | "orders" | "seller" | "admin" | "bag") => void;
}

type CheckoutStep = "BAG" | "ADDRESS" | "PAYMENT";

export function BagCheckout({
  cart,
  token,
  refresh,
  onPlaceOrder,
  onRemoveItem,
  setView,
}: BagCheckoutProps) {
  const [step, setStep] = useState<CheckoutStep>("BAG");

  // Shipping details state
  const [shippingName, setShippingName] = useState("Aarav Sharma");
  const [shippingPhone, setShippingPhone] = useState("9876543210");
  const [shippingAddress, setShippingAddress] = useState("Flat 405, Green Glen Layout, Bellandur");
  const [shippingCity, setShippingCity] = useState("Bengaluru");
  const [shippingState, setShippingState] = useState("Karnataka");
  const [shippingPin, setShippingPin] = useState("560103");

  // Payment details state
  const [paymentMethod, setPaymentMethod] = useState("card");
  const [cardNumber, setCardNumber] = useState("4321 5678 9012 3456");
  const [cardName, setCardName] = useState("Aarav Sharma");
  const [cardExpiry, setCardExpiry] = useState("12/29");
  const [cardCvv, setCardCvv] = useState("123");

  const [loading, setLoading] = useState(false);

  // Price calculation
  const totalMrpCents = cart.reduce((sum, item) => sum + item.quantity * item.product.mrpCents, 0);
  const totalSaleCents = cart.reduce((sum, item) => sum + item.quantity * item.product.salePriceCents, 0);
  const discountCents = totalMrpCents - totalSaleCents;

  const deliveryThresholdCents = 99900; // Free delivery above Rs. 999
  const deliveryFeeCents = totalSaleCents >= deliveryThresholdCents || totalSaleCents === 0 ? 0 : 9900;
  const grandTotalCents = totalSaleCents + deliveryFeeCents;

  const handleQtyChange = async (itemId: string, qty: number) => {
    if (!token) return;
    try {
      await api.updateCart(token, itemId, qty);
      await refresh();
    } catch (err) {
      console.error("Failed to update qty", err);
    }
  };

  const handleRemove = async (itemId: string) => {
    try {
      await onRemoveItem(itemId);
    } catch (err) {
      console.error("Failed to remove item", err);
    }
  };

  const handleCheckoutSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!token) return;

    setLoading(true);
    const fullAddress = `${shippingAddress}, ${shippingCity}, ${shippingState} - ${shippingPin}`;
    try {
      await onPlaceOrder({
        shippingName,
        shippingPhone,
        shippingAddress: fullAddress,
        paymentMethod: paymentMethod === "card" ? "mock-card" : "cod",
      });
    } catch (err) {
      console.error("Checkout failed", err);
    } finally {
      setLoading(false);
    }
  };

  if (cart.length === 0 && step === "BAG") {
    return (
      <div style={{ textAlign: "center", padding: "80px 20px" }}>
        <div style={{ fontSize: "64px", marginBottom: "20px" }}>🛍️</div>
        <h2 style={{ fontFamily: "var(--font-title)", fontWeight: 800, fontSize: "20px", color: "var(--text-dark)" }}>
          YOUR BAG IS EMPTY
        </h2>
        <p style={{ color: "var(--text-muted)", fontSize: "14px", marginTop: "8px", marginBottom: "24px" }}>
          There is nothing in your bag. Add items from the shop to get started!
        </p>
        <button 
          className="btn-place-order" 
          style={{ maxWidth: "200px", margin: "0 auto" }}
          onClick={() => setView("shop")}
        >
          Shop Now
        </button>
      </div>
    );
  }

  return (
    <div>
      {/* Checkout Progress Stepper */}
      <div className="checkout-steps">
        <div className={`step-item ${step === "BAG" ? "active" : "completed"}`}>
          <span className="step-num">{step === "BAG" ? "1" : "✓"}</span>
          <span>Bag</span>
        </div>
        <div className="step-divider" />
        <div className={`step-item ${step === "ADDRESS" ? "active" : step === "PAYMENT" ? "completed" : ""}`}>
          <span className="step-num">{step === "PAYMENT" ? "✓" : "2"}</span>
          <span>Address</span>
        </div>
        <div className="step-divider" />
        <div className={`step-item ${step === "PAYMENT" ? "active" : ""}`}>
          <span className="step-num">3</span>
          <span>Payment</span>
        </div>
      </div>

      <div className="bag-layout">
        {/* Left Side: Step Content */}
        <div className="bag-content-left">
          {step === "BAG" && (
            <div style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
              <h2 className="bag-title">Items in Bag ({cart.length})</h2>
              {cart.map((item) => {
                const itemDiscountPercent = item.product.mrpCents > item.product.salePriceCents
                  ? Math.round(((item.product.mrpCents - item.product.salePriceCents) / item.product.mrpCents) * 100)
                  : 0;

                return (
                  <div className="bag-card" key={item.id}>
                    <img src={item.product.imageUrl} alt={item.product.title} />
                    <div className="bag-card-info">
                      <h4 className="bag-card-brand">{item.product.brand}</h4>
                      <p className="bag-card-title">{item.product.title}</p>
                      
                      <div className="bag-card-variants">
                        <span>Size: <strong>{item.variant.size}</strong></span>
                        <span>Color: <strong>{item.variant.color}</strong></span>
                      </div>

                      <div className="bag-card-price-row">
                        <span className="sale-price" style={{ fontSize: "15px" }}>
                          {money(item.product.salePriceCents)}
                        </span>
                        {item.product.mrpCents > item.product.salePriceCents && (
                          <>
                            <span className="mrp-price">{money(item.product.mrpCents)}</span>
                            <span className="discount-percentage">({itemDiscountPercent}% OFF)</span>
                          </>
                        )}
                      </div>

                      <div className="bag-card-qty">
                        <span style={{ fontSize: "12px", fontWeight: 700 }}>Qty:</span>
                        <select
                          className="qty-select"
                          value={item.quantity}
                          onChange={(e) => handleQtyChange(item.id, Number(e.target.value))}
                        >
                          {[1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map((n) => (
                            <option key={n} value={n}>{n}</option>
                          ))}
                        </select>
                      </div>
                    </div>

                    <button 
                      className="btn-remove-item" 
                      onClick={() => handleRemove(item.id)}
                      aria-label="Remove item"
                    >
                      <X size={18} />
                    </button>
                  </div>
                );
              })}

              <button 
                className="btn-place-order" 
                onClick={() => setStep("ADDRESS")}
                style={{ marginTop: "12px" }}
              >
                Proceed to Shipping Address
              </button>
            </div>
          )}

          {step === "ADDRESS" && (
            <form className="form-card" onSubmit={(e) => { e.preventDefault(); setStep("PAYMENT"); }}>
              <div style={{ display: "flex", alignItems: "center", gap: "10px", marginBottom: "8px" }}>
                <button type="button" onClick={() => setStep("BAG")} style={{ color: "var(--text-dark)" }}>
                  <ArrowLeft size={20} />
                </button>
                <h2 className="bag-title" style={{ margin: 0 }}>Delivery Address</h2>
              </div>

              <div className="grid-2col">
                <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
                  <label style={{ fontSize: "12px", fontWeight: 700 }}>Contact Name</label>
                  <input
                    type="text"
                    value={shippingName}
                    onChange={(e) => setShippingName(e.target.value)}
                    required
                    className="auth-input"
                  />
                </div>
                <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
                  <label style={{ fontSize: "12px", fontWeight: 700 }}>Contact Mobile</label>
                  <input
                    type="tel"
                    value={shippingPhone}
                    onChange={(e) => setShippingPhone(e.target.value)}
                    required
                    className="auth-input"
                  />
                </div>
              </div>

              <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
                <label style={{ fontSize: "12px", fontWeight: 700 }}>Street Address / Flat No.</label>
                <textarea
                  value={shippingAddress}
                  onChange={(e) => setShippingAddress(e.target.value)}
                  required
                  className="auth-input"
                  style={{ minHeight: "80px", resize: "none" }}
                />
              </div>

              <div className="grid-3col">
                <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
                  <label style={{ fontSize: "12px", fontWeight: 700 }}>City</label>
                  <input
                    type="text"
                    value={shippingCity}
                    onChange={(e) => setShippingCity(e.target.value)}
                    required
                    className="auth-input"
                  />
                </div>
                <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
                  <label style={{ fontSize: "12px", fontWeight: 700 }}>State</label>
                  <input
                    type="text"
                    value={shippingState}
                    onChange={(e) => setShippingState(e.target.value)}
                    required
                    className="auth-input"
                  />
                </div>
                <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
                  <label style={{ fontSize: "12px", fontWeight: 700 }}>PIN Code</label>
                  <input
                    type="text"
                    value={shippingPin}
                    onChange={(e) => setShippingPin(e.target.value)}
                    required
                    className="auth-input"
                  />
                </div>
              </div>

              <button className="btn-place-order" type="submit" style={{ marginTop: "12px" }}>
                Continue to Payment
              </button>
            </form>
          )}

          {step === "PAYMENT" && (
            <form className="form-card" onSubmit={handleCheckoutSubmit}>
              <div style={{ display: "flex", alignItems: "center", gap: "10px", marginBottom: "8px" }}>
                <button type="button" onClick={() => setStep("ADDRESS")} style={{ color: "var(--text-dark)" }}>
                  <ArrowLeft size={20} />
                </button>
                <h2 className="bag-title" style={{ margin: 0 }}>Payment Method</h2>
              </div>

              {/* Payment selector */}
              <div className="payment-method-selector">
                <button
                  type="button"
                  className={`payment-option-btn ${paymentMethod === "card" ? "selected" : ""}`}
                  onClick={() => setPaymentMethod("card")}
                >
                  <CreditCard size={20} />
                  <span>Credit / Debit Card</span>
                </button>
                <button
                  type="button"
                  className={`payment-option-btn ${paymentMethod === "cod" ? "selected" : ""}`}
                  onClick={() => setPaymentMethod("cod")}
                >
                  <span>💵</span>
                  <span>Cash on Delivery</span>
                </button>
              </div>

              {paymentMethod === "card" && (
                <div style={{ display: "flex", flexDirection: "column", gap: "16px", marginTop: "10px" }}>
                  {/* Card Form */}
                  <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
                    <label style={{ fontSize: "11px", fontWeight: 700, color: "var(--text-muted)" }}>CARD NUMBER</label>
                    <input
                      type="text"
                      value={cardNumber}
                      onChange={(e) => setCardNumber(e.target.value)}
                      required
                      placeholder="XXXX XXXX XXXX XXXX"
                      className="auth-input"
                    />
                  </div>

                  <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
                    <label style={{ fontSize: "11px", fontWeight: 700, color: "var(--text-muted)" }}>CARDHOLDER NAME</label>
                    <input
                      type="text"
                      value={cardName}
                      onChange={(e) => setCardName(e.target.value)}
                      required
                      placeholder="NAME ON CARD"
                      className="auth-input"
                    />
                  </div>

                  <div className="grid-2col">
                    <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
                      <label style={{ fontSize: "11px", fontWeight: 700, color: "var(--text-muted)" }}>EXPIRY (MM/YY)</label>
                      <input
                        type="text"
                        value={cardExpiry}
                        onChange={(e) => setCardExpiry(e.target.value)}
                        required
                        placeholder="MM/YY"
                        className="auth-input"
                      />
                    </div>
                    <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
                      <label style={{ fontSize: "11px", fontWeight: 700, color: "var(--text-muted)" }}>CVV</label>
                      <input
                        type="password"
                        value={cardCvv}
                        onChange={(e) => setCardCvv(e.target.value)}
                        required
                        placeholder="XXX"
                        className="auth-input"
                        maxLength={3}
                      />
                    </div>
                  </div>
                </div>
              )}

              {paymentMethod === "cod" && (
                <div className="warning" style={{ background: "#e8f9f5", borderColor: "#03a685", color: "#03a685", fontSize: "13px" }}>
                  <strong>Pay on Delivery Enabled!</strong> You can pay in cash or via UPI at the time of delivery. A standard verification check will occur.
                </div>
              )}

              {/* Secure Trust Badge */}
              <div style={{ display: "flex", alignItems: "center", gap: "8px", alignSelf: "center", color: "var(--text-muted)", fontSize: "11px", marginTop: "10px" }}>
                <Shield size={14} style={{ color: "#03a685" }} />
                <span>100% Safe Payments. Encrypted transactions.</span>
              </div>

              <button
                className="btn-place-order"
                type="submit"
                disabled={loading}
                style={{ marginTop: "12px" }}
              >
                {loading ? "Processing Payment..." : "Pay and Secure Order"}
              </button>
            </form>
          )}
        </div>

        {/* Right Side: Price Details Summary */}
        <div className="summary-pane">
          <h3 className="summary-title">Price Details ({cart.reduce((sum, item) => sum + item.quantity, 0)} Items)</h3>
          
          <div className="price-item-row">
            <span>Total MRP</span>
            <span>{money(totalMrpCents)}</span>
          </div>

          {discountCents > 0 && (
            <div className="price-item-row">
              <span>Discount on MRP</span>
              <span className="discount">-{money(discountCents)}</span>
            </div>
          )}

          <div className="price-item-row">
            <span>Convenience Fee / Shipping</span>
            <span>
              {deliveryFeeCents === 0 ? (
                <span className="discount" style={{ fontWeight: 700 }}>FREE</span>
              ) : (
                money(deliveryFeeCents)
              )}
            </span>
          </div>

          {deliveryFeeCents > 0 && (
            <p style={{ fontSize: "11px", color: "var(--text-muted)", marginTop: "-10px" }}>
              Add items worth <strong style={{ color: "var(--primary)" }}>{money(deliveryThresholdCents - totalSaleCents)}</strong> more for free delivery.
            </p>
          )}

          <div className="price-item-row total">
            <span>Total Amount</span>
            <span>{money(grandTotalCents)}</span>
          </div>
        </div>
      </div>
    </div>
  );
}

import React, { FormEvent, useState } from "react";
import { X } from "lucide-react";
import { api, AuthPayload } from "../api";
import { GoogleLogin } from "@react-oauth/google";

interface AuthModalProps {
  onClose: () => void;
  onAuth: (payload: AuthPayload) => void;
  initialMode?: "login" | "signup";
}

export function AuthModal({ onClose, onAuth, initialMode = "login" }: AuthModalProps) {
  const [mode, setMode] = useState<"login" | "signup">(initialMode);
  const [role, setRole] = useState<"BUYER" | "SELLER">("BUYER");
  const [errorMsg, setErrorMsg] = useState("");
  const [loading, setLoading] = useState(false);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setErrorMsg("");
    setLoading(true);
    const form = new FormData(event.currentTarget);
    const email = String(form.get("email"));
    const password = String(form.get("password"));

    try {
      const payload = mode === "login"
        ? await api.login(email, password)
        : await api.signup({
            name: String(form.get("name")),
            email,
            password,
            role,
            phone: String(form.get("phone") || ""),
            storeName: String(form.get("storeName") || ""),
            legalName: String(form.get("legalName") || ""),
            gstin: String(form.get("gstin") || ""),
            payoutAccount: String(form.get("payoutAccount") || "")
          });
      onAuth(payload);
      onClose();
    } catch (err: any) {
      setErrorMsg(err.message || "Something went wrong. Please check your credentials.");
    } finally {
      setLoading(false);
    }
  }

  const handleQuickLogin = async (kind: "buyer" | "seller" | "admin") => {
    setLoading(true);
    setErrorMsg("");
    const creds = {
      buyer: ["buyer@maithilcart.test", "shop1234"],
      seller: ["seller@maithilcart.test", "seller1234"],
      admin: ["admin@maithilcart.test", "admin1234"]
    }[kind];
    try {
      const payload = await api.login(creds[0], creds[1]);
      onAuth(payload);
      onClose();
    } catch (err: any) {
      setErrorMsg(err.message || "Failed to log in.");
    } finally {
      setLoading(false);
    }
  };

  const handleGoogleLogin = async () => {
    setLoading(true);
    setErrorMsg("");
    try {
      const payload = await api.googleLogin("mock_googleid123_buyer-google@maithilcart.test_Google-User");
      onAuth(payload);
      onClose();
    } catch (err: any) {
      setErrorMsg(err.message || "Failed to authenticate with Google.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal-window auth-container" onClick={(e) => e.stopPropagation()}>
        <button className="modal-close" onClick={onClose} aria-label="Close modal">
          <X size={18} />
        </button>

        {/* Left Side: Brand Banner */}
        <div className="auth-sidebar-banner">
          <div>
            <h3>MaithilCart</h3>
            <p style={{ marginTop: "12px", fontSize: "15px", fontWeight: 600 }}>
              Join the family of 10M+ fashion lovers!
            </p>
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
            <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
              <div style={{ width: "8px", height: "8px", background: "white", borderRadius: "50%" }} />
              <p>100% Original Products</p>
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
              <div style={{ width: "8px", height: "8px", background: "white", borderRadius: "50%" }} />
              <p>Easy 15 Day Returns & Exchanges</p>
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
              <div style={{ width: "8px", height: "8px", background: "white", borderRadius: "50%" }} />
              <p>Super-fast Express Shipping</p>
            </div>
          </div>
          <p style={{ fontSize: "11px", opacity: 0.8 }}>
            By signing up, you agree to our Terms of Use and Privacy Policy.
          </p>
        </div>

        {/* Right Side: Forms */}
        <div className="auth-form-side">
          <div className="auth-header">
            <h2>{mode === "login" ? "Login" : "Create Account"}</h2>
            <p>{mode === "login" ? "Enter email & password to sign in" : "Register a new buyer or seller account"}</p>
          </div>

          {errorMsg && (
            <div className="warning" style={{ marginBottom: "16px", fontSize: "13px" }}>
              {errorMsg}
            </div>
          )}

          <form onSubmit={handleSubmit}>
            <div className="auth-input-group">
              {mode === "signup" && (
                <>
                  <input
                    name="name"
                    type="text"
                    placeholder="Full Name"
                    className="auth-input"
                    required
                  />
                  <div className="role-selector">
                    <button
                      type="button"
                      className={role === "BUYER" ? "active" : ""}
                      onClick={() => setRole("BUYER")}
                    >
                      Buyer
                    </button>
                    <button
                      type="button"
                      className={role === "SELLER" ? "active" : ""}
                      onClick={() => setRole("SELLER")}
                    >
                      Seller
                    </button>
                  </div>
                </>
              )}

              <input
                name="email"
                type="email"
                placeholder="Email Address"
                className="auth-input"
                required
              />

              <input
                name="password"
                type="password"
                placeholder="Password (Min. 8 characters)"
                className="auth-input"
                minLength={8}
                required
              />

              {mode === "signup" && (
                <input
                  name="phone"
                  type="tel"
                  placeholder="Phone Number (Optional)"
                  className="auth-input"
                />
              )}

              {mode === "signup" && role === "SELLER" && (
                <>
                  <input
                    name="storeName"
                    type="text"
                    placeholder="Store Name"
                    className="auth-input"
                    required
                  />
                  <input
                    name="legalName"
                    type="text"
                    placeholder="Legal Entity Name"
                    className="auth-input"
                    required
                  />
                  <input
                    name="gstin"
                    type="text"
                    placeholder="GSTIN Number (Optional)"
                    className="auth-input"
                  />
                  <input
                    name="payoutAccount"
                    type="text"
                    placeholder="Payout Account ID (Optional)"
                    className="auth-input"
                  />
                </>
              )}
            </div>

            <button
              className="btn-auth-submit"
              type="submit"
              disabled={loading}
            >
              {loading ? "Please wait..." : mode === "login" ? "Sign In" : "Sign Up"}
            </button>
          </form>

          <div style={{ display: "flex", justifyContent: "center", marginTop: "12px", marginBottom: "12px" }}>
            <GoogleLogin
              onSuccess={async (credentialResponse) => {
                if (credentialResponse.credential) {
                  setLoading(true);
                  setErrorMsg("");
                  try {
                    const payload = await api.googleLogin(credentialResponse.credential);
                    onAuth(payload);
                    onClose();
                  } catch (err: any) {
                    setErrorMsg(err.message || "Failed to authenticate with Google.");
                  } finally {
                    setLoading(false);
                  }
                }
              }}
              onError={() => {
                setErrorMsg("Google Sign-In failed.");
              }}
              theme="outline"
              shape="rectangular"
              text="signin_with"
              width="280"
            />
          </div>

          <button
            type="button"
            className="btn-switch-mode"
            onClick={() => setMode(mode === "login" ? "signup" : "login")}
          >
            {mode === "login" ? "New to MaithilCart? Create an account" : "Already have an account? Log in"}
          </button>

          {/* Quick logins for testing */}
          <div style={{ marginTop: "24px", paddingTop: "16px", borderTop: "1px solid var(--border-color)" }}>
            <p className="quick-logins-title" style={{ textAlign: "center", marginBottom: "8px" }}>
              Quick Demo Logins
            </p>
            <div className="quick-login-grid" style={{ gridTemplateColumns: "repeat(4, 1fr)" }}>
              <button onClick={() => handleQuickLogin("buyer")} disabled={loading}>
                Buyer
              </button>
              <button onClick={() => handleQuickLogin("seller")} disabled={loading}>
                Seller
              </button>
              <button onClick={() => handleQuickLogin("admin")} disabled={loading}>
                Admin
              </button>
              <button onClick={handleGoogleLogin} disabled={loading} style={{ background: "#4285f4", color: "white", fontSize: "10px", padding: "6px 2px" }}>
                Google (Mock)
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

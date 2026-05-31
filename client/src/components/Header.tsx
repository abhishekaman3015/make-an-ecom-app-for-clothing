import React, { useState, useRef, useEffect } from "react";
import { Search, ShoppingBag, User as UserIcon, LogOut, ShieldCheck, Store, Truck, Home } from "lucide-react";
import type { User, CartItem } from "../types";

type View = "shop" | "orders" | "seller" | "admin" | "bag" | "profile";

interface HeaderProps {
  session: { token: string; user: User } | null;
  view: View;
  setView: (view: View) => void;
  cart: CartItem[];
  query: string;
  setQuery: (query: string) => void;
  onLogout: () => void;
  onQuickLogin: (kind: "buyer" | "seller" | "admin") => Promise<void>;
  onTriggerAuth: () => void;
}

export function Header({
  session,
  view,
  setView,
  cart,
  query,
  setQuery,
  onLogout,
  onQuickLogin,
  onTriggerAuth,
}: HeaderProps) {
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  const role = session?.user.role;
  const subdomain = React.useMemo(() => {
    const host = window.location.hostname;
    if (host.startsWith("admin.")) return "ADMIN";
    if (host.startsWith("seller.")) return "SELLER";
    return "BUYER";
  }, []);
  const isBuyer = role === "BUYER" || !session; // allow guest/buyer
  const isSeller = role === "SELLER";
  const isAdmin = role === "ADMIN";

  const totalCartItems = cart.reduce((sum, item) => sum + item.quantity, 0);

  // Close dropdown on click outside
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setDropdownOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  return (
    <>
      <header className="topbar">
        {/* Brand Logo */}
        <div className="brand" onClick={() => setView("shop")}>
          <img src="/assets/maithilcart-logo.jpg" alt="Maithil Cart Logo" className="brand-logo-img" />
          <div className="brand-text">
            <h1>Maithil Cart</h1>
            <p>Fashion Hub</p>
          </div>
        </div>

        {/* Web Navigation Links */}
        <nav className="nav-links">
          {subdomain === "BUYER" && (
            <button className={view === "shop" ? "active" : ""} onClick={() => setView("shop")}>
              Shop
            </button>
          )}
          {session && (role === "BUYER") && subdomain === "BUYER" && (
            <button className={view === "orders" ? "active" : ""} onClick={() => setView("orders")}>
              Orders
            </button>
          )}
          {isSeller && subdomain === "SELLER" && (
            <button className={view === "seller" ? "active" : ""} onClick={() => setView("seller")}>
              Seller Studio
            </button>
          )}
          {isAdmin && subdomain === "ADMIN" && (
            <button className={view === "admin" ? "active" : ""} onClick={() => setView("admin")}>
              Admin Console
            </button>
          )}
        </nav>

        {/* Search Bar */}
        {subdomain === "BUYER" && (
          <div className="search-container">
            <div className="search-bar">
              <Search size={18} />
              <input
                type="text"
                placeholder="Search for brands, products, ethnic wear..."
                value={query}
                onChange={(e) => {
                  setQuery(e.target.value);
                  if (view !== "shop") setView("shop");
                }}
              />
            </div>
          </div>
        )}

        {/* User Actions */}
        <div className="user-actions">
          {/* Profile Dropdown */}
          <div className="profile-menu" ref={dropdownRef}>
            <button className="action-btn" onClick={() => setDropdownOpen(!dropdownOpen)}>
              <UserIcon size={20} />
              <span>Profile</span>
            </button>

            {dropdownOpen && (
              <div className="profile-dropdown">
                {session ? (
                  <>
                    <div className="dropdown-user-info">
                      <p className="name">{session.user.name}</p>
                      <p className="role">{session.user.role}</p>
                    </div>
                    {role === "BUYER" && (
                      <button className="action-btn logout-btn" style={{ background: '#f5f5f6', color: '#282c3f', marginBottom: '8px' }} onClick={() => { setView("profile"); setDropdownOpen(false); }}>
                        My Profile
                      </button>
                    )}
                    {isSeller && (
                      <button className="action-btn logout-btn" style={{ background: '#f5f5f6', color: '#282c3f', marginBottom: '8px' }} onClick={() => { setView("seller"); setDropdownOpen(false); }}>
                        Seller Studio
                      </button>
                    )}
                    {isAdmin && (
                      <button className="action-btn logout-btn" style={{ background: '#f5f5f6', color: '#282c3f', marginBottom: '8px' }} onClick={() => { setView("admin"); setDropdownOpen(false); }}>
                        Admin Console
                      </button>
                    )}
                    <button className="logout-btn" onClick={() => { onLogout(); setDropdownOpen(false); setView("shop"); }}>
                      <LogOut size={14} style={{ marginRight: '6px' }} /> Log Out
                    </button>
                  </>
                ) : (
                  <>
                    <div className="dropdown-user-info" style={{ borderBottom: 'none', paddingBottom: '0' }}>
                      <p className="name" style={{ fontSize: '14px', marginBottom: '4px' }}>Welcome</p>
                      <p className="role" style={{ color: '#9496a2', textTransform: 'none', fontSize: '12px' }}>To access account and orders</p>
                    </div>
                    <button className="logout-btn" onClick={() => { onTriggerAuth(); setDropdownOpen(false); }}>
                      Login / Signup
                    </button>
                     {import.meta.env.DEV && (window.location.hostname.includes("localhost") || window.location.hostname.includes("127.0.0.1") || window.location.hostname.includes(".local")) && (
                      <>
                        <p className="quick-logins-title">Quick Demo Login</p>
                        <div className="quick-login-grid">
                          {subdomain === "BUYER" && <button onClick={() => { onQuickLogin("buyer"); setDropdownOpen(false); }}>Buyer</button>}
                          {subdomain === "SELLER" && <button onClick={() => { onQuickLogin("seller"); setDropdownOpen(false); }}>Seller</button>}
                          {subdomain === "ADMIN" && <button onClick={() => { onQuickLogin("admin"); setDropdownOpen(false); }}>Admin</button>}
                        </div>
                      </>
                    )}
                  </>
                )}
              </div>
            )}
          </div>

          {/* Bag Icon */}
          {(role === "BUYER" || !session) && (
            <button className="action-btn" onClick={() => setView("bag")}>
              <ShoppingBag size={20} />
              {totalCartItems > 0 && <span className="badge">{totalCartItems}</span>}
              <span>Bag</span>
            </button>
          )}
        </div>
      </header>

      {/* Mobile Bottom Navigation Bar */}
      <nav className="mobile-bottom-nav">
        <button className={`mobile-nav-item ${view === "shop" ? "active" : ""}`} onClick={() => setView("shop")}>
          <Home size={22} />
          <span>Home</span>
        </button>
        
        {(role === "BUYER" || !session) && (
          <button className={`mobile-nav-item ${view === "bag" ? "active" : ""}`} onClick={() => setView("bag")}>
            <div style={{ position: "relative" }}>
              <ShoppingBag size={22} />
              {totalCartItems > 0 && <span className="badge" style={{ top: "-8px", right: "-8px" }}>{totalCartItems}</span>}
            </div>
            <span>Bag</span>
          </button>
        )}

        {session && (role === "BUYER") && (
          <button className={`mobile-nav-item ${view === "orders" ? "active" : ""}`} onClick={() => setView("orders")}>
            <Truck size={22} />
            <span>Orders</span>
          </button>
        )}

        {isSeller && (
          <button className={`mobile-nav-item ${view === "seller" ? "active" : ""}`} onClick={() => setView("seller")}>
            <Store size={22} />
            <span>Studio</span>
          </button>
        )}

        {isAdmin && (
          <button className={`mobile-nav-item ${view === "admin" ? "active" : ""}`} onClick={() => setView("admin")}>
            <ShieldCheck size={22} />
            <span>Admin</span>
          </button>
        )}

        <button className={`mobile-nav-item ${dropdownOpen ? "active" : ""}`} onClick={() => setDropdownOpen(true)}>
          <UserIcon size={22} />
          <span>Profile</span>
        </button>
      </nav>
    </>
  );
}

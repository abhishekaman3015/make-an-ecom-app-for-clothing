import { useEffect, useMemo, useState } from "react";
import { Check, ShoppingBag, Truck, Info, Filter, ArrowUp } from "lucide-react";
import { api, AuthPayload } from "./api";
import type { CartItem, Order, Payout, Product, Seller, User, Variant } from "./types";

// New components
import { Header } from "./components/Header";
import { BannerCarousel } from "./components/BannerCarousel";
import { AuthModal } from "./components/AuthModal";
import { ProductDetailModal } from "./components/ProductDetailModal";
import { BagCheckout } from "./components/BagCheckout";
import { SellerConsole } from "./components/SellerConsole";
import { AdminConsole } from "./components/AdminConsole";

const rupee = new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 0 });
const money = (cents: number) => rupee.format(cents / 100);

const stored = localStorage.getItem("maithilcart-session");
type Session = { token: string; user: User };
type View = "shop" | "orders" | "seller" | "admin" | "bag";

export function App() {
  const [session, setSession] = useState<Session | null>(stored ? JSON.parse(stored) : null);
  const [view, setView] = useState<View>("shop");
  const [products, setProducts] = useState<Product[]>([]);
  const [cart, setCart] = useState<CartItem[]>([]);
  const [orders, setOrders] = useState<Order[]>([]);
  const [seller, setSeller] = useState<Seller | null>(null);
  const [sellerProducts, setSellerProducts] = useState<Product[]>([]);
  const [payouts, setPayouts] = useState<Payout[]>([]);
  const [sellers, setSellers] = useState<Seller[]>([]);
  
  // Search & Filter state
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState("All");
  const [genderFilter, setGenderFilter] = useState("All");
  const [sortOrder, setSortOrder] = useState("recommended"); // recommended, priceLowHigh, priceHighLow

  // Modal / Interaction state
  const [notice, setNotice] = useState("");
  const [selectedProduct, setSelectedProduct] = useState<Product | null>(null);
  const [authOpen, setAuthOpen] = useState(false);
  const [authMode, setAuthMode] = useState<"login" | "signup">("login");

  const role = session?.user.role;
  const isBuyer = role === "BUYER" || !session;
  const isSeller = role === "SELLER";
  const isAdmin = role === "ADMIN";

  async function refresh() {
    try {
      const catalog = await api.products();
      setProducts(Array.isArray(catalog) ? catalog : []);
      
      if (!session) {
        setCart([]);
        setOrders([]);
        return;
      }
      
      if (role === "BUYER") {
        const [cartRows, orderRows] = await Promise.all([
          api.cart(session.token), 
          api.orders(session.token)
        ]);
        setCart(Array.isArray(cartRows) ? cartRows : []);
        setOrders(Array.isArray(orderRows) ? orderRows : []);
      }
      
      if (role === "SELLER") {
        const [profile, mine, sellerOrders, sellerPayouts] = await Promise.all([
          api.sellerMe(session.token),
          api.sellerProducts(session.token),
          api.orders(session.token),
          api.payouts(session.token)
        ]);
        setSeller(profile);
        setSellerProducts(Array.isArray(mine) ? mine : []);
        setOrders(Array.isArray(sellerOrders) ? sellerOrders : []);
        setPayouts(Array.isArray(sellerPayouts) ? sellerPayouts : []);
      }
      
      if (role === "ADMIN") {
        const [sellerRows, orderRows] = await Promise.all([
          api.adminSellers(session.token),
          api.adminOrders(session.token)
        ]);
        setSellers(Array.isArray(sellerRows) ? sellerRows : []);
        setOrders(Array.isArray(orderRows) ? orderRows : []);
      }
    } catch (error: any) {
      setNotice(error.message || "Failed to fetch data.");
    }
  }

  useEffect(() => {
    refresh();
  }, [session?.token]);

  function saveSession(payload: AuthPayload | null) {
    setSession(payload);
    if (payload) {
      localStorage.setItem("maithilcart-session", JSON.stringify(payload));
      setNotice(`Welcome back, ${payload.user.name}!`);
    } else {
      localStorage.removeItem("maithilcart-session");
      setNotice("Logged out successfully.");
    }
  }

  // Quick Login Utility
  const handleQuickLogin = async (kind: "buyer" | "seller" | "admin") => {
    const creds = {
      buyer: ["buyer@maithilcart.test", "shop1234"],
      seller: ["seller@maithilcart.test", "seller1234"],
      admin: ["admin@maithilcart.test", "admin1234"]
    }[kind];
    const payload = await api.login(creds[0], creds[1]);
    saveSession(payload);
    setView(kind === "seller" ? "seller" : kind === "admin" ? "admin" : "shop");
  };

  const safeProducts = Array.isArray(products) ? products : [];
  const categories = useMemo(() => {
    return ["All", ...Array.from(new Set(safeProducts.map((item) => item.category).filter(Boolean)))];
  }, [safeProducts]);

  // Filtering & Sorting logic
  const filteredProducts = useMemo(() => {
    let result = safeProducts.filter((item) => {
      const haystack = `${item.title} ${item.brand} ${item.category} ${item.gender}`.toLowerCase();
      const matchesSearch = haystack.includes(query.toLowerCase());
      const matchesCategory = category === "All" || item.category === category;
      const matchesGender = genderFilter === "All" || item.gender.toLowerCase() === genderFilter.toLowerCase();
      
      return matchesSearch && matchesCategory && matchesGender;
    });

    if (sortOrder === "priceLowHigh") {
      result.sort((a, b) => a.salePriceCents - b.salePriceCents);
    } else if (sortOrder === "priceHighLow") {
      result.sort((a, b) => b.salePriceCents - a.salePriceCents);
    }

    return result;
  }, [safeProducts, query, category, genderFilter, sortOrder]);

  const addToBag = async (variant: Variant) => {
    if (!session || role !== "BUYER") {
      setNotice("Please sign in as a buyer to add items to your bag.");
      setAuthMode("login");
      setAuthOpen(true);
      return;
    }
    try {
      await api.addCart(session.token, variant.id);
      setNotice("Added to bag!");
      await refresh();
    } catch (err: any) {
      setNotice(err.message || "Failed to add item to bag.");
    }
  };

  const removeItemFromBag = async (cartItemId: string) => {
    if (!session) return;
    try {
      await api.removeCart(session.token, cartItemId);
      setNotice("Removed item from bag.");
      await refresh();
    } catch (err: any) {
      setNotice(err.message || "Failed to remove item.");
    }
  };

  const handlePlaceOrder = async (payload: { shippingName: string; shippingPhone: string; shippingAddress: string; paymentMethod: string }) => {
    if (!session) return;
    try {
      const result = await api.checkout(session.token, payload);
      setNotice(`Order placed successfully! Reference: ${result.paymentReference}`);
      setView("orders");
      await refresh();
    } catch (err: any) {
      setNotice(err.message || "Checkout failed.");
    }
  };

  return (
    <main style={{ minHeight: "100vh", backgroundColor: "#f5f5f6", display: "flex", flexDirection: "column" }}>
      <Header
        session={session}
        view={view}
        setView={setView}
        cart={cart}
        query={query}
        setQuery={setQuery}
        onLogout={() => saveSession(null)}
        onQuickLogin={handleQuickLogin}
        onTriggerAuth={() => { setAuthMode("login"); setAuthOpen(true); }}
      />

      {/* Notifications */}
      {notice && (
        <button className="toast" onClick={() => setNotice("")}>
          <Check size={16} /> {notice}
        </button>
      )}

      {/* Auth Modal Container */}
      {authOpen && (
        <AuthModal
          initialMode={authMode}
          onClose={() => setAuthOpen(false)}
          onAuth={saveSession}
        />
      )}

      {/* Product Detail Modal */}
      {selectedProduct && (
        <ProductDetailModal
          product={selectedProduct}
          onClose={() => setSelectedProduct(null)}
          onAddToBag={(variant) => {
            addToBag(variant);
            setSelectedProduct(null);
          }}
        />
      )}

      {/* Views Router */}
      <div style={{ flexGrow: 1 }}>
        {view === "shop" && (
          <>
            {/* Banner Slider */}
            <BannerCarousel onCtaClick={(cat) => setCategory(cat)} />

            {/* Quick Category Chips Strip */}
            <div className="category-strip">
              {categories.map((c) => (
                <button
                  key={c}
                  className={`category-chip ${category === c ? "selected" : ""}`}
                  onClick={() => setCategory(c)}
                >
                  {c}
                </button>
              ))}
            </div>

            {/* Desktop and Mobile Shop Content */}
            <section className="market">
              {/* Sidebar Filters */}
              <aside className="sidebar">
                <div className="filter-section">
                  <h3 className="filter-title">Filters</h3>
                  <button 
                    onClick={() => { setCategory("All"); setGenderFilter("All"); setSortOrder("recommended"); }}
                    style={{ fontSize: "11px", fontWeight: 700, color: "var(--primary)", textAlign: "left" }}
                  >
                    Clear All
                  </button>
                </div>

                <hr style={{ border: "none", borderTop: "1px solid var(--border-color)" }} />

                <div className="filter-section">
                  <h4 className="filter-title">Gender</h4>
                  <div className="filter-group">
                    <label className="filter-label">
                      <input 
                        type="radio" 
                        name="gender" 
                        checked={genderFilter === "All"} 
                        onChange={() => setGenderFilter("All")}
                      />
                      <span>All Gender</span>
                    </label>
                    <label className="filter-label">
                      <input 
                        type="radio" 
                        name="gender" 
                        checked={genderFilter === "Men"} 
                        onChange={() => setGenderFilter("Men")}
                      />
                      <span>Men</span>
                    </label>
                    <label className="filter-label">
                      <input 
                        type="radio" 
                        name="gender" 
                        checked={genderFilter === "Women"} 
                        onChange={() => setGenderFilter("Women")}
                      />
                      <span>Women</span>
                    </label>
                    <label className="filter-label">
                      <input 
                        type="radio" 
                        name="gender" 
                        checked={genderFilter === "Kids"} 
                        onChange={() => setGenderFilter("Kids")}
                      />
                      <span>Kids</span>
                    </label>
                  </div>
                </div>

                <hr style={{ border: "none", borderTop: "1px solid var(--border-color)" }} />

                <div className="filter-section">
                  <h4 className="filter-title">Sort By</h4>
                  <div className="filter-group">
                    <label className="filter-label">
                      <input 
                        type="radio" 
                        name="sort" 
                        checked={sortOrder === "recommended"} 
                        onChange={() => setSortOrder("recommended")}
                      />
                      <span>Recommended</span>
                    </label>
                    <label className="filter-label">
                      <input 
                        type="radio" 
                        name="sort" 
                        checked={sortOrder === "priceLowHigh"} 
                        onChange={() => setSortOrder("priceLowHigh")}
                      />
                      <span>Price: Low to High</span>
                    </label>
                    <label className="filter-label">
                      <input 
                        type="radio" 
                        name="sort" 
                        checked={sortOrder === "priceHighLow"} 
                        onChange={() => setSortOrder("priceHighLow")}
                      />
                      <span>Price: High to Low</span>
                    </label>
                  </div>
                </div>
              </aside>

              {/* Product Catalog list */}
              <div className="catalog-container">
                <div className="catalog-header">
                  <h2>
                    {category === "All" ? "ALL DESIGNS" : category.toUpperCase()}
                  </h2>
                  <span>{filteredProducts.length} items found</span>
                </div>

                {filteredProducts.length === 0 ? (
                  <div style={{ textAlign: "center", padding: "60px 20px" }}>
                    <Info size={48} style={{ color: "var(--text-muted)", marginBottom: "12px" }} />
                    <p style={{ fontWeight: 600 }}>No products match your active search filters.</p>
                  </div>
                ) : (
                  <div className="product-grid">
                    {filteredProducts.map((p) => {
                      const discount = p.mrpCents > p.salePriceCents
                        ? Math.round(((p.mrpCents - p.salePriceCents) / p.mrpCents) * 100)
                        : 0;
                      return (
                        <article 
                          className="product-card" 
                          key={p.id}
                          onClick={() => setSelectedProduct(p)}
                        >
                          <div className="product-image-container">
                            <img src={p.imageUrl} alt={p.title} />
                            <span className="category-tag">{p.category}</span>
                          </div>
                          <div className="product-info">
                            <h4 className="product-brand">{p.brand}</h4>
                            <p className="product-title-text">{p.title}</p>
                            <div className="product-price-row">
                              <span className="sale-price">{money(p.salePriceCents)}</span>
                              {p.mrpCents > p.salePriceCents && (
                                <>
                                  <span className="mrp-price">{money(p.mrpCents)}</span>
                                  <span className="discount-percentage">({discount}% OFF)</span>
                                </>
                              )}
                            </div>
                            <p style={{ fontSize: "10px", color: "var(--text-muted)", marginTop: "2px" }}>
                              Seller: {p.storeName}
                            </p>
                          </div>
                        </article>
                      );
                    })}
                  </div>
                )}
              </div>
            </section>
          </>
        )}

        {view === "bag" && (
          <BagCheckout
            cart={cart}
            token={session?.token}
            refresh={refresh}
            onPlaceOrder={handlePlaceOrder}
            onRemoveItem={removeItemFromBag}
            setView={setView}
          />
        )}

        {view === "orders" && <OrdersList orders={orders} />}

        {view === "seller" && session && (
          <SellerConsole
            token={session.token}
            seller={seller}
            products={sellerProducts}
            payouts={payouts}
            orders={orders}
            refresh={refresh}
          />
        )}

        {view === "admin" && session && (
          <AdminConsole
            token={session.token}
            sellers={sellers}
            orders={orders}
            products={products}
            refresh={refresh}
          />
        )}
      </div>

      {/* Web Footer */}
      <footer style={{ background: "#fafbfc", borderTop: "1px solid var(--border-color)", padding: "40px 4% 100px", marginTop: "auto", fontSize: "13px", color: "var(--text-muted)" }}>
        <div style={{ display: "flex", flexWrap: "wrap", gap: "40px", justifyContent: "space-between" }}>
          <div>
            <h4 style={{ color: "var(--text-dark)", textTransform: "uppercase", marginBottom: "16px", fontWeight: 700 }}>Online Shopping</h4>
            <ul style={{ listStyle: "none", display: "flex", flexDirection: "column", gap: "8px" }}>
              <li>Men Shirts</li>
              <li>Women Ethnic Wear</li>
              <li>Kids Collection</li>
              <li>Trending Accessories</li>
            </ul>
          </div>
          <div>
            <h4 style={{ color: "var(--text-dark)", textTransform: "uppercase", marginBottom: "16px", fontWeight: 700 }}>Customer Policies</h4>
            <ul style={{ listStyle: "none", display: "flex", flexDirection: "column", gap: "8px" }}>
              <li>Contact Us</li>
              <li>FAQ</li>
              <li>T&C</li>
              <li>Terms of Use</li>
              <li>Returns & Exchange</li>
            </ul>
          </div>
          <div>
            <h4 style={{ color: "var(--text-dark)", textTransform: "uppercase", marginBottom: "16px", fontWeight: 700 }}>Experience MaithilCart App</h4>
            <p style={{ maxWidth: "240px", lineHeight: 1.5 }}>
              A premium, high-speed fashion marketplace designed for absolute convenience.
            </p>
          </div>
        </div>
        <hr style={{ border: "none", borderTop: "1px solid var(--border-color)", margin: "30px 0" }} />
        <p style={{ textAlign: "center" }}>© 2026 MaithilCart Marketplace. Built with React & Go.</p>
      </footer>
    </main>
  );
}

// Redesigned Orders List with Tracking Timeline
function OrdersList({ orders }: { orders: Order[] }) {
  const getTimelineClass = (currentStatus: string, step: string) => {
    const statuses = ["PLACED", "PAID", "PACKED", "SHIPPED", "DELIVERED"];
    const currentIndex = statuses.indexOf(currentStatus);
    const stepIndex = statuses.indexOf(step);

    if (currentStatus === "CANCELLED") {
      return "cancelled";
    }

    if (currentIndex >= stepIndex) {
      return currentIndex === stepIndex ? "active" : "completed";
    }
    return "";
  };

  return (
    <section className="orders-page">
      <h1>My Orders</h1>
      {orders.length === 0 ? (
        <div style={{ textAlign: "center", padding: "60px 20px", background: "white", border: "1px solid var(--border-color)", borderRadius: "4px" }}>
          <Truck size={48} style={{ color: "var(--text-muted)", marginBottom: "12px" }} />
          <p style={{ fontWeight: 600 }}>No orders placed yet.</p>
        </div>
      ) : (
        orders.map((order) => (
          <article className="order-timeline-card" key={order.id}>
            <div className="order-card-header">
              <div>
                <span className="order-id-label">ORDER #{order.id.slice(0, 8).toUpperCase()}</span>
                <span className="order-date-label" style={{ marginLeft: "12px" }}>
                  Ordered on {new Date(order.createdAt).toLocaleString()}
                </span>
              </div>
              <span className="sale-price" style={{ fontSize: "16px" }}>
                {money(order.totalCents)}
              </span>
            </div>

            {/* List of items in order */}
            <div className="order-items-list">
              {order.items.map((item) => (
                <div key={item.id} className="order-item-desc">
                  📦 <strong>{item.quantity}x {item.productTitle}</strong> · {item.color} / {item.size} 
                  <span style={{ color: "var(--text-muted)", fontSize: "12px", marginLeft: "10px" }}>
                    ({money(item.unitPriceCents)} each)
                  </span>
                </div>
              ))}
            </div>

            <div style={{ borderTop: "1px solid var(--border-color)", paddingTop: "14px", marginTop: "6px" }}>
              <p style={{ fontSize: "13px", marginBottom: "8px" }}>
                Shipping Address: <strong>{order.shippingName} ({order.shippingPhone})</strong> - {order.shippingAddress}
              </p>
            </div>

            {/* Tracking timeline */}
            {order.status === "CANCELLED" ? (
              <div className="warning" style={{ background: "#ffeef1", borderColor: "#ff3f6c", color: "#ff3f6c" }}>
                This order was cancelled.
              </div>
            ) : (
              <div className="order-status-timeline">
                <div className={`order-timeline-step ${getTimelineClass(order.status, "PLACED")}`}>
                  <div className="order-timeline-dot"></div>
                  <span>Placed</span>
                </div>
                <div className={`order-timeline-step ${getTimelineClass(order.status, "PAID")}`}>
                  <div className="order-timeline-dot"></div>
                  <span>Paid</span>
                </div>
                <div className={`order-timeline-step ${getTimelineClass(order.status, "PACKED")}`}>
                  <div className="order-timeline-dot"></div>
                  <span>Packed</span>
                </div>
                <div className={`order-timeline-step ${getTimelineClass(order.status, "SHIPPED")}`}>
                  <div className="order-timeline-dot"></div>
                  <span>Shipped</span>
                </div>
                <div className={`order-timeline-step ${getTimelineClass(order.status, "DELIVERED")}`}>
                  <div className="order-timeline-dot"></div>
                  <span>Delivered</span>
                </div>
              </div>
            )}
          </article>
        ))
      )}
    </section>
  );
}

import { useEffect, useMemo, useState } from "react";
import { Check, ShoppingBag, Truck, Info, Filter, ArrowUp, Heart } from "lucide-react";
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
import { UserProfile } from "./components/UserProfile";

const rupee = new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 0 });
const money = (cents: number) => rupee.format(cents / 100);

const stored = localStorage.getItem("maithilcart-session");
type Session = { token: string; user: User };
type View = "shop" | "orders" | "seller" | "admin" | "bag" | "profile" | "wishlist";

export function App() {
  const [session, setSession] = useState<Session | null>(stored ? JSON.parse(stored) : null);
  const [view, setView] = useState<View>("shop");
  const [products, setProducts] = useState<Product[]>([]);
  const [cart, setCart] = useState<CartItem[]>([]);
  const [wishlist, setWishlist] = useState<Product[]>([]);
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
  const [showSplash, setShowSplash] = useState(true);
  const [splashFade, setSplashFade] = useState(false);
  const [loading, setLoading] = useState(false);
  const safeProducts = Array.isArray(products) ? products : [];

  const subdomain = useMemo(() => {
    const host = window.location.hostname;
    if (host.startsWith("admin.")) return "ADMIN";
    if (host.startsWith("seller.")) return "SELLER";
    return "BUYER";
  }, []);

  useEffect(() => {
    if (subdomain === "ADMIN") {
      setView("admin");
      if (!session) {
        setAuthMode("login");
        setAuthOpen(true);
      } else if (session.user.role !== "ADMIN") {
        setNotice("Access Denied: Please log in with an Admin account.");
        setSession(null);
        localStorage.removeItem("maithilcart-session");
        setAuthMode("login");
        setAuthOpen(true);
      }
    } else if (subdomain === "SELLER") {
      setView("seller");
      if (!session) {
        setAuthMode("login");
        setAuthOpen(true);
      } else if (session.user.role !== "SELLER") {
        setNotice("Access Denied: Please log in with a Seller account.");
        setSession(null);
        localStorage.removeItem("maithilcart-session");
        setAuthMode("login");
        setAuthOpen(true);
      }
    } else {
      if (view === "admin" || view === "seller") {
        setView("shop");
      }
    }
  }, [subdomain, session?.user.role]);

  useEffect(() => {
    const fadeTimer = setTimeout(() => setSplashFade(true), 2000);
    const hideTimer = setTimeout(() => setShowSplash(false), 2600);
    return () => {
      clearTimeout(fadeTimer);
      clearTimeout(hideTimer);
    };
  }, []);

  const role = session?.user.role;
  const isBuyer = role === "BUYER" || !session;
  const isSeller = role === "SELLER";
  const isAdmin = role === "ADMIN";

  async function refresh() {
    setLoading(true);
    try {
      const catalog = await api.products();
      setProducts(Array.isArray(catalog) ? catalog : []);
      
      if (!session) {
        setCart([]);
        setOrders([]);
        const saved = localStorage.getItem("maithilcart-wishlist");
        setWishlist(saved ? JSON.parse(saved) : []);
        return;
      }
      
      if (role === "BUYER") {
        const [cartRows, orderRows, wishlistRows] = await Promise.all([
          api.cart(session.token), 
          api.orders(session.token),
          api.wishlist(session.token)
        ]);
        setCart(Array.isArray(cartRows) ? cartRows : []);
        setOrders(Array.isArray(orderRows) ? orderRows : []);
        setWishlist(Array.isArray(wishlistRows) ? wishlistRows : []);
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
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    refresh();
  }, [session?.token]);

  // Handle URL query parameter ?product=productId to auto-open product modal
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const prodId = params.get("product");
    if (prodId && safeProducts.length > 0) {
      const found = safeProducts.find((p) => p.id === prodId);
      if (found) {
        setSelectedProduct(found);
      }
    }
  }, [safeProducts]);

  const toggleWishlist = async (product: Product) => {
    const isWish = wishlist.some((item) => item.id === product.id);
    if (session) {
      try {
        if (isWish) {
          await api.removeWishlist(session.token, product.id);
          setWishlist((prev) => prev.filter((item) => item.id !== product.id));
          setNotice(`Removed "${product.title}" from Wishlist`);
        } else {
          await api.addWishlist(session.token, product.id);
          setWishlist((prev) => [...prev, product]);
          setNotice(`Added "${product.title}" to Wishlist`);
        }
      } catch (err: any) {
        setNotice(err.message || "Failed to update wishlist.");
      }
    } else {
      let updated: Product[];
      if (isWish) {
        updated = wishlist.filter((item) => item.id !== product.id);
        setNotice(`Removed "${product.title}" from Wishlist`);
      } else {
        updated = [...wishlist, product];
        setNotice(`Added "${product.title}" to Wishlist`);
      }
      setWishlist(updated);
      localStorage.setItem("maithilcart-wishlist", JSON.stringify(updated));
    }
  };

  async function saveSession(payload: AuthPayload | null) {
    setSession(payload);
    if (payload) {
      localStorage.setItem("maithilcart-session", JSON.stringify(payload));
      setNotice(`Welcome back, ${payload.user.name}!`);

      // Merge guest local wishlist into database on login
      if (payload.user.role === "BUYER") {
        const local = localStorage.getItem("maithilcart-wishlist");
        if (local) {
          try {
            const localItems: Product[] = JSON.parse(local);
            for (const item of localItems) {
              await api.addWishlist(payload.token, item.id).catch(() => {});
            }
            localStorage.removeItem("maithilcart-wishlist");
          } catch (e) {
            console.error("Failed to merge wishlist:", e);
          }
        }
      }
    } else {
      localStorage.removeItem("maithilcart-session");
      setNotice("Logged out successfully.");
    }
  }

  function updateSessionUser(updatedUser: User) {
    if (session) {
      const newSession = { ...session, user: updatedUser };
      setSession(newSession);
      localStorage.setItem("maithilcart-session", JSON.stringify(newSession));
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
      if (payload.paymentMethod === "online") {
        // Create the order in Razorpay & locally via Go backend
        const orderData = await api.createRazorpayOrder(session.token, {
          shippingName: payload.shippingName,
          shippingPhone: payload.shippingPhone,
          shippingAddress: payload.shippingAddress
        });

        // Open Razorpay Standard Checkout modal
        await new Promise<void>((resolve, reject) => {
          const options = {
            key: import.meta.env.VITE_RAZORPAY_KEY_ID || "rzp_test_SzLTiQitHnqIfY",
            amount: orderData.amount,
            currency: orderData.currency,
            name: "Maithil Cart",
            description: "Payment for Clothing Order",
            image: "/assets/maithilcart-logo.jpg",
            order_id: orderData.order_id,
            handler: async function (response: any) {
              try {
                // Verify signature on backend
                const verifyResult = await api.verifyRazorpayPayment(session.token, {
                  razorpay_payment_id: response.razorpay_payment_id,
                  razorpay_order_id: response.razorpay_order_id,
                  razorpay_signature: response.razorpay_signature,
                  local_order_id: orderData.local_order_id
                });

                if (verifyResult.ok) {
                  setNotice("Payment successful! Order completed.");
                  setView("orders");
                  await refresh();
                  resolve();
                } else {
                  setNotice("Payment verification failed.");
                  reject(new Error("Payment verification failed."));
                }
              } catch (err: any) {
                setNotice(err.message || "Payment verification failed.");
                reject(err);
              }
            },
            prefill: {
              name: payload.shippingName,
              contact: payload.shippingPhone,
              email: session.user.email
            },
            theme: {
              color: "#03a685"
            },
            modal: {
              ondismiss: function () {
                setNotice("Payment cancelled by user.");
                reject(new Error("Payment cancelled by user."));
              }
            }
          };

          const rzp = new (window as any).Razorpay(options);
          rzp.open();
        });
      } else {
        // Fallback for Cash on Delivery (COD) / mock checkout
        const result = await api.checkout(session.token, payload);
        setNotice(`Order placed successfully! Reference: ${result.paymentReference}`);
        setView("orders");
        await refresh();
      }
    } catch (err: any) {
      setNotice(err.message || "Checkout failed.");
      throw err;
    }
  };

  return (
    <main style={{ minHeight: "100vh", backgroundColor: "#f5f5f6", display: "flex", flexDirection: "column" }}>
      {showSplash && (
        <div className={`splash-container ${splashFade ? "fade-out" : ""}`}>
          <div className="splash-logo-wrapper">
            <img src="/assets/maithilcart-logo.jpg" alt="Maithil Cart Logo" className="splash-logo-img" />
          </div>
          <h1 className="splash-title">Maithil Cart</h1>
          <span className="splash-subtitle">Premium Fashion Hub</span>
        </div>
      )}
      <Header
        session={session}
        view={view}
        setView={setView}
        cart={cart}
        wishlist={wishlist}
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
          isWishlisted={wishlist.some((item) => item.id === selectedProduct.id)}
          onToggleWishlist={() => toggleWishlist(selectedProduct)}
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

                {loading ? (
                  <div className="product-grid">
                    {Array.from({ length: 8 }).map((_, idx) => (
                      <div className="shimmer-card" key={idx}>
                        <div className="shimmer-img shimmer-element"></div>
                        <div className="shimmer-info">
                          <div className="shimmer-line brand shimmer-element"></div>
                          <div className="shimmer-line title shimmer-element"></div>
                          <div className="shimmer-line price shimmer-element"></div>
                        </div>
                      </div>
                    ))}
                  </div>
                ) : filteredProducts.length === 0 ? (
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
                      const isWish = wishlist.some((item) => item.id === p.id);
                      return (
                        <article 
                          className="product-card" 
                          key={p.id}
                          onClick={() => setSelectedProduct(p)}
                          style={{ position: "relative" }}
                        >
                          {/* Wishlist Heart on Card */}
                          <button
                            onClick={(e) => { e.stopPropagation(); toggleWishlist(p); }}
                            style={{
                              position: "absolute",
                              top: "12px",
                              right: "12px",
                              zIndex: 10,
                              background: "rgba(255, 255, 255, 0.9)",
                              border: "1px solid var(--border-color)",
                              borderRadius: "50%",
                              width: "36px",
                              height: "36px",
                              display: "flex",
                              alignItems: "center",
                              justifyContent: "center",
                              boxShadow: "var(--shadow-sm)",
                              color: isWish ? "var(--primary)" : "var(--text-dark)",
                              transition: "all var(--transition-fast)"
                            }}
                          >
                            <Heart size={18} style={{ fill: isWish ? "var(--primary)" : "none", color: isWish ? "var(--primary)" : "inherit" }} />
                          </button>
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

        {view === "profile" && session && (
          <UserProfile
            token={session.token}
            user={session.user}
            onUpdateSession={updateSessionUser}
          />
        )}

        {view === "wishlist" && (
          <section className="orders-page" style={{ padding: "30px 4% 80px" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", borderBottom: "1px solid var(--border-color)", paddingBottom: "16px", marginBottom: "24px" }}>
              <h1 style={{ fontFamily: "var(--font-title)", fontSize: "22px", fontWeight: 800 }}>My Wishlist</h1>
              <span style={{ fontSize: "14px", color: "var(--text-muted)", fontWeight: 600 }}>{wishlist.length} items</span>
            </div>
            {wishlist.length === 0 ? (
              <div style={{ textAlign: "center", padding: "80px 20px", background: "white", border: "1px solid var(--border-color)", borderRadius: "var(--border-radius-sm)" }}>
                <div style={{ fontSize: "48px", marginBottom: "16px" }}>❤️</div>
                <h3 style={{ fontSize: "18px", fontWeight: 700, marginBottom: "8px", color: "var(--text-dark)" }}>Your wishlist is empty!</h3>
                <p style={{ color: "var(--text-muted)", fontSize: "14px", marginBottom: "24px" }}>Explore our designs and add your favorites to your wishlist.</p>
                <button 
                  onClick={() => setView("shop")}
                  style={{
                    background: "var(--primary)",
                    color: "white",
                    padding: "12px 28px",
                    fontFamily: "var(--font-title)",
                    fontWeight: 700,
                    fontSize: "14px",
                    borderRadius: "var(--border-radius-sm)",
                    textTransform: "uppercase"
                  }}
                >
                  Shop Now
                </button>
              </div>
            ) : (
              <div className="product-grid">
                {wishlist.map((p) => {
                  const discount = p.mrpCents > p.salePriceCents
                    ? Math.round(((p.mrpCents - p.salePriceCents) / p.mrpCents) * 100)
                    : 0;
                  return (
                    <article 
                      className="product-card" 
                      key={p.id}
                      onClick={() => setSelectedProduct(p)}
                      style={{ position: "relative" }}
                    >
                      {/* Heart Toggle on Card */}
                      <button
                        onClick={(e) => { e.stopPropagation(); toggleWishlist(p); }}
                        style={{
                          position: "absolute",
                          top: "12px",
                          right: "12px",
                          zIndex: 10,
                          background: "white",
                          border: "1px solid var(--border-color)",
                          borderRadius: "50%",
                          width: "36px",
                          height: "36px",
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "center",
                          boxShadow: "var(--shadow-sm)",
                          color: "var(--primary)"
                        }}
                      >
                        <Heart size={18} style={{ fill: "var(--primary)" }} />
                      </button>
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
          </section>
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
            <h4 style={{ color: "var(--text-dark)", textTransform: "uppercase", marginBottom: "16px", fontWeight: 700 }}>Experience Maithil Cart App</h4>
            <p style={{ maxWidth: "240px", lineHeight: 1.5 }}>
              A premium, high-speed fashion marketplace designed for absolute convenience.
            </p>
          </div>
        </div>
        <hr style={{ border: "none", borderTop: "1px solid var(--border-color)", margin: "30px 0" }} />
        <p style={{ textAlign: "center" }}>© 2026 Maithil Cart Marketplace. Built with React & Go.</p>
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

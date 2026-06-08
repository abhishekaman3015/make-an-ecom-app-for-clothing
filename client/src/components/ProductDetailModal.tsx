import React, { useState } from "react";
import { X, ShoppingBag, Heart, MessageCircle, Twitter, Facebook, Copy } from "lucide-react";
import type { Product, Variant } from "../types";

const rupee = new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 0 });
const money = (cents: number) => rupee.format(cents / 100);

interface ProductDetailModalProps {
  product: Product;
  onClose: () => void;
  onAddToBag: (variant: Variant) => void;
  isWishlisted: boolean;
  onToggleWishlist: () => void;
}

export function ProductDetailModal({ product, onClose, onAddToBag, isWishlisted, onToggleWishlist }: ProductDetailModalProps) {
  const [selectedVariantId, setSelectedVariantId] = useState<string>("");
  const [copied, setCopied] = useState(false);

  const selectedVariant = product.variants.find((v) => v.id === selectedVariantId);
  const discountPercent = product.mrpCents > product.salePriceCents
    ? Math.round(((product.mrpCents - product.salePriceCents) / product.mrpCents) * 100)
    : 0;

  const handleAddClick = () => {
    if (!selectedVariant) return;
    onAddToBag(selectedVariant);
  };

  const handleCopyLink = () => {
    const shareUrl = `${window.location.origin}/?product=${product.id}`;
    navigator.clipboard.writeText(shareUrl).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  };

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal-window detail-grid" onClick={(e) => e.stopPropagation()}>
        <button className="modal-close" onClick={onClose} aria-label="Close details">
          <X size={18} />
        </button>

        {/* Left Side: Large Product Image */}
        <div className="detail-gallery">
          <img src={product.imageUrl} alt={product.title} />
        </div>

        {/* Right Side: Product Details */}
        <div className="detail-info">
          <div>
            <h3 className="detail-brand">{product.brand}</h3>
            <p className="detail-title">{product.title}</p>
            
            {/* Mock ratings like Myntra */}
            <div style={{ display: "inline-flex", alignItems: "center", gap: "6px", background: "#f5f5f6", padding: "4px 8px", borderRadius: "4px", fontSize: "12px", fontWeight: 700, marginTop: "8px" }}>
              <span>4.3 ★</span>
              <span style={{ color: "#9496a2" }}>|</span>
              <span style={{ color: "#535766" }}>1.2K Ratings</span>
            </div>
          </div>

          <div style={{ borderBottom: "1px solid var(--border-color)", paddingBottom: "16px" }}>
            <div className="detail-price-box">
              <span className="detail-sale">{money(product.salePriceCents)}</span>
              {product.mrpCents > product.salePriceCents && (
                <>
                  <span className="detail-mrp">{money(product.mrpCents)}</span>
                  <span className="detail-discount">({discountPercent}% OFF)</span>
                </>
              )}
            </div>
            <p className="tax-info">inclusive of all taxes</p>
          </div>

          {/* Size Selector */}
          <div className="size-section">
            <div className="size-header">
              <span>SELECT SIZE</span>
              <span style={{ color: "var(--primary)" }}>SIZE CHART</span>
            </div>

            <div className="size-grid">
              {product.variants.map((v) => {
                const isOutOfStock = v.stock <= 0;
                return (
                  <button
                    key={v.id}
                    className={`size-btn ${selectedVariantId === v.id ? "selected" : ""}`}
                    disabled={isOutOfStock}
                    onClick={() => setSelectedVariantId(v.id)}
                  >
                    {v.size}
                  </button>
                );
              })}
            </div>

            {selectedVariant && (
              <p style={{ fontSize: "12px", color: selectedVariant.stock < 5 ? "#ff905a" : "#03a685", fontWeight: 600 }}>
                {selectedVariant.stock < 5 
                  ? `Only ${selectedVariant.stock} left in stock - buy soon!` 
                  : `In Stock (${selectedVariant.stock} available)`}
              </p>
            )}
          </div>

          {/* Add to Bag and Wishlist Buttons */}
          <div className="buy-actions" style={{ display: "flex", gap: "12px", alignItems: "center", marginBottom: "16px" }}>
            <button
              className="btn-add-bag"
              disabled={!selectedVariantId || (selectedVariant && selectedVariant.stock <= 0)}
              onClick={handleAddClick}
              style={{ flex: 1 }}
            >
              <ShoppingBag size={18} />
              {!selectedVariantId 
                ? "Select Size to Add" 
                : selectedVariant && selectedVariant.stock <= 0 
                  ? "Out of Stock" 
                  : "Add to Bag"}
            </button>
            <button
              className={`btn-wishlist-toggle ${isWishlisted ? "active" : ""}`}
              onClick={onToggleWishlist}
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                gap: "8px",
                border: "1px solid var(--border-color)",
                borderRadius: "var(--border-radius-sm)",
                padding: "16px",
                fontWeight: 700,
                fontSize: "14px",
                color: isWishlisted ? "white" : "var(--text-dark)",
                backgroundColor: isWishlisted ? "var(--primary)" : "white",
                borderColor: isWishlisted ? "var(--primary)" : "var(--border-color)",
                transition: "all var(--transition-fast)",
                minWidth: "140px",
                height: "50px"
              }}
            >
              <Heart size={18} style={{ fill: isWishlisted ? "white" : "none" }} />
              {isWishlisted ? "Wishlisted" : "Wishlist"}
            </button>
          </div>

          {/* Share Section */}
          <div className="share-section" style={{ marginBottom: "20px", paddingBottom: "16px", borderBottom: "1px solid var(--border-color)" }}>
            <h4 style={{ fontSize: "11px", fontWeight: 700, color: "var(--text-muted)", letterSpacing: "1px", textTransform: "uppercase", marginBottom: "10px" }}>Share this product</h4>
            <div className="share-buttons" style={{ display: "flex", gap: "8px", flexWrap: "wrap" }}>
              <a 
                href={`https://api.whatsapp.com/send?text=Check%20out%20this%20awesome%20product%20on%20Maithil%20Cart!%20${encodeURIComponent(window.location.origin + "/?product=" + product.id)}`}
                target="_blank" 
                rel="noopener noreferrer"
                className="share-btn whatsapp"
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  gap: "6px",
                  padding: "8px 12px",
                  borderRadius: "4px",
                  fontSize: "12px",
                  fontWeight: 600,
                  color: "white",
                  backgroundColor: "#25D366",
                  textDecoration: "none"
                }}
              >
                <MessageCircle size={14} /> WhatsApp
              </a>
              <a 
                href={`https://twitter.com/intent/tweet?text=Check%20out%20this%20awesome%20product%20on%20Maithil%20Cart!%20&url=${encodeURIComponent(window.location.origin + "/?product=" + product.id)}`}
                target="_blank" 
                rel="noopener noreferrer"
                className="share-btn twitter"
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  gap: "6px",
                  padding: "8px 12px",
                  borderRadius: "4px",
                  fontSize: "12px",
                  fontWeight: 600,
                  color: "white",
                  backgroundColor: "#000000",
                  textDecoration: "none"
                }}
              >
                <Twitter size={14} /> Twitter
              </a>
              <a 
                href={`https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(window.location.origin + "/?product=" + product.id)}`}
                target="_blank" 
                rel="noopener noreferrer"
                className="share-btn facebook"
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  gap: "6px",
                  padding: "8px 12px",
                  borderRadius: "4px",
                  fontSize: "12px",
                  fontWeight: 600,
                  color: "white",
                  backgroundColor: "#1877F2",
                  textDecoration: "none"
                }}
              >
                <Facebook size={14} /> Facebook
              </a>
              <button 
                onClick={handleCopyLink}
                className="share-btn copy-link"
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  gap: "6px",
                  padding: "8px 12px",
                  borderRadius: "4px",
                  fontSize: "12px",
                  fontWeight: 600,
                  color: "var(--text-dark)",
                  backgroundColor: "var(--bg-light)",
                  border: "1px solid var(--border-color)"
                }}
              >
                <Copy size={14} /> {copied ? "Copied!" : "Copy Link"}
              </button>
            </div>
          </div>

          {/* Description Section */}
          <div className="detail-desc">
            <h4>Product Details</h4>
            <p>{product.description}</p>
            <p style={{ fontSize: "12px", color: "var(--text-muted)", marginTop: "4px" }}>
              Seller: <strong style={{ color: "var(--text-dark)" }}>{product.storeName}</strong>
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}

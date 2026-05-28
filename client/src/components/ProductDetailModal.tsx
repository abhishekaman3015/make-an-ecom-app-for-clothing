import React, { useState } from "react";
import { X, ShoppingBag } from "lucide-react";
import type { Product, Variant } from "../types";

const rupee = new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 0 });
const money = (cents: number) => rupee.format(cents / 100);

interface ProductDetailModalProps {
  product: Product;
  onClose: () => void;
  onAddToBag: (variant: Variant) => void;
}

export function ProductDetailModal({ product, onClose, onAddToBag }: ProductDetailModalProps) {
  const [selectedVariantId, setSelectedVariantId] = useState<string>("");

  const selectedVariant = product.variants.find((v) => v.id === selectedVariantId);
  const discountPercent = product.mrpCents > product.salePriceCents
    ? Math.round(((product.mrpCents - product.salePriceCents) / product.mrpCents) * 100)
    : 0;

  const handleAddClick = () => {
    if (!selectedVariant) return;
    onAddToBag(selectedVariant);
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

          {/* Add to Bag Button */}
          <div className="buy-actions">
            <button
              className="btn-add-bag"
              disabled={!selectedVariantId || (selectedVariant && selectedVariant.stock <= 0)}
              onClick={handleAddClick}
            >
              <ShoppingBag size={18} />
              {!selectedVariantId 
                ? "Select Size to Add" 
                : selectedVariant && selectedVariant.stock <= 0 
                  ? "Out of Stock" 
                  : "Add to Bag"}
            </button>
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

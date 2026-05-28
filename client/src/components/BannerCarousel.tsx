import { useEffect, useState } from "react";

interface Banner {
  id: number;
  title: string;
  tag: string;
  desc: string;
  gradient: string;
  cta: string;
}

const BANNERS: Banner[] = [
  {
    id: 1,
    tag: "ELEVATE YOUR STYLE",
    title: "UP TO 60% OFF",
    desc: "Explore premium shirts, everyday tees, and street jackets",
    gradient: "linear-gradient(135deg, #ff3f6c 0%, #ff708a 100%)",
    cta: "Shop Topwear"
  },
  {
    id: 2,
    tag: "ETHNIC FUSION COLLECTION",
    title: "FLAT 50% OFF",
    desc: "Discover beautiful handpicked kurtas, ethnic sets & fusion wear",
    gradient: "linear-gradient(135deg, #7b4397 0%, #dc2430 100%)",
    cta: "Shop Ethnic Wear"
  },
  {
    id: 3,
    tag: "FOOTWEAR SPECIALS",
    title: "UNDER ₹1,499",
    desc: "Upgrade your stride with trending sneakers, sports shoes & slides",
    gradient: "linear-gradient(135deg, #11998e 0%, #38ef7d 100%)",
    cta: "Shop Footwear"
  }
];

export function BannerCarousel({ onCtaClick }: { onCtaClick: (category: string) => void }) {
  const [current, setCurrent] = useState(0);

  useEffect(() => {
    const timer = setInterval(() => {
      setCurrent((prev) => (prev + 1) % BANNERS.length);
    }, 5000);
    return () => clearInterval(timer);
  }, []);

  const handleCta = (id: number) => {
    if (id === 1) onCtaClick("Men Topwear");
    else if (id === 2) onCtaClick("Ethnic Wear");
    else if (id === 3) onCtaClick("Footwear");
    else onCtaClick("All");
  };

  return (
    <section className="carousel-container">
      <div 
        className="carousel-track" 
        style={{ transform: `translateX(-${current * 100}%)` }}
      >
        {BANNERS.map((banner) => (
          <div 
            key={banner.id} 
            className="carousel-slide" 
            style={{ background: banner.gradient }}
          >
            <div className="carousel-overlay">
              <span>{banner.tag}</span>
              <h2>{banner.title}</h2>
              <p>{banner.desc}</p>
              <button 
                className="carousel-btn" 
                onClick={() => handleCta(banner.id)}
              >
                {banner.cta}
              </button>
            </div>
          </div>
        ))}
      </div>
      <div className="carousel-dots">
        {BANNERS.map((_, index) => (
          <button
            key={index}
            className={`carousel-dot ${index === current ? "active" : ""}`}
            onClick={() => setCurrent(index)}
            aria-label={`Go to slide ${index + 1}`}
          />
        ))}
      </div>
    </section>
  );
}

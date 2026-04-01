import { useState, useEffect, useContext, useRef, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import useHttp from '../hooks/useHttp';
import { API_URL, API_ENDPOINTS } from '../config/api';
import { currencyFormatter } from '../util/formatting';
import AuthContext from './store/AuthContext';
import UserProgressContext from './store/UserProgressContext';
import CartContext from './store/CartContext';
import './LandingPage.css';
import useThrottle from '../hooks/useThrottle';

const requestConfig = {};

/* ── tiny helpers ── */
function useOnScreen(ref, threshold = 0.15) {
  const [visible, setVisible] = useState(false);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const obs = new IntersectionObserver(
      ([entry]) => { if (entry.isIntersecting) { setVisible(true); obs.disconnect(); } },
      { threshold }
    );
    obs.observe(el);
    return () => obs.disconnect();
  }, [ref, threshold]);
  return visible;
}

function AnimatedSection({ className = '', children, delay = 0 }) {
  const ref = useRef(null);
  const visible = useOnScreen(ref);
  return (
    <section
      ref={ref}
      className={`land-animate ${visible ? 'land-visible' : ''} ${className}`}
      style={{ transitionDelay: `${delay}ms` }}
    >
      {children}
    </section>
  );
}

/* ================================================================
   LANDING PAGE
   ================================================================ */
export default function LandingPage() {
  const navigate = useNavigate();
  const authCtx = useContext(AuthContext);
  const userProgressCtx = useContext(UserProgressContext);
  const cartCtx = useContext(CartContext);
  const { data: meals } = useHttp(API_ENDPOINTS.MEALS, requestConfig, []);

  // pick 6 featured meals (prefer chef-special first)
  const featured = meals
    .slice()
    .sort((a, b) => (b.isChefSpecial ? 1 : 0) - (a.isChefSpecial ? 1 : 0))
    .slice(0, 6);

  // categories we can surface
  const categories = [
    { icon: '🍕', label: 'Pizza & Italian', filter: 'entrees' },
    { icon: '🍛', label: 'Indian Curries', filter: 'entrees' },
    { icon: '🍣', label: 'Sushi & Asian', filter: 'entrees' },
    { icon: '🥗', label: 'Salads & Bowls', filter: 'sides' },
    { icon: '🍰', label: 'Desserts', filter: 'desserts' },
    { icon: '🍔', label: 'Burgers', filter: 'entrees' },
  ];

  const stats = [
    { value: '75+', label: 'Menu Items' },
    { value: '30 min', label: 'Avg. Delivery' },
    { value: '4.9★', label: 'Customer Rating' },
    { value: '10K+', label: 'Orders Delivered' },
  ];

  const steps = [
    {
      num: '01',
      icon: (
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
      ),
      title: 'Browse Menu',
      desc: 'Explore our curated menu with powerful filters, search, and dietary tags.',
    },
    {
      num: '02',
      icon: (
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><path d="M6 2L3 6v14a2 2 0 002 2h14a2 2 0 002-2V6l-3-4z"/><line x1="3" y1="6" x2="21" y2="6"/><path d="M16 10a4 4 0 01-8 0"/></svg>
      ),
      title: 'Add to Cart',
      desc: 'Pick your favorites, customize quantities, and build your perfect order.',
    },
    {
      num: '03',
      icon: (
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/><polyline points="9 12 11 14 15 10"/></svg>
      ),
      title: 'Fast Delivery',
      desc: 'Secure checkout & lightning-fast delivery right to your doorstep.',
    },
  ];

  const testimonials = [
    {
      name: 'Priya S.',
      text: 'The Butter Chicken was unreal — restaurant quality at home! Delivery in under 25 minutes.',
      rating: 5,
    },
    {
      name: 'Arjun M.',
      text: 'Love the filter system — I found vegan options instantly. The Thai Green Curry is a must-try!',
      rating: 5,
    },
    {
      name: 'Sneha R.',
      text: 'Best food ordering experience. The OTP login is so smooth, and favorites make reordering a breeze.',
      rating: 4,
    },
    {
      name: 'Rahul K.',
      text: 'Ordered for a house party — 15 dishes and everything arrived hot and perfect. Incredible quality!',
      rating: 5,
    },
    {
      name: 'Divya N.',
      text: 'The Hyderabadi Biryani here is the real deal. Flavors that remind me of home. 10/10 recommend!',
      rating: 5,
    },
    {
      name: 'Karthik V.',
      text: 'Super easy checkout with promo codes and multiple payment options. Will order again for sure!',
      rating: 4,
    },
  ];

  const whyChooseUs = [
    { icon: '🛡️', title: 'Hygiene Certified', desc: 'FSSAI certified kitchen with regular audits and sanitization' },
    { icon: '🚀', title: 'Super Fast Delivery', desc: 'Average delivery in 30 mins across Hyderabad' },
    { icon: '💰', title: 'Best Prices', desc: 'Daily deals, promo codes, and exclusive discounts' },
    { icon: '📱', title: 'Easy Ordering', desc: 'Simple, intuitive interface with saved addresses and favorites' },
    { icon: '🔒', title: 'Secure Payments', desc: 'Razorpay, PhonePe, Cashfree — all PCI-DSS compliant' },
    { icon: '💬', title: '24/7 Support', desc: 'Dedicated customer support via phone and email' },
  ];

  function handleOrderNow() {
    if (!authCtx.isLoggedIn) {
      userProgressCtx.showAuth('login');
      return;
    }
    navigate('/menu');
  }

  /* ── parallax on hero ── */
  const [scrollY, setScrollY] = useState(0);
  const scrollCb = useCallback(() => setScrollY(window.scrollY), []);
  const throttledScroll = useThrottle(scrollCb, 50);
  useEffect(() => {
    window.addEventListener('scroll', throttledScroll, { passive: true });
    return () => window.removeEventListener('scroll', throttledScroll);
  }, [throttledScroll]);

  return (
    <div className="landing">
      {/* ═══════════ HERO ═══════════ */}
      <section className="hero">
        <div className="hero-bg" style={{ transform: `translateY(${scrollY * 0.35}px)` }}>
          {/* 4 floating food images for decoration */}
          {featured.slice(0, 4).map((m, i) => (
            <img
              key={m.id}
              src={`${API_URL}/${m.image}`}
              alt=""
              className={`hero-float hero-float-${i + 1}`}
              loading="eager"
            />
          ))}
        </div>

        <div className="hero-overlay" />

        <div className="hero-content">
          <span className="hero-badge">🔥 #1 Food Delivery in Town</span>
          <h1 className="hero-title">
            Extraordinary Flavors,<br />
            <span className="hero-highlight">Delivered to You</span>
          </h1>
          <p className="hero-sub">
            From sizzling biryanis to decadent desserts — freshly prepared by master chefs
            and delivered to your doorstep in minutes.
          </p>
          <div className="hero-actions">
            <button className="hero-btn hero-btn-primary" onClick={() => navigate('/menu')}>
              Explore Menu
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><line x1="5" y1="12" x2="19" y2="12"/><polyline points="12 5 19 12 12 19"/></svg>
            </button>
            <button className="hero-btn hero-btn-ghost" onClick={handleOrderNow}>
              Order Now
            </button>
          </div>

          {/* stats strip */}
          <div className="hero-stats">
            {stats.map((s) => (
              <div key={s.label} className="hero-stat">
                <span className="hero-stat-value">{s.value}</span>
                <span className="hero-stat-label">{s.label}</span>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ═══════════ PROMO BANNER ═══════════ */}
      <div className="land-promo-banner">
        <div className="promo-confetti">🎉</div>
        <div className="promo-content">
          <span className="promo-tag">NEW USER OFFER</span>
          <h3>Get <span className="promo-highlight">60% OFF</span> on your first order!</h3>
          <p>Up to ₹250 discount. Use code <strong className="promo-code-text">WELCOME60</strong> at checkout.</p>
          <button className="hero-btn hero-btn-primary promo-cta" onClick={() => navigate('/menu')}>
            Order Now
          </button>
        </div>
        <div className="promo-confetti">🎊</div>
      </div>

      {/* ═══════════ CATEGORY PILLS ═══════════ */}
      <AnimatedSection className="land-categories">
        <h2 className="land-section-title">What Are You Craving?</h2>
        <p className="land-section-sub">Pick a cuisine and dive right in</p>
        <div className="category-pills">
          {categories.map((c) => (
            <button
              key={c.label}
              className="cat-pill"
              onClick={() => navigate('/menu')}
            >
              <span className="cat-icon">{c.icon}</span>
              <span className="cat-label">{c.label}</span>
            </button>
          ))}
        </div>
      </AnimatedSection>

      {/* ═══════════ HOW IT WORKS ═══════════ */}
      <AnimatedSection className="land-how">
        <h2 className="land-section-title">How It Works</h2>
        <p className="land-section-sub">Three simple steps to deliciousness</p>
        <div className="how-steps">
          {steps.map((s, i) => (
            <div key={s.num} className="how-card" style={{ transitionDelay: `${i * 150}ms` }}>
              <div className="how-icon">{s.icon}</div>
              <span className="how-num">{s.num}</span>
              <h3>{s.title}</h3>
              <p>{s.desc}</p>
            </div>
          ))}
        </div>
      </AnimatedSection>

      {/* ═══════════ FEATURED DISHES ═══════════ */}
      <AnimatedSection className="land-featured">
        <h2 className="land-section-title">Chef&apos;s Picks</h2>
        <p className="land-section-sub">Hand-selected dishes our customers can&apos;t stop ordering</p>
        <div className="featured-grid">
          {featured.map((meal) => (
            <div
              key={meal.id}
              className="feat-card"
              onClick={() => navigate(`/meal/${meal.id}`, { state: { meal } })}
            >
              <div className="feat-img-wrap">
                <img src={`${API_URL}/${meal.image}`} alt={meal.name} loading="lazy" />
                {meal.isChefSpecial && <span className="feat-badge">Chef&apos;s Special</span>}
              </div>
              <div className="feat-info">
                <h3>{meal.name}</h3>
                <p className="feat-desc">{meal.description.slice(0, 70)}...</p>
                <div className="feat-bottom">
                  <span className="feat-price">{currencyFormatter.format(meal.price)}</span>
                  <button
                    className="feat-add"
                    onClick={(e) => {
                      e.stopPropagation();
                      if (!authCtx.isLoggedIn) { userProgressCtx.showAuth('login'); return; }
                      cartCtx.addItem(meal);
                    }}
                  >
                    + Add
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
        <div className="feat-more">
          <button className="hero-btn hero-btn-primary" onClick={() => navigate('/menu')}>
            View Full Menu
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><line x1="5" y1="12" x2="19" y2="12"/><polyline points="12 5 19 12 12 19"/></svg>
          </button>
        </div>
      </AnimatedSection>

      {/* ═══════════ ABOUT / STORY ═══════════ */}
      <AnimatedSection className="land-about">
        <div className="about-grid">
          <div className="about-images">
            {featured.slice(0, 3).map((m, i) => (
              <img
                key={m.id}
                src={`${API_URL}/${m.image}`}
                alt={m.name}
                className={`about-img about-img-${i + 1}`}
                loading="lazy"
              />
            ))}
          </div>
          <div className="about-text">
            <span className="about-label">Our Story</span>
            <h2>Where Passion Meets the Plate</h2>
            <p>
              At <strong>The Flavor Alchemist</strong>, we believe every meal is an experience.
              Our team of master chefs sources the freshest local ingredients and transforms
              them into dishes that surprise, delight, and satisfy.
            </p>
            <p>
              From classic Indian favorites to bold global flavors — every recipe is crafted
              with care and delivered to you with love.
            </p>
            <div className="about-highlights">
              <div className="about-hl">
                <span className="about-hl-icon">🌿</span>
                <div>
                  <strong>Farm-Fresh</strong>
                  <span>Locally sourced ingredients</span>
                </div>
              </div>
              <div className="about-hl">
                <span className="about-hl-icon">👨‍🍳</span>
                <div>
                  <strong>Expert Chefs</strong>
                  <span>15+ years of culinary mastery</span>
                </div>
              </div>
              <div className="about-hl">
                <span className="about-hl-icon">⚡</span>
                <div>
                  <strong>Lightning Fast</strong>
                  <span>Average delivery in 30 minutes</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </AnimatedSection>

      {/* ═══════════ WHY CHOOSE US ═══════════ */}
      <AnimatedSection className="land-why-choose">
        <h2 className="land-section-title">Why Choose The Flavor Alchemist?</h2>
        <p className="land-section-sub">More than just food delivery — we&apos;re your kitchen away from home</p>
        <div className="why-grid">
          {whyChooseUs.map((item, i) => (
            <div key={i} className="why-card" style={{ transitionDelay: `${i * 100}ms` }}>
              <span className="why-icon">{item.icon}</span>
              <h4>{item.title}</h4>
              <p>{item.desc}</p>
            </div>
          ))}
        </div>
      </AnimatedSection>

      {/* ═══════════ TESTIMONIALS ═══════════ */}
      <AnimatedSection className="land-testimonials">
        <h2 className="land-section-title">What Our Customers Say</h2>
        <p className="land-section-sub">Real reviews from real food lovers</p>
        <div className="testi-grid">
          {testimonials.map((t, i) => (
            <div key={i} className="testi-card" style={{ transitionDelay: `${i * 120}ms` }}>
              <div className="testi-stars">{'★'.repeat(t.rating)}{'☆'.repeat(5 - t.rating)}</div>
              <p className="testi-text">&ldquo;{t.text}&rdquo;</p>
              <span className="testi-author">— {t.name}</span>
            </div>
          ))}
        </div>
      </AnimatedSection>

      {/* ═══════════ CTA BANNER ═══════════ */}
      <AnimatedSection className="land-cta">
        <div className="cta-inner">
          <h2>Hungry? Let&apos;s Get You Fed.</h2>
          <p>
            Join thousands of happy customers and order your next meal from
            The Flavor Alchemist today.
          </p>
          <div className="cta-btns">
            <button className="hero-btn hero-btn-primary" onClick={() => navigate('/menu')}>
              Explore Menu
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><line x1="5" y1="12" x2="19" y2="12"/><polyline points="12 5 19 12 12 19"/></svg>
            </button>
            {!authCtx.isLoggedIn && (
              <button
                className="hero-btn hero-btn-ghost"
                onClick={() => userProgressCtx.showAuth('signup')}
              >
                Create Account
              </button>
            )}
          </div>
        </div>
      </AnimatedSection>
    </div>
  );
}

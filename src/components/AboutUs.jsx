import PageLayout from './UI/PageLayout';

export default function AboutUs() {
  return (
    <PageLayout title="About Us" className="about-us-page">
      <div className="about-hero-section">
        <h2>Welcome to The Flavor Alchemist</h2>
        <p className="about-lead">
          We&apos;re on a mission to transform the way Hyderabad orders food — one perfect meal at a time.
        </p>
      </div>

      <div className="about-story-section">
        <h3>Our Story</h3>
        <p>
          The Flavor Alchemist was born out of a simple belief: everyone deserves access to
          extraordinary food without the hassle. What started as a small kitchen in Hitech City,
          Hyderabad has grown into one of the city&apos;s most loved food delivery platforms.
        </p>
        <p>
          Our team of passionate chefs sources the freshest, locally-grown ingredients and
          transforms them into dishes that surprise and delight with every bite. From authentic
          Hyderabadi biryanis to global cuisines, we bring the world&apos;s flavors to your doorstep.
        </p>
      </div>

      <div className="about-values-section">
        <h3>What We Stand For</h3>
        <div className="about-values-grid">
          <div className="about-value-card">
            <span className="about-value-icon">🌿</span>
            <h4>Farm-to-Table Freshness</h4>
            <p>We partner with local farms and suppliers to bring you the freshest ingredients, ensuring every dish is bursting with natural flavor.</p>
          </div>
          <div className="about-value-card">
            <span className="about-value-icon">👨‍🍳</span>
            <h4>Culinary Excellence</h4>
            <p>Our chefs bring 15+ years of expertise from top restaurants across India and abroad, crafting menus that excite and satisfy.</p>
          </div>
          <div className="about-value-card">
            <span className="about-value-icon">⚡</span>
            <h4>Lightning-Fast Delivery</h4>
            <p>We promise an average delivery time of 30 minutes across Hyderabad, so your food arrives hot and fresh.</p>
          </div>
          <div className="about-value-card">
            <span className="about-value-icon">💚</span>
            <h4>Sustainability</h4>
            <p>We use eco-friendly packaging and minimize food waste through smart portioning and local sourcing.</p>
          </div>
        </div>
      </div>

      <div className="about-numbers-section">
        <h3>The Flavor Alchemist in Numbers</h3>
        <div className="about-numbers-grid">
          <div className="about-number">
            <span className="about-number-value">75+</span>
            <span className="about-number-label">Menu Items</span>
          </div>
          <div className="about-number">
            <span className="about-number-value">10,000+</span>
            <span className="about-number-label">Orders Delivered</span>
          </div>
          <div className="about-number">
            <span className="about-number-value">4.9★</span>
            <span className="about-number-label">Average Rating</span>
          </div>
          <div className="about-number">
            <span className="about-number-value">30 min</span>
            <span className="about-number-label">Avg Delivery Time</span>
          </div>
        </div>
      </div>

      <div className="about-team-section">
        <h3>Meet Our Team</h3>
        <p>
          Behind every dish is a passionate team of chefs, food technologists, delivery partners,
          and customer support specialists working together to give you the best dining experience from the comfort of your home.
        </p>
        <p>
          Based out of our headquarters in Hitech City, Madhapur, Hyderabad — we&apos;re a growing
          family of food enthusiasts who eat, sleep, and breathe great food.
        </p>
      </div>

      <div className="about-promise-section">
        <h3>Our Promise to You</h3>
        <ul className="about-promise-list">
          <li>100% quality assurance on every order</li>
          <li>Safe, hygienic preparation and packaging</li>
          <li>Easy refunds and hassle-free support</li>
          <li>Multiple payment options for your convenience</li>
          <li>Real-time order tracking and updates</li>
        </ul>
      </div>
    </PageLayout>
  );
}

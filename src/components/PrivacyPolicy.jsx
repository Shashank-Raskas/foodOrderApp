import PageLayout from './UI/PageLayout';

export default function PrivacyPolicy() {
  return (
    <PageLayout title="Privacy Policy" className="policy-page">
      <p className="policy-updated">Last updated: January 2025</p>

      <div className="policy-section">
        <h3>1. Introduction</h3>
        <p>
          The Flavor Alchemist (&quot;we&quot;, &quot;our&quot;, or &quot;us&quot;) values your privacy and is committed to protecting your personal data.
          This Privacy Policy explains how we collect, use, disclose, and safeguard your information when you use our website and mobile application (collectively, the &quot;Platform&quot;).
        </p>
      </div>

      <div className="policy-section">
        <h3>2. Information We Collect</h3>
        <p>We may collect the following types of information:</p>
        <ul>
          <li><strong>Personal Information:</strong> Name, email address, phone number, delivery address, and payment information when you create an account or place an order.</li>
          <li><strong>Usage Data:</strong> Information about how you interact with our Platform, including pages visited, search queries, time spent, and device information.</li>
          <li><strong>Location Data:</strong> With your consent, we may collect your location to provide accurate delivery estimates and nearby restaurant recommendations.</li>
          <li><strong>Cookies & Tracking:</strong> We use cookies, web beacons, and similar technologies to enhance your experience and analyze usage patterns.</li>
        </ul>
      </div>

      <div className="policy-section">
        <h3>3. How We Use Your Information</h3>
        <ul>
          <li>To process and deliver your orders</li>
          <li>To communicate order updates, confirmations, and delivery status</li>
          <li>To personalize your experience and provide relevant recommendations</li>
          <li>To process payments securely through our payment partners</li>
          <li>To send promotional offers, discounts, and newsletters (with your consent)</li>
          <li>To improve our Platform, services, and customer support</li>
          <li>To detect and prevent fraud, abuse, and unauthorized access</li>
        </ul>
      </div>

      <div className="policy-section">
        <h3>4. Sharing of Information</h3>
        <p>We do not sell your personal information. We may share your data with:</p>
        <ul>
          <li><strong>Delivery Partners:</strong> To fulfill your orders (name, address, phone number).</li>
          <li><strong>Payment Processors:</strong> Razorpay, PhonePe, and Cashfree for secure transaction processing.</li>
          <li><strong>Analytics Providers:</strong> To understand usage patterns and improve our services.</li>
          <li><strong>Legal Authorities:</strong> When required by law, regulation, or legal process.</li>
        </ul>
      </div>

      <div className="policy-section">
        <h3>5. Data Security</h3>
        <p>
          We implement industry-standard security measures including encryption (SSL/TLS), secure servers,
          and access controls to protect your personal data. However, no method of electronic transmission or
          storage is 100% secure, and we cannot guarantee absolute security.
        </p>
      </div>

      <div className="policy-section">
        <h3>6. Data Retention</h3>
        <p>
          We retain your personal data for as long as your account is active or as needed to provide you services.
          We may also retain data as necessary to comply with legal obligations, resolve disputes, and enforce agreements.
        </p>
      </div>

      <div className="policy-section">
        <h3>7. Your Rights</h3>
        <p>You have the right to:</p>
        <ul>
          <li>Access, update, or delete your personal information through your profile settings</li>
          <li>Opt out of promotional communications</li>
          <li>Request a copy of your data</li>
          <li>Withdraw consent for data processing at any time</li>
        </ul>
      </div>

      <div className="policy-section">
        <h3>8. Third-Party Links</h3>
        <p>
          Our Platform may contain links to third-party websites. We are not responsible for the privacy practices
          of these external sites and encourage you to review their privacy policies.
        </p>
      </div>

      <div className="policy-section">
        <h3>9. Changes to This Policy</h3>
        <p>
          We may update this Privacy Policy from time to time. Any changes will be posted on this page with an
          updated &quot;Last updated&quot; date. Continued use of the Platform after changes constitutes acceptance of the revised policy.
        </p>
      </div>

      <div className="policy-section">
        <h3>10. Contact Us</h3>
        <p>
          If you have any questions about this Privacy Policy, please contact us at:<br />
          Email: <a href="mailto:flavoralchemist9@gmail.com">flavoralchemist9@gmail.com</a><br />
          Phone: 040-4857-2936<br />
          Address: Plot No. 83, Opposite Cyber Towers, Hitech City, Madhapur, Hyderabad — 500081
        </p>
      </div>
    </PageLayout>
  );
}

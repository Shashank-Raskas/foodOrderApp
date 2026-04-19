import PageLayout from './UI/PageLayout';

export default function TermsConditions() {
  return (
    <PageLayout title="Terms & Conditions" className="policy-page">
      <p className="policy-updated">Last updated: January 2025</p>

      <div className="policy-section">
        <h3>1. Acceptance of Terms</h3>
        <p>
          By accessing or using The Flavor Alchemist platform (website and mobile application), you agree to be bound
          by these Terms & Conditions. If you do not agree to these terms, please do not use our services.
        </p>
      </div>

      <div className="policy-section">
        <h3>2. Account Registration</h3>
        <ul>
          <li>You must be at least 18 years old to create an account and place orders.</li>
          <li>You are responsible for maintaining the confidentiality of your account credentials.</li>
          <li>You agree to provide accurate, current, and complete information during registration.</li>
          <li>One account per person. Multiple accounts may be suspended without notice.</li>
        </ul>
      </div>

      <div className="policy-section">
        <h3>3. Ordering & Payment</h3>
        <ul>
          <li>All menu prices are listed in Indian Rupees (INR) and are inclusive of applicable taxes unless stated otherwise.</li>
          <li>Prices are subject to change without prior notice.</li>
          <li>Orders once placed cannot be cancelled after the restaurant has started preparing the food.</li>
          <li>We accept payments via Razorpay, PhonePe, Cashfree, and other supported payment methods.</li>
          <li>Promotional codes are subject to specific terms and may have expiry dates, minimum order values, and usage limits.</li>
        </ul>
      </div>

      <div className="policy-section">
        <h3>4. Delivery</h3>
        <ul>
          <li>We strive to deliver orders within the estimated time, but delivery times are not guaranteed.</li>
          <li>Delivery is available within our serviceable areas in Hyderabad and surrounding regions.</li>
          <li>You are responsible for providing accurate delivery address and contact information.</li>
          <li>If delivery fails due to incorrect address or customer unavailability, re-delivery charges may apply.</li>
        </ul>
      </div>

      <div className="policy-section">
        <h3>5. Cancellations & Refunds</h3>
        <p>
          Please refer to our <a href="/refund-policy">Refund Policy</a> for detailed information on cancellations,
          refunds, and returns.
        </p>
      </div>

      <div className="policy-section">
        <h3>6. User Conduct</h3>
        <p>You agree not to:</p>
        <ul>
          <li>Use the platform for any unlawful purpose</li>
          <li>Attempt to gain unauthorized access to our systems or other users&apos; accounts</li>
          <li>Submit false orders, fraudulent payment information, or misuse promotional offers</li>
          <li>Harass, abuse, or threaten our delivery partners or support staff</li>
          <li>Scrape, crawl, or use automated tools to extract data from the platform</li>
        </ul>
      </div>

      <div className="policy-section">
        <h3>7. Intellectual Property</h3>
        <p>
          All content on the platform — including logos, text, images, recipes, design elements, and software —
          is the property of The Flavor Alchemist and is protected by intellectual property laws.
          You may not reproduce, distribute, or create derivative works without our written consent.
        </p>
      </div>

      <div className="policy-section">
        <h3>8. Limitation of Liability</h3>
        <p>
          The Flavor Alchemist shall not be liable for any indirect, incidental, special, or consequential damages
          arising from your use of our platform or services, including but not limited to food allergies,
          delivery delays, or payment processing errors, to the maximum extent permitted by law.
        </p>
      </div>

      <div className="policy-section">
        <h3>9. Governing Law</h3>
        <p>
          These Terms & Conditions are governed by and construed in accordance with the laws of India.
          Any disputes arising from these terms shall be subject to the exclusive jurisdiction of the courts
          in Hyderabad, Telangana.
        </p>
      </div>

      <div className="policy-section">
        <h3>10. Changes to Terms</h3>
        <p>
          We reserve the right to modify these terms at any time. Changes will be effective upon posting on
          this page. Your continued use of the platform constitutes acceptance of the updated terms.
        </p>
      </div>

      <div className="policy-section">
        <h3>11. Contact</h3>
        <p>
          For any questions about these terms, contact us at:<br />
          Email: <a href="mailto:flavoralchemist9@gmail.com">flavoralchemist9@gmail.com</a><br />
          Phone: 040-4857-2936
        </p>
      </div>
    </PageLayout>
  );
}

import PageLayout from './UI/PageLayout';

export default function ContactUs() {
  return (
    <PageLayout title="Contact Us" className="contact-us-page">
      <div className="contact-intro">
        <p className="contact-lead">
          Have a question, feedback, or need help with your order? We&apos;d love to hear from you.
          Our support team is available Monday to Sunday, 9:00 AM — 11:00 PM IST.
        </p>
      </div>

      <div className="contact-cards-grid">
        {/* Phone */}
        <div className="contact-card">
          <div className="contact-card-icon">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M22 16.92v3a2 2 0 01-2.18 2 19.79 19.79 0 01-8.63-3.07 19.5 19.5 0 01-6-6 19.79 19.79 0 01-3.07-8.67A2 2 0 014.11 2h3a2 2 0 012 1.72 12.84 12.84 0 00.7 2.81 2 2 0 01-.45 2.11L8.09 9.91a16 16 0 006 6l1.27-1.27a2 2 0 012.11-.45 12.84 12.84 0 002.81.7A2 2 0 0122 16.92z"/></svg>
          </div>
          <h3>Phone Support</h3>
          <div className="contact-details">
            <p><strong>Landline:</strong> 040-4857-2936</p>
            <p><strong>Landline:</strong> 040-4857-2937</p>
            <p><strong>Mobile:</strong> +91 93926 18472</p>
          </div>
          <p className="contact-hours">Mon — Sun, 9 AM — 11 PM IST</p>
        </div>

        {/* Email */}
        <div className="contact-card">
          <div className="contact-card-icon">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"/><polyline points="22,6 12,13 2,6"/></svg>
          </div>
          <h3>Email Us</h3>
          <div className="contact-details">
            <p>
              <a href="mailto:flavoralchemist9@gmail.com">flavoralchemist9@gmail.com</a>
            </p>
            <p className="contact-note">We typically respond within 2–4 hours during business hours.</p>
          </div>
        </div>

        {/* Location */}
        <div className="contact-card">
          <div className="contact-card-icon">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0118 0z"/><circle cx="12" cy="10" r="3"/></svg>
          </div>
          <h3>Visit Us</h3>
          <div className="contact-details">
            <p>The Flavor Alchemist HQ</p>
            <p>Plot No. 83, 2nd Floor, Opposite Cyber Towers</p>
            <p>Hitech City Road, Madhapur</p>
            <p>Hyderabad, Telangana — 500081</p>
          </div>
        </div>
      </div>

      {/* Contact Form */}
      <div className="contact-form-section">
        <h3>Send Us a Message</h3>
        <p>Fill out the form below and we&apos;ll get back to you as soon as possible.</p>
        <form className="contact-form" onSubmit={(e) => { e.preventDefault(); alert('Thank you for your message! We will get back to you soon.'); }}>
          <div className="contact-form-row">
            <div className="contact-form-field">
              <label htmlFor="contact-name">Your Name</label>
              <input id="contact-name" type="text" placeholder="John Doe" required />
            </div>
            <div className="contact-form-field">
              <label htmlFor="contact-email">Your Email</label>
              <input id="contact-email" type="email" placeholder="john@example.com" required />
            </div>
          </div>
          <div className="contact-form-field">
            <label htmlFor="contact-subject">Subject</label>
            <input id="contact-subject" type="text" placeholder="Order issue, feedback, general inquiry..." required />
          </div>
          <div className="contact-form-field">
            <label htmlFor="contact-message">Message</label>
            <textarea id="contact-message" rows="5" placeholder="Tell us more..." required />
          </div>
          <button type="submit" className="contact-submit-btn">Send Message</button>
        </form>
      </div>

      {/* FAQ Quick Links */}
      <div className="contact-faq-box">
        <h3>Quick Help</h3>
        <p>
          Before reaching out, you might find your answer in our <a href="/faqs">Frequently Asked Questions</a> or check our <a href="/refund-policy">Refund Policy</a> for order-related queries.
        </p>
      </div>
    </PageLayout>
  );
}

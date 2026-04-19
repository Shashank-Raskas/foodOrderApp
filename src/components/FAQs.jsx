import { useState } from 'react';
import PageLayout from './UI/PageLayout';

const faqData = [
  {
    category: 'Ordering',
    questions: [
      {
        q: 'How do I place an order?',
        a: 'Simply browse our menu, add items to your cart, proceed to checkout, fill in your delivery details, apply a promo code if you have one, select your preferred payment method, and confirm your order. It\'s that easy!'
      },
      {
        q: 'Can I modify or cancel my order after placing it?',
        a: 'You can cancel an order before the restaurant starts preparing it. Once preparation begins, cancellation is not possible. Contact us immediately at flavoralchemist9@gmail.com or call 040-4857-2936 for assistance.'
      },
      {
        q: 'Is there a minimum order value?',
        a: 'There is no minimum order value. However, certain promotional codes may have a minimum order requirement mentioned in their terms.'
      },
      {
        q: 'Can I schedule an order for later?',
        a: 'Currently, we only support immediate orders. Scheduled ordering is a feature we\'re working on and will be available soon!'
      },
    ]
  },
  {
    category: 'Delivery',
    questions: [
      {
        q: 'What areas do you deliver to?',
        a: 'We currently deliver across Hyderabad, including Hitech City, Madhapur, Gachibowli, Kondapur, Kukatpally, Jubilee Hills, Banjara Hills, Ameerpet, and surrounding areas. We\'re expanding every month!'
      },
      {
        q: 'How long does delivery take?',
        a: 'Our average delivery time is 30 minutes. During peak hours or adverse weather, it may take slightly longer. You\'ll receive real-time updates on your order status.'
      },
      {
        q: 'Do you charge for delivery?',
        a: 'Standard delivery is free for orders above ₹299. For orders below that, a nominal delivery fee of ₹30–₹50 may apply depending on distance.'
      },
    ]
  },
  {
    category: 'Payments',
    questions: [
      {
        q: 'What payment methods do you accept?',
        a: 'We accept Razorpay, PhonePe, Cashfree, UPI, credit/debit cards, net banking, and popular wallets. All transactions are secured with industry-standard encryption.'
      },
      {
        q: 'Is it safe to pay online?',
        a: 'Absolutely. All payment transactions are processed through PCI-DSS compliant payment gateways (Razorpay, PhonePe, Cashfree). We never store your card details on our servers.'
      },
      {
        q: 'How do promo codes work?',
        a: 'Enter your promo code during checkout before selecting your payment method. The discount will be applied to your order total instantly. Each promo code has specific terms like minimum order value, maximum discount, and validity period.'
      },
    ]
  },
  {
    category: 'Account & Profile',
    questions: [
      {
        q: 'How do I create an account?',
        a: 'Click "Sign Up" in the header, enter your name, email, and password. You\'ll receive an OTP on your email for verification. Once verified, your account is ready!'
      },
      {
        q: 'I forgot my password. What should I do?',
        a: 'You can reset your password by clicking "Forgot Password" on the login screen. An OTP will be sent to your registered email to verify your identity before setting a new password.'
      },
      {
        q: 'Can I save multiple delivery addresses?',
        a: 'Yes! You can save multiple addresses (Home, Work, Other) in your profile and quickly select them during checkout.'
      },
    ]
  },
  {
    category: 'Refunds & Complaints',
    questions: [
      {
        q: 'How do I request a refund?',
        a: 'If you\'re unsatisfied with your order, email us at flavoralchemist9@gmail.com with your Order ID and a description of the issue. Our team will process eligible refunds within 5–7 business days. For details, see our Refund Policy.'
      },
      {
        q: 'What if I received the wrong order?',
        a: 'We sincerely apologize for the inconvenience. Please contact us within 2 hours of delivery with your Order ID and a photo of the items received. We\'ll arrange a replacement or full refund.'
      },
      {
        q: 'The food quality was not up to the mark. What can I do?',
        a: 'We take quality seriously. Report the issue via email with photos, and our team will investigate and provide a suitable resolution — be it a refund, replacement, or platform credits.'
      },
    ]
  },
];

export default function FAQs() {
  const [openIndex, setOpenIndex] = useState(null);

  function toggleFaq(categoryIdx, questionIdx) {
    const key = `${categoryIdx}-${questionIdx}`;
    setOpenIndex(prev => prev === key ? null : key);
  }

  return (
    <PageLayout title="Frequently Asked Questions" className="faq-page">
      <p className="faq-intro">
        Find answers to the most common questions about ordering, delivery, payments, and more.
        Can&apos;t find what you&apos;re looking for? <a href="/contact">Contact our support team</a>.
      </p>

      {faqData.map((cat, ci) => (
        <div key={cat.category} className="faq-category">
          <h3 className="faq-category-title">{cat.category}</h3>
          <div className="faq-list">
            {cat.questions.map((item, qi) => {
              const key = `${ci}-${qi}`;
              const isOpen = openIndex === key;
              return (
                <div key={qi} className={`faq-item ${isOpen ? 'faq-open' : ''}`}>
                  <button className="faq-question" onClick={() => toggleFaq(ci, qi)}>
                    <span>{item.q}</span>
                    <span className="faq-toggle">{isOpen ? '−' : '+'}</span>
                  </button>
                  {isOpen && <div className="faq-answer"><p>{item.a}</p></div>}
                </div>
              );
            })}
          </div>
        </div>
      ))}
    </PageLayout>
  );
}

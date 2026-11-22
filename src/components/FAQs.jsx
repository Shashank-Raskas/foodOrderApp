import { useState } from 'react';
import PageLayout from './UI/PageLayout';
import { parseFaqs } from '../../content/markdown.js';
// The questions live in content/faqs.md so the site and the support chatbot share one source
import faqSource from '../../content/faqs.md?raw';

const faqData = parseFaqs(faqSource).categories;

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

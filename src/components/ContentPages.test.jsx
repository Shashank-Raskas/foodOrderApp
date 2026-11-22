// The FAQ and policy pages render from the Markdown files in content/ (shared with the chatbot).
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import FAQs from './FAQs';
import PrivacyPolicy from './PrivacyPolicy';
import TermsConditions from './TermsConditions';
import RefundPolicy from './RefundPolicy';

const renderPage = (Page) => render(<MemoryRouter><Page /></MemoryRouter>);

describe('policy pages', () => {
  it.each([
    [PrivacyPolicy, 'Privacy Policy', 10],
    [TermsConditions, 'Terms & Conditions', 11],
    [RefundPolicy, 'Refund Policy', 8],
  ])('%#: renders the title, last-updated date and every section', (Page, title, sections) => {
    const { container } = renderPage(Page);
    expect(screen.getByRole('heading', { level: 1, name: title })).toBeInTheDocument();
    expect(screen.getByText('Last updated: January 2025')).toHaveClass('policy-updated');
    expect(container.querySelectorAll('.policy-section')).toHaveLength(sections);
    expect(container.querySelectorAll('.policy-section > h3')).toHaveLength(sections);
  });

  it('renders bold labels, links, numbered steps and the refund timelines table', () => {
    const { container } = renderPage(RefundPolicy);
    expect(screen.getByText('Wrong Items Delivered:').tagName).toBe('STRONG');
    expect(container.querySelectorAll('ol > li')).toHaveLength(4);

    const table = screen.getByRole('table');
    expect(table).toHaveClass('policy-table');
    expect(within(table).getAllByRole('columnheader').map((th) => th.textContent)).toEqual(['Refund Method', 'Processing Time']);
    expect(within(table).getAllByRole('row')).toHaveLength(4);
    expect(within(table).getByText('Instant — within 2 hours')).toBeInTheDocument();

    for (const link of screen.getAllByRole('link', { name: 'flavoralchemist9@gmail.com' })) {
      expect(link).toHaveAttribute('href', 'mailto:flavoralchemist9@gmail.com');
    }
  });

  it('keeps line breaks in the contact block and the link to the refund policy', () => {
    const { container } = renderPage(TermsConditions);
    expect(screen.getByRole('link', { name: 'Refund Policy' })).toHaveAttribute('href', '/refund-policy');
    const contact = [...container.querySelectorAll('.policy-section')].at(-1).querySelector('p');
    expect(contact.querySelectorAll('br')).toHaveLength(2);
    expect(contact).toHaveTextContent('Phone: 040-4857-2936');
  });
});

describe('FAQs page', () => {
  it('lists every category and question, collapsed until clicked', async () => {
    const user = userEvent.setup();
    const { container } = renderPage(FAQs);
    expect(screen.getByRole('heading', { level: 1, name: 'Frequently Asked Questions' })).toBeInTheDocument();
    expect([...container.querySelectorAll('.faq-category-title')].map((h) => h.textContent)).toEqual([
      'Ordering', 'Delivery', 'Payments', 'Account & Profile', 'Refunds & Complaints',
    ]);
    expect(container.querySelectorAll('button.faq-question')).toHaveLength(16);
    expect(container.querySelector('.faq-answer')).toBeNull();

    await user.click(screen.getByRole('button', { name: /Do you charge for delivery\?/ }));
    expect(container.querySelector('.faq-answer')).toHaveTextContent('Standard delivery is free for orders above ₹299.');
    expect(container.querySelectorAll('.faq-open')).toHaveLength(1);
  });
});

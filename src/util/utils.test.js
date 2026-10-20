import { currencyFormatter } from './formatting';
import { validateEmail, validateCheckoutForm, hasErrors } from './validation';

describe('currencyFormatter', () => {
  it('formats rupees the Indian way', () => {
    expect(currencyFormatter.format(350)).toBe('₹350.00');
    expect(currencyFormatter.format(123456.5)).toBe('₹1,23,456.50');
    expect(currencyFormatter.format('499')).toBe('₹499.00');
  });
});

describe('validation', () => {
  it('validates emails', () => {
    expect(validateEmail('a@b.co')).toBe(true);
    expect(validateEmail('a@b')).toBe(false);
    expect(validateEmail('a b@c.com')).toBe(false);
  });

  it('reports each missing checkout field', () => {
    const errors = validateCheckoutForm({ name: ' ', email: 'bad', street: '', 'postal-code': '', city: '' });
    expect(Object.keys(errors).sort()).toEqual(['city', 'email', 'name', 'postal-code', 'street']);
    expect(hasErrors(errors)).toBe(true);
    expect(hasErrors(validateCheckoutForm({ name: 'A', email: 'a@b.co', street: 'S', 'postal-code': '1', city: 'C' }))).toBe(false);
  });
});

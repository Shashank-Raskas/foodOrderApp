// Unit tests for small, pure pieces: coupon rules, the rate limiter, the order email and role assignment.
import { describe, it, expect, jest } from '@jest/globals';
import { stubEnv, stubGlobal } from './support/stubs.js';

// Imported after setup.js has swapped in the fake Firestore (these modules import firebase.js)
const { evaluateCoupon } = await import('../services/couponService.js');
const { rateLimit, byBodyField } = await import('../middleware/rateLimit.js');
const { determineRole } = await import('../services/tokenService.js');
const { sendOrderConfirmationEmail, sendOtpEmail } = await import('../services/emailService.js');

describe('evaluateCoupon', () => {
  const base = { active: true, type: 'percent', value: 10, maxDiscount: 0, minOrder: 0, maxUses: 0, usedCount: 0 };

  it.each([
    ['percent', { ...base }, 500, 50],
    ['percent capped by maxDiscount', { ...base, value: 50, maxDiscount: 100 }, 1000, 100],
    ['flat', { ...base, type: 'flat', value: 75 }, 500, 75],
    ['flat capped at the cart total', { ...base, type: 'flat', value: 900 }, 500, 500],
    ['rounded to paise', { ...base, value: 15 }, 333.33, 50],
  ])('%s', (_name, coupon, total, discount) => {
    expect(evaluateCoupon(coupon, total)).toEqual({ ok: true, discount });
  });

  it.each([
    ['inactive', { ...base, active: false }, 500, /no longer active/],
    ['used up', { ...base, maxUses: 3, usedCount: 3 }, 500, /fully redeemed/],
    ['below minimum', { ...base, minOrder: 600 }, 500, /Minimum order of ₹600/],
  ])('rejects when %s', (_name, coupon, total, message) => {
    const result = evaluateCoupon(coupon, total);
    expect(result.ok).toBe(false);
    expect(result.status).toBe(400);
    expect(result.message).toMatch(message);
  });
});

describe('rateLimit middleware', () => {
  const run = (mw, req = { ip: '1.1.1.1', body: {} }) => {
    const res = { statusCode: 200, headers: {}, body: null, setHeader(k, v) { this.headers[k] = v; }, status(c) { this.statusCode = c; return this; }, json(b) { this.body = b; return this; } };
    let passed = false;
    mw(req, res, () => { passed = true; });
    return { passed, res };
  };

  it('allows `max` requests per window, then 429 with Retry-After, then resets', () => {
    jest.useFakeTimers();
    const mw = rateLimit({ windowMs: 60_000, max: 2, message: 'Slow down' });
    expect(run(mw).passed).toBe(true);
    expect(run(mw).passed).toBe(true);
    const blocked = run(mw);
    expect(blocked.passed).toBe(false);
    expect(blocked.res.statusCode).toBe(429);
    expect(blocked.res.body).toEqual({ message: 'Slow down' });
    expect(Number(blocked.res.headers['Retry-After'])).toBeGreaterThan(0);

    jest.advanceTimersByTime(60_001);
    expect(run(mw).passed).toBe(true);
  });

  it('counts each key separately', () => {
    const mw = rateLimit({ windowMs: 60_000, max: 1, message: 'x' });
    expect(run(mw, { ip: 'a' }).passed).toBe(true);
    expect(run(mw, { ip: 'b' }).passed).toBe(true);
    expect(run(mw, { ip: 'a' }).passed).toBe(false);
  });

  it('byBodyField keys by a normalised body field and skips when it is missing', () => {
    const mw = rateLimit({ windowMs: 60_000, max: 1, message: 'x', key: byBodyField('email') });
    expect(run(mw, { ip: '1', body: { email: 'A@b.com' } }).passed).toBe(true);
    expect(run(mw, { ip: '2', body: { email: ' a@B.com ' } }).passed).toBe(false);
    expect(run(mw, { ip: '3', body: {} }).passed).toBe(true);
    expect(run(mw, { ip: '3', body: { email: 42 } }).passed).toBe(true);
  });
});

describe('determineRole', () => {
  it('only the admin address (any case) is admin', () => {
    expect(determineRole('Flavor.Alchemist9@gmail.com')).toBe('admin');
    expect(determineRole('someone@gmail.com')).toBe('user');
    expect(determineRole(null)).toBe('user');
  });
});

describe('emails', () => {
  const capture = () => {
    stubEnv('BREVO_API_KEY', 'test-key');
    const fetchMock = jest.fn(async () => ({ ok: true, json: async () => ({ messageId: 'x' }) }));
    stubGlobal('fetch', fetchMock);
    return () => JSON.parse(fetchMock.mock.calls[0][1].body);
  };

  it('order confirmation shows items, discounts and the real total, with customer text escaped', async () => {
    const payload = capture();
    await sendOrderConfirmationEmail('a@test.com', {
      items: [{ name: 'Mac & Cheese', price: '350', quantity: 2 }],
      customer: { name: '<script>alert(1)</script>', street: '1 Main St', city: 'Pune', 'postal-code': '411001' },
      subtotal: 700, discount: 70, loyaltyDiscount: 15, promoCode: 'SAVE10', total: 615,
    });
    const { htmlContent, to } = payload();
    expect(to).toEqual([{ email: 'a@test.com' }]);
    expect(htmlContent).toContain('₹615.00');
    expect(htmlContent).toContain('Promo (SAVE10)');
    expect(htmlContent).toContain('-₹70.00');
    expect(htmlContent).toContain('Loyalty points');
    expect(htmlContent).toContain('Mac &amp; Cheese');
    expect(htmlContent).toContain('&lt;script&gt;');
    expect(htmlContent).not.toContain('<script>');
    expect(htmlContent).not.toContain('NaN');
  });

  it('order confirmation still works for older orders that stored totalPrice', async () => {
    const payload = capture();
    await sendOrderConfirmationEmail('a@test.com', { items: [], customer: {}, totalPrice: '120' });
    expect(payload().htmlContent).toContain('₹120.00');
  });

  it('OTP email fails clearly without an API key', async () => {
    stubEnv('BREVO_API_KEY', '');
    await expect(sendOtpEmail('a@test.com', '123456')).rejects.toThrow(/BREVO_API_KEY/);
  });
});

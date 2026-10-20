import { describe, it, expect, beforeEach, jest } from '@jest/globals';
import { db, request, freshApp, signup, as, getMenu, seedCoupon, validCustomer, money, stubEnv, stubGlobal, waitFor } from './support/helpers.js';

let app, alice, menu, m1, m2;
beforeEach(async () => {
  app = await freshApp();
  alice = await signup(app);
  menu = await getMenu(app);
  [m1, m2] = menu;
});

const placeOrder = (order, user = alice) => as(app, user).post('/api/orders', { order: { customer: validCustomer, ...order } });
const orders = () => Object.values(db.dump('orders'));
const loyaltyOf = (user) => db.dump('loyalty')[user.userId];

describe('POST /api/orders — validation', () => {
  it('requires login', async () => {
    const res = await request(app).post('/api/orders').send({ order: { items: [{ id: m1.id, quantity: 1 }], customer: validCustomer } });
    expect(res.status).toBe(401);
  });

  it.each([
    [{ items: [] }, /Missing data/],
    [{ items: 'nope' }, /Missing data/],
    [{ items: [{ id: 'm1', quantity: 1 }], customer: { ...validCustomer, street: ' ' } }, /street/],
    [{ items: [{ id: 'm1', quantity: 1 }], customer: { ...validCustomer, email: 'bad' } }, /Email/],
    [{ items: [{ id: 'm1', quantity: 1 }], customer: undefined }, /Missing data/],
  ])('rejects bad orders %#', async (order, message) => {
    const res = await as(app, alice).post('/api/orders', { order: { customer: validCustomer, ...order } });
    expect(res.status).toBe(400);
    expect(res.body.message).toMatch(message);
  });

  it.each([0, -1, 1.5, 100, 'two'])('rejects quantity %s', async (quantity) => {
    const res = await placeOrder({ items: [{ id: m1.id, quantity }] });
    expect(res.status).toBe(400);
    expect(res.body.message).toMatch(/quantity/i);
  });

  it('rejects meals that are no longer on the menu, naming them', async () => {
    const res = await placeOrder({ items: [{ id: 'gone', name: 'Old Special', quantity: 1 }] });
    expect(res.status).toBe(400);
    expect(res.body.message).toMatch(/Old Special is no longer on the menu/);
  });
});

describe('POST /api/orders — pricing', () => {
  it('prices items from the menu and ignores amounts sent by the browser', async () => {
    const res = await placeOrder({
      items: [{ ...m1, price: '1', quantity: 2 }, { ...m2, price: '0', quantity: 1 }],
      subtotal: 1, discount: 999, loyaltyDiscount: 999, total: 0,
    });
    const expected = money(Number(m1.price) * 2 + Number(m2.price));

    expect(res.status).toBe(201);
    expect(res.body.total).toBe(expected);

    const [order] = orders();
    expect(order).toMatchObject({ subtotal: expected, discount: 0, loyaltyDiscount: 0, total: expected, userId: alice.userId, promoCode: null });
    expect(order.items.map((i) => [i.id, i.price, i.quantity])).toEqual([[m1.id, m1.price, 2], [m2.id, m2.price, 1]]);
    // Same item shape as before: the full meal plus quantity
    expect(order.items[0]).toEqual({ ...m1, quantity: 2 });
    expect(order.customer).toEqual(validCustomer);
    expect(order.id).toMatch(/^[0-9a-f-]{36}$/);
    expect(Date.parse(order.createdAt)).not.toBeNaN();
  });

  it('awards 1 loyalty point per ₹10 of the final total', async () => {
    const res = await placeOrder({ items: [{ id: m1.id, quantity: 3 }] });
    expect(loyaltyOf(alice).points).toBe(Math.floor(res.body.total / 10));
    expect(loyaltyOf(alice).history[0]).toMatchObject({ type: 'earned', orderId: orders()[0].id });
  });

  it('sends a confirmation email with the real total when email is configured', async () => {
    stubEnv('BREVO_API_KEY', 'test-key');
    const fetchMock = jest.fn(async () => ({ ok: true, json: async () => ({ messageId: 'm' }) }));
    stubGlobal('fetch', fetchMock);

    const res = await placeOrder({ items: [{ id: m1.id, quantity: 1 }] });
    await waitFor(() => expect(fetchMock).toHaveBeenCalled());
    const html = JSON.parse(fetchMock.mock.calls[0][1].body).htmlContent;
    expect(html).toContain(`₹${res.body.total.toFixed(2)}`);
    expect(html).not.toContain('NaN');
  });
});

describe('POST /api/orders — promo codes', () => {
  it('applies a valid code and counts the use', async () => {
    seedCoupon({ code: 'SAVE10', type: 'percent', value: 10, maxDiscount: 50 });
    const res = await placeOrder({ items: [{ id: m1.id, quantity: 2 }], promoCode: 'save10' });
    const subtotal = Number(m1.price) * 2;
    const discount = money(Math.min(subtotal * 0.1, 50));

    expect(res.status).toBe(201);
    expect(res.body.total).toBe(money(subtotal - discount));
    expect(orders()[0]).toMatchObject({ promoCode: 'SAVE10', discount });
    expect(db.dump('coupons')['c-SAVE10'].usedCount).toBe(1);
  });

  it('caps a flat discount at the order value', async () => {
    seedCoupon({ code: 'BIG', type: 'flat', value: 100000 });
    const res = await placeOrder({ items: [{ id: m1.id, quantity: 1 }], promoCode: 'BIG' });
    expect(res.body.total).toBe(0);
  });

  it.each([
    [{ code: 'USED', maxUses: 1, usedCount: 1 }, /fully redeemed/],
    [{ code: 'OFF', active: false }, /no longer active/],
    [{ code: 'MIN', minOrder: 1000000 }, /Minimum order/],
  ])('enforces coupon rules at order time %#', async (coupon, message) => {
    seedCoupon(coupon);
    const res = await placeOrder({ items: [{ id: m1.id, quantity: 1 }], promoCode: coupon.code });
    expect(res.status).toBe(400);
    expect(res.body.message).toMatch(message);
    expect(orders()).toHaveLength(0);
  });

  it('rejects unknown codes', async () => {
    const res = await placeOrder({ items: [{ id: m1.id, quantity: 1 }], promoCode: 'NOPE' });
    expect(res.status).toBe(400);
    expect(res.body.message).toMatch(/Invalid promo code/);
  });

  it('lets only one order use the last remaining coupon use', async () => {
    seedCoupon({ code: 'LAST', maxUses: 1 });
    const [a, b] = await Promise.all([
      placeOrder({ items: [{ id: m1.id, quantity: 1 }], promoCode: 'LAST' }),
      placeOrder({ items: [{ id: m1.id, quantity: 1 }], promoCode: 'LAST' }),
    ]);
    expect([a.status, b.status].sort()).toEqual([201, 400]);
    expect(db.dump('coupons')['c-LAST'].usedCount).toBe(1);
  });
});

describe('loyalty points', () => {
  beforeEach(() => {
    db.put('loyalty', alice.userId, { points: 500, history: [] });
  });

  it('GET /api/user/loyalty returns the balance (0 for new users)', async () => {
    expect((await as(app, alice).get('/api/user/loyalty')).body.points).toBe(500);
    const bob = await signup(app, { email: 'bob@test.com', name: 'Bob' });
    expect((await as(app, bob).get('/api/user/loyalty')).body).toEqual({ points: 0, history: [] });
  });

  it('redeem only quotes the discount — nothing is deducted until an order is placed', async () => {
    const quote = await as(app, alice).post('/api/user/loyalty/redeem', { points: 155 });
    expect(quote.status).toBe(200);
    expect(quote.body).toMatchObject({ discount: 15, points: 150, remainingPoints: 350 });
    expect(loyaltyOf(alice).points).toBe(500);
  });

  it('redeem validates the amount', async () => {
    expect((await as(app, alice).post('/api/user/loyalty/redeem', { points: 49 })).status).toBe(400);
    expect((await as(app, alice).post('/api/user/loyalty/redeem', { points: 501 })).status).toBe(400);
    expect((await as(app, alice).post('/api/user/loyalty/redeem', { points: 'lots' })).status).toBe(400);
  });

  it('placing an order spends the points and earns new ones', async () => {
    const res = await placeOrder({ items: [{ id: m1.id, quantity: 1 }], redeemPoints: 150 });
    const total = money(Number(m1.price) - 15);
    expect(res.status).toBe(201);
    expect(res.body.total).toBe(total);
    expect(orders()[0]).toMatchObject({ loyaltyDiscount: 15, pointsRedeemed: 150 });

    const loyalty = loyaltyOf(alice);
    expect(loyalty.points).toBe(500 - 150 + Math.floor(total / 10));
    expect(loyalty.history.map((h) => h.type)).toEqual(['redeemed', 'earned']);
  });

  it('never discounts more than what is left to pay', async () => {
    db.put('loyalty', alice.userId, { points: 10_000_000, history: [] });
    const res = await placeOrder({ items: [{ id: m1.id, quantity: 1 }], redeemPoints: 10_000_000 });
    expect(res.body.total).toBe(0);
    const spent = 10_000_000 - loyaltyOf(alice).points;
    expect(spent).toBe(Math.floor(Number(m1.price)) * 10);
  });

  it('rejects spending more points than the balance or fewer than 50', async () => {
    expect((await placeOrder({ items: [{ id: m1.id, quantity: 1 }], redeemPoints: 9999 })).status).toBe(400);
    expect((await placeOrder({ items: [{ id: m1.id, quantity: 1 }], redeemPoints: 20 })).status).toBe(400);
    expect(loyaltyOf(alice).points).toBe(500);
    expect(orders()).toHaveLength(0);
  });

  it('a rejected order changes nothing (points, coupon and orders untouched)', async () => {
    seedCoupon({ code: 'OFF', active: false });
    const res = await placeOrder({ items: [{ id: m1.id, quantity: 1 }], redeemPoints: 100, promoCode: 'OFF' });
    expect(res.status).toBe(400);
    expect(loyaltyOf(alice).points).toBe(500);
    expect(orders()).toHaveLength(0);
  });

  it('two orders at once cannot spend the same points twice', async () => {
    db.put('loyalty', alice.userId, { points: 100, history: [] });
    const [a, b] = await Promise.all([
      placeOrder({ items: [{ id: m1.id, quantity: 1 }], redeemPoints: 100 }),
      placeOrder({ items: [{ id: m1.id, quantity: 1 }], redeemPoints: 100 }),
    ]);
    expect([a.status, b.status].sort()).toEqual([201, 400]);
    expect(loyaltyOf(alice).points).toBeGreaterThanOrEqual(0);
  });
});

describe('GET /api/user/orders', () => {
  it("lists only the user's own orders, newest first", async () => {
    const bob = await signup(app, { email: 'bob@test.com', name: 'Bob' });
    await placeOrder({ items: [{ id: m1.id, quantity: 1 }] });
    await new Promise((r) => setTimeout(r, 5));
    await placeOrder({ items: [{ id: m2.id, quantity: 1 }] });
    await placeOrder({ items: [{ id: m1.id, quantity: 1 }] }, bob);

    const res = await as(app, alice).get('/api/user/orders');
    expect(res.status).toBe(200);
    expect(res.body.count).toBe(2);
    expect(res.body.orders[0].items[0].id).toBe(m2.id);
    expect(res.body.orders.every((o) => o.userId === alice.userId)).toBe(true);
  });
});

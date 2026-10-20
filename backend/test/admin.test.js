import { describe, it, expect, beforeEach } from '@jest/globals';
import { db, request, freshApp, signup, as, adminLogin, getMenu, validCustomer, money } from './support/helpers.js';

let app, admin, alice;
beforeEach(async () => {
  app = await freshApp();
  admin = await adminLogin(app);
  alice = await signup(app);
});

const ADMIN_ROUTES = [
  ['get', '/api/admin/orders'],
  ['get', '/api/admin/users'],
  ['get', '/api/admin/coupons'],
  ['post', '/api/admin/coupons'],
  ['put', '/api/admin/coupons/x'],
  ['delete', '/api/admin/coupons/x'],
  ['get', '/api/admin/meals'],
  ['post', '/api/admin/meals'],
  ['put', '/api/admin/meals/m1'],
  ['delete', '/api/admin/meals/m1'],
];

describe('access control', () => {
  it.each(ADMIN_ROUTES)('%s %s needs a token (401) and the admin role (403)', async (method, url) => {
    expect((await request(app)[method](url)).status).toBe(401);
    expect((await as(app, alice)[method](url, {})).status).toBe(403);
  });

  it('the admin account gets in', () => {
    expect(admin.role).toBe('admin');
  });
});

describe('orders and users', () => {
  it('lists every order with revenue from the stored totals', async () => {
    const [m1] = await getMenu(app);
    const r1 = await as(app, alice).post('/api/orders', { order: { items: [{ id: m1.id, quantity: 2 }], customer: validCustomer } });
    const r2 = await as(app, admin).post('/api/orders', { order: { items: [{ id: m1.id, quantity: 1 }], customer: validCustomer } });
    // An order saved in the older shape (totalPrice instead of total) still counts
    db.put('orders', 'legacy', { items: [], totalPrice: '100.50', createdAt: '2020-01-01T00:00:00.000Z' });

    const res = await as(app, admin).get('/api/admin/orders');
    expect(res.status).toBe(200);
    expect(res.body.count).toBe(3);
    expect(Number(res.body.totalRevenue)).toBe(money(r1.body.total + r2.body.total + 100.5));
  });

  it('lists accounts from credentials without password hashes', async () => {
    const res = await as(app, admin).get('/api/admin/users');
    expect(res.status).toBe(200);
    expect(res.body.users.map((u) => u.email).sort()).toEqual(['alice@test.com', 'flavor.alchemist9@gmail.com']);
    for (const user of res.body.users) {
      expect(user).not.toHaveProperty('password');
      expect(user.id).toBeTruthy();
    }
  });
});

describe('coupons', () => {
  it('creates, lists, toggles and deletes a coupon', async () => {
    const created = await as(app, admin).post('/api/admin/coupons', { coupon: { code: ' welcome20 ', type: 'percent', value: '20', maxDiscount: '150', minOrder: '', maxUses: '5' } });
    expect(created.status).toBe(201);
    expect(created.body.coupon).toMatchObject({ code: 'WELCOME20', type: 'percent', value: 20, maxDiscount: 150, minOrder: 0, maxUses: 5, usedCount: 0, active: true });
    const id = created.body.coupon.id;

    expect((await as(app, admin).get('/api/admin/coupons')).body.coupons).toHaveLength(1);

    await as(app, admin).put(`/api/admin/coupons/${id}`, { active: false });
    expect(db.dump('coupons')[id].active).toBe(false);
    const preview = await request(app).post('/api/coupons/validate').send({ code: 'WELCOME20', cartTotal: 500 });
    expect(preview.status).toBe(400);

    await as(app, admin).delete(`/api/admin/coupons/${id}`);
    expect(db.dump('coupons')).toEqual({});
  });

  it('rejects duplicates and bad values', async () => {
    await as(app, admin).post('/api/admin/coupons', { coupon: { code: 'DUP', type: 'flat', value: 50 } });
    expect((await as(app, admin).post('/api/admin/coupons', { coupon: { code: 'dup', type: 'flat', value: 50 } })).status).toBe(400);
    expect((await as(app, admin).post('/api/admin/coupons', { coupon: { code: 'X', type: 'bogus', value: 5 } })).status).toBe(400);
    expect((await as(app, admin).post('/api/admin/coupons', { coupon: { code: 'Y', type: 'flat', value: 0 } })).status).toBe(400);
    expect((await as(app, admin).post('/api/admin/coupons', { coupon: { type: 'flat', value: 5 } })).status).toBe(400);
  });
});

describe('menu management (stored in Firestore)', () => {
  it('adds a meal that shows on the public menu and can be ordered at its price', async () => {
    const before = await getMenu(app);
    const res = await as(app, admin).post('/api/admin/meals', { meal: { name: ' Test Thali ', price: 249, category: 'entrees' } });
    expect(res.status).toBe(201);
    const meal = res.body.meal;
    expect(meal).toMatchObject({ name: 'Test Thali', price: '249', category: 'entrees', image: 'images/default-meal.jpg' });

    const after = await getMenu(app);
    expect(after).toHaveLength(before.length + 1);
    expect(after.at(-1).id).toBe(meal.id);
    expect(db.dump('meals')[meal.id]).toBeTruthy();

    const order = await as(app, alice).post('/api/orders', { order: { items: [{ id: meal.id, quantity: 2 }], customer: validCustomer } });
    expect(order.body.total).toBe(498);
  });

  it('updates a meal in place without moving it', async () => {
    const before = await getMenu(app);
    const target = before[3];
    const res = await as(app, admin).put(`/api/admin/meals/${target.id}`, { meal: { ...target, price: '999', name: 'Renamed', id: 'ignored', sortOrder: -5 } });
    expect(res.status).toBe(200);
    expect(res.body.meal).toMatchObject({ id: target.id, price: '999', name: 'Renamed' });
    expect(res.body.meal).not.toHaveProperty('sortOrder');

    const after = await getMenu(app);
    expect(after[3]).toMatchObject({ id: target.id, price: '999', name: 'Renamed' });
    expect(after.map((m) => m.id)).toEqual(before.map((m) => m.id));
  });

  it('deletes a meal; ordering it afterwards fails', async () => {
    const [m1] = await getMenu(app);
    expect((await as(app, admin).delete(`/api/admin/meals/${m1.id}`)).status).toBe(200);
    expect((await getMenu(app)).some((m) => m.id === m1.id)).toBe(false);
    const order = await as(app, alice).post('/api/orders', { order: { items: [{ id: m1.id, name: m1.name, quantity: 1 }], customer: validCustomer } });
    expect(order.status).toBe(400);
    expect((await as(app, admin).delete(`/api/admin/meals/${m1.id}`)).status).toBe(404);
  });

  it('validates meal input', async () => {
    expect((await as(app, admin).post('/api/admin/meals', { meal: { name: 'No price' } })).status).toBe(400);
    expect((await as(app, admin).post('/api/admin/meals', { meal: { name: 'Free', price: -1 } })).status).toBe(400);
    expect((await as(app, admin).put('/api/admin/meals/m1', { meal: { price: 'abc' } })).status).toBe(400);
    expect((await as(app, admin).put('/api/admin/meals/nope', { meal: { price: 10 } })).status).toBe(404);
  });

  it('GET /api/admin/meals returns the same menu as the public endpoint', async () => {
    const res = await as(app, admin).get('/api/admin/meals');
    expect(res.body.meals).toEqual(await getMenu(app));
  });
});

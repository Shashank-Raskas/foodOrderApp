import { describe, it, expect, beforeEach, jest } from '@jest/globals';
import fs from 'node:fs';
import { db, request, freshApp, signup, as, getMenu, seedCoupon } from './support/helpers.js';

const seed = JSON.parse(fs.readFileSync(new URL('../data/available-meals.json', import.meta.url), 'utf8'));

let app;
beforeEach(async () => {
  app = await freshApp();
});

describe('GET /meals', () => {
  it('serves the full menu, in the original order and shape', async () => {
    const res = await request(app).get('/meals');
    expect(res.status).toBe(200);
    expect(res.body).toEqual(seed);
  });

  it('copies the menu into Firestore on first use, once', async () => {
    await getMenu(app);
    expect(Object.keys(db.dump('meals'))).toHaveLength(seed.length);
    expect(db.dump('config').menu.count).toBe(seed.length);

    // If every meal is deleted later, the menu stays empty instead of being re-seeded
    for (const id of Object.keys(db.dump('meals'))) db.put('meals', id, null);
    const fresh = await freshApp();
    expect(await getMenu(fresh)).toEqual([]);
  });

  it('falls back to the bundled menu if Firestore is unreachable', async () => {
    const spy = jest.spyOn(db, 'collection').mockImplementation(() => { throw new Error('UNAVAILABLE'); });
    try {
      const res = await request(app).get('/meals');
      expect(res.status).toBe(200);
      expect(res.body).toEqual(seed);
    } finally {
      spy.mockRestore();
    }
  });
});

describe('reviews', () => {
  let alice, mealId;
  beforeEach(async () => {
    alice = await signup(app, { name: 'Alice' });
    mealId = (await getMenu(app))[0].id;
  });

  it('posts a review under the account name, whatever the body says', async () => {
    const res = await as(app, alice).post(`/api/meals/${mealId}/reviews`, { userId: 'someone-else', userName: 'The Admin', rating: 5, comment: '  Lovely  ' });
    expect(res.status).toBe(201);
    expect(res.body.review).toMatchObject({ userId: alice.userId, userName: 'Alice', rating: 5, comment: 'Lovely', mealId });
  });

  it('a second review from the same user updates the first; average is computed', async () => {
    const bob = await signup(app, { email: 'bob@test.com', name: 'Bob' });
    await as(app, alice).post(`/api/meals/${mealId}/reviews`, { rating: 5 });
    await as(app, alice).post(`/api/meals/${mealId}/reviews`, { rating: 2, comment: 'Changed my mind' });
    await as(app, bob).post(`/api/meals/${mealId}/reviews`, { rating: 4 });

    const res = await request(app).get(`/api/meals/${mealId}/reviews`);
    expect(res.body.count).toBe(2);
    expect(res.body.avgRating).toBe(3);
    expect(res.body.reviews.find((r) => r.userName === 'Alice').comment).toBe('Changed my mind');
  });

  it.each([0, 6, 3.5, 'five', null])('rejects rating %s', async (rating) => {
    expect((await as(app, alice).post(`/api/meals/${mealId}/reviews`, { rating })).status).toBe(400);
  });

  it('rejects overly long comments and unknown meals; requires login', async () => {
    expect((await as(app, alice).post(`/api/meals/${mealId}/reviews`, { rating: 4, comment: 'x'.repeat(1001) })).status).toBe(400);
    expect((await as(app, alice).post('/api/meals/not-a-meal/reviews', { rating: 4 })).status).toBe(404);
    expect((await request(app).post(`/api/meals/${mealId}/reviews`).send({ rating: 4 })).status).toBe(401);
  });

  it('an unreviewed meal has no reviews', async () => {
    expect((await request(app).get(`/api/meals/${mealId}/reviews`)).body).toEqual({ reviews: [], count: 0, avgRating: 0 });
  });
});

describe('POST /api/coupons/validate (checkout preview)', () => {
  it('returns the discount for a cart total', async () => {
    seedCoupon({ code: 'SAVE20', type: 'percent', value: 20, maxDiscount: 100 });
    const res = await request(app).post('/api/coupons/validate').send({ code: ' save20 ', cartTotal: 300 });
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ valid: true, code: 'SAVE20', discount: 60 });
    const capped = await request(app).post('/api/coupons/validate').send({ code: 'SAVE20', cartTotal: 5000 });
    expect(capped.body.discount).toBe(100);
  });

  it('rejects unknown and missing codes', async () => {
    expect((await request(app).post('/api/coupons/validate').send({ code: 'NOPE', cartTotal: 10 })).status).toBe(404);
    expect((await request(app).post('/api/coupons/validate').send({ cartTotal: 10 })).status).toBe(400);
  });

  it('limits guessing to 30 tries per 15 minutes per IP', async () => {
    for (let i = 0; i < 30; i++) {
      await request(app).post('/api/coupons/validate').set('X-Forwarded-For', '203.0.113.7').send({ code: `GUESS${i}`, cartTotal: 10 });
    }
    const blocked = await request(app).post('/api/coupons/validate').set('X-Forwarded-For', '203.0.113.7').send({ code: 'GUESS', cartTotal: 10 });
    expect(blocked.status).toBe(429);
    const otherIp = await request(app).post('/api/coupons/validate').set('X-Forwarded-For', '203.0.113.8').send({ code: 'GUESS', cartTotal: 10 });
    expect(otherIp.status).toBe(404);
  });
});

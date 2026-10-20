import { describe, it, expect, beforeEach, jest } from '@jest/globals';
import { request, freshApp, signup, as, stubEnv } from './support/helpers.js';

describe('robustness', () => {
  let app;
  beforeEach(async () => {
    app = await freshApp();
  });

  it('answers malformed JSON with a 400 JSON error', async () => {
    const res = await request(app).post('/api/login').set('Content-Type', 'application/json').send('{"email": ');
    expect(res.status).toBe(400);
    expect(res.body.message).toMatch(/Invalid JSON/);
  });

  it('answers unknown routes with a JSON 404', async () => {
    const res = await request(app).get('/api/nope');
    expect(res.status).toBe(404);
    expect(res.body).toEqual({ message: 'Not found' });
  });

  it('survives wrong input types on every write endpoint (no crash, no 5xx)', async () => {
    const user = await signup(app);
    const weird = [null, 42, 'text', [], { $gt: '' }, true];
    const endpoints = [
      ['post', '/api/signup', (v) => ({ email: v, password: v, name: v })],
      ['post', '/api/login', (v) => ({ email: v, password: v })],
      ['post', '/api/otp/send', (v) => ({ type: 'email', destination: v })],
      ['post', '/api/otp/verify', (v) => ({ type: 'email', destination: v, otp: v, name: v })],
      ['post', '/api/auth/refresh', (v) => ({ refreshToken: v })],
      ['post', '/api/auth/logout', (v) => ({ refreshToken: v })],
      ['post', '/api/coupons/validate', (v) => ({ code: v, cartTotal: v })],
    ];
    const authed = [
      ['post', '/api/orders', (v) => ({ order: { items: [{ id: v, quantity: v }], customer: { name: v, email: v, street: v, 'postal-code': v, city: v }, promoCode: v, redeemPoints: v } })],
      ['post', '/api/orders', (v) => ({ order: v })],
      ['post', '/api/user/addresses', (v) => ({ address: { id: v, street: v, city: v, postalCode: v } })],
      ['put', '/api/user/profile', (v) => ({ name: v })],
      ['put', '/api/user/change-password', (v) => ({ oldPassword: v, newPassword: v })],
      ['put', '/api/user/contact', (v) => ({ phone: v })],
      ['post', '/api/user/loyalty/redeem', (v) => ({ points: v })],
      ['post', '/api/meals/m1/reviews', (v) => ({ rating: v, comment: v })],
    ];

    const serverErrors = [];
    for (const v of weird) {
      for (const [method, url, body] of endpoints) {
        const res = await request(app)[method](url).set('X-Forwarded-For', `198.51.100.${weird.indexOf(v)}`).send(body(v));
        if (res.status >= 500) serverErrors.push(`${res.status} ${method.toUpperCase()} ${url} with ${JSON.stringify(v)}`);
      }
      for (const [method, url, body] of authed) {
        const res = await as(app, user)[method](url, body(v));
        if (res.status >= 500) serverErrors.push(`${res.status} ${method.toUpperCase()} ${url} with ${JSON.stringify(v)}`);
      }
    }
    expect(serverErrors).toEqual([]);
    expect((await request(app).get('/api/health')).status).toBe(200);
  });

  it('sets basic security headers and hides the framework', async () => {
    const res = await request(app).get('/api/health');
    expect(res.headers['x-content-type-options']).toBe('nosniff');
    expect(res.headers['x-frame-options']).toBe('DENY');
    expect(res.headers['referrer-policy']).toBe('no-referrer');
    expect(res.headers['x-powered-by']).toBeUndefined();
  });

  it('still serves meal images (cross-origin, cacheable)', async () => {
    const res = await request(app).get('/images/mac-and-cheese.jpg');
    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toMatch(/^image\/jpeg/);
    expect(res.headers['cache-control']).toMatch(/max-age=604800/);
    expect(res.headers['cross-origin-resource-policy']).toBeUndefined();
  });
});

describe('CORS', () => {
  it('local development allows any origin', async () => {
    const app = await freshApp();
    const res = await request(app).get('/meals').set('Origin', 'http://192.168.1.20:5173');
    expect(res.status).toBe(200);
    expect(res.headers['access-control-allow-origin']).toBe('http://192.168.1.20:5173');
  });

  describe('when deployed', () => {
    let app;
    beforeEach(async () => {
      app = await freshApp({ RENDER: 'true', ALLOWED_ORIGINS: 'https://flavor.example.com, https://www.flavor.example.com/' });
    });

    it('allows the Render frontend, including preflight', async () => {
      const res = await request(app).get('/meals').set('Origin', 'https://foodorderapp-99re.onrender.com');
      expect(res.status).toBe(200);
      expect(res.headers['access-control-allow-origin']).toBe('https://foodorderapp-99re.onrender.com');
      expect(res.headers.vary).toMatch(/Origin/);

      const preflight = await request(app).options('/api/orders')
        .set('Origin', 'https://foodorderapp-99re.onrender.com')
        .set('Access-Control-Request-Method', 'POST');
      expect(preflight.status).toBe(200);
      expect(preflight.headers['access-control-allow-headers']).toMatch(/Authorization/);
    });

    it('allows origins listed in ALLOWED_ORIGINS', async () => {
      expect((await request(app).get('/meals').set('Origin', 'https://flavor.example.com')).status).toBe(200);
      expect((await request(app).get('/meals').set('Origin', 'https://www.flavor.example.com')).status).toBe(200);
    });

    it('blocks other origins', async () => {
      const res = await request(app).post('/api/login').set('Origin', 'https://evil.example.com').send({ email: 'a@b.com', password: 'x' });
      expect(res.status).toBe(403);
      expect(res.headers['access-control-allow-origin']).toBeUndefined();
    });

    it('allows requests with no Origin (health checks, server-to-server)', async () => {
      expect((await request(app).get('/api/health')).status).toBe(200);
    });
  });
});

describe('secrets configuration', () => {
  it('refuses to start when deployed without JWT secrets', async () => {
    stubEnv('RENDER', 'true');
    stubEnv('JWT_SECRET', '');
    jest.resetModules();
    await expect(import('../config/env.js')).rejects.toThrow(/JWT_SECRET is not set/);
  });

  it('uses a random secret in local development when none is set', async () => {
    stubEnv('JWT_SECRET', '');
    stubEnv('JWT_REFRESH_SECRET', '');
    jest.resetModules();
    const first = await import('../config/env.js');
    jest.resetModules();
    const second = await import('../config/env.js');
    expect(first.JWT_SECRET).toMatch(/^[a-f0-9]{64}$/);
    expect(first.JWT_SECRET).not.toBe(second.JWT_SECRET);
    expect(first.JWT_SECRET).not.toBe('flavor_alchemist_jwt_access_secret_key_2026');
  });
});

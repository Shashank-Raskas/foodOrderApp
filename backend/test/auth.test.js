import { describe, it, expect, beforeEach } from '@jest/globals';
import jwt from 'jsonwebtoken';
import { db, request, freshApp, signup, as, ADMIN_EMAIL } from './support/helpers.js';

let app;
beforeEach(async () => {
  app = await freshApp();
});

const credentials = () => Object.values(db.dump('credentials'));

describe('POST /api/signup', () => {
  it('creates a user with a hashed password and returns tokens', async () => {
    const res = await request(app).post('/api/signup').send({ email: 'Alice@Test.com', password: 'Secret123', name: '  Alice  ' });

    expect(res.status).toBe(201);
    expect(res.body).toMatchObject({ email: 'alice@test.com', name: 'Alice', role: 'user' });
    expect(res.body.accessToken).toBeTruthy();
    expect(res.body.refreshToken).toBeTruthy();

    const [stored] = credentials();
    expect(stored.password).not.toBe('Secret123');
    expect(stored.password).toMatch(/^\$2[aby]\$/); // bcrypt hash
  });

  it('rejects a duplicate email', async () => {
    await signup(app);
    const res = await request(app).post('/api/signup').send({ email: 'alice@test.com', password: 'Secret123', name: 'Again' });
    expect(res.status).toBe(400);
    expect(res.body.message).toMatch(/already exists/);
  });

  it.each([
    [{ email: 'not-an-email', password: 'Secret123', name: 'A' }, /Invalid email/],
    [{ email: 'a@b.com', password: '123', name: 'A' }, /at least 6/],
    [{ email: 'a@b.com', password: 'Secret123', name: '   ' }, /Name is required/],
    [{ email: 12345, password: 'Secret123', name: 'A' }, /Invalid email/],
    [{ email: 'a@b.com', password: 99999999, name: 'A' }, /at least 6/],
  ])('validates input %#', async (body, message) => {
    const res = await request(app).post('/api/signup').send(body);
    expect(res.status).toBe(400);
    expect(res.body.message).toMatch(message);
  });

  it('never grants admin to a password signup, even with the admin email', async () => {
    const res = await request(app).post('/api/signup').send({ email: ADMIN_EMAIL, password: 'Secret123', name: 'Squatter' });
    expect(res.status).toBe(201);
    expect(res.body.role).toBe('user');
  });
});

describe('POST /api/login', () => {
  beforeEach(async () => {
    await signup(app);
  });

  it('logs in with the right password', async () => {
    const res = await request(app).post('/api/login').send({ email: 'ALICE@test.com', password: 'Secret123' });
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ email: 'alice@test.com', name: 'Alice', role: 'user' });
    const decoded = jwt.decode(res.body.accessToken);
    expect(decoded).toMatchObject({ email: 'alice@test.com', role: 'user' });
  });

  it('rejects a wrong password and an unknown email with the same message', async () => {
    const wrong = await request(app).post('/api/login').send({ email: 'alice@test.com', password: 'nope' });
    const unknown = await request(app).post('/api/login').send({ email: 'ghost@test.com', password: 'Secret123' });
    expect(wrong.status).toBe(401);
    expect(unknown.status).toBe(401);
    expect(wrong.body.message).toBe(unknown.body.message);
  });

  it('tells OTP-only accounts to use OTP', async () => {
    db.put('credentials', 'otp-user', { userId: 'u-otp', email: 'otp@test.com', name: 'Otp', role: 'user', createdAt: new Date().toISOString() });
    const res = await request(app).post('/api/login').send({ email: 'otp@test.com', password: 'whatever' });
    expect(res.status).toBe(401);
    expect(res.body.message).toMatch(/OTP/);
  });

  it('adds a role to old accounts that have none', async () => {
    const [id] = Object.keys(db.dump('credentials'));
    const { role, ...legacy } = db.dump('credentials')[id];
    db.put('credentials', id, legacy);

    const res = await request(app).post('/api/login').send({ email: 'alice@test.com', password: 'Secret123' });
    expect(res.body.role).toBe('user');
    expect(db.dump('credentials')[id].role).toBe('user');
  });

  it('slows down password guessing on one account (10 attempts / 15 min)', async () => {
    for (let i = 0; i < 10; i++) {
      await request(app).post('/api/login').send({ email: 'alice@test.com', password: 'wrong' });
    }
    const blocked = await request(app).post('/api/login').send({ email: 'alice@test.com', password: 'Secret123' });
    expect(blocked.status).toBe(429);

    // Other accounts are unaffected
    await signup(app, { email: 'bob@test.com', name: 'Bob' });
    const other = await request(app).post('/api/login').send({ email: 'bob@test.com', password: 'Secret123' });
    expect(other.status).toBe(200);
  });
});

describe('refresh tokens', () => {
  let user;
  beforeEach(async () => {
    user = await signup(app);
  });

  it('are stored hashed, never as the raw token', () => {
    const [stored] = Object.values(db.dump('refreshTokens'));
    expect(stored.tokenHash).toMatch(/^[a-f0-9]{64}$/);
    expect(stored).not.toHaveProperty('token');
    expect(JSON.stringify(stored)).not.toContain(user.refreshToken);
    expect(Date.parse(stored.expiresAt)).toBeGreaterThan(Date.now());
  });

  it('refresh rotates the token; the old one stops working', async () => {
    const first = await request(app).post('/api/auth/refresh').send({ refreshToken: user.refreshToken });
    expect(first.status).toBe(200);
    expect(first.body.accessToken).toBeTruthy();
    expect(first.body.refreshToken).not.toBe(user.refreshToken);

    const reused = await request(app).post('/api/auth/refresh').send({ refreshToken: user.refreshToken });
    expect(reused.status).toBe(401);

    const next = await request(app).post('/api/auth/refresh').send({ refreshToken: first.body.refreshToken });
    expect(next.status).toBe(200);
  });

  it('issues a unique refresh token on every login, even in the same second', async () => {
    const a = await request(app).post('/api/login').send({ email: 'alice@test.com', password: 'Secret123' });
    const b = await request(app).post('/api/login').send({ email: 'alice@test.com', password: 'Secret123' });
    expect(a.body.refreshToken).not.toBe(b.body.refreshToken);
  });

  it('returns the latest role from the database', async () => {
    const [id] = Object.keys(db.dump('credentials'));
    db.put('credentials', id, { ...db.dump('credentials')[id], role: 'admin' });
    const res = await request(app).post('/api/auth/refresh').send({ refreshToken: user.refreshToken });
    expect(res.body.role).toBe('admin');
    expect(jwt.decode(res.body.accessToken).role).toBe('admin');
  });

  it('still accepts sessions stored before tokens were hashed', async () => {
    const [id, doc] = Object.entries(db.dump('refreshTokens'))[0];
    db.put('refreshTokens', id, { userId: doc.userId, token: user.refreshToken, createdAt: doc.createdAt });

    const res = await request(app).post('/api/auth/refresh').send({ refreshToken: user.refreshToken });
    expect(res.status).toBe(200);
  });

  it('rejects garbage, a token signed with another secret, and missing tokens', async () => {
    const forged = jwt.sign({ userId: user.userId, role: 'admin' }, 'some-other-secret', { expiresIn: '7d' });
    expect((await request(app).post('/api/auth/refresh').send({ refreshToken: 'garbage' })).status).toBe(401);
    expect((await request(app).post('/api/auth/refresh').send({ refreshToken: forged })).status).toBe(401);
    expect((await request(app).post('/api/auth/refresh').send({})).status).toBe(400);
  });

  it('logout revokes the refresh token', async () => {
    const out = await request(app).post('/api/auth/logout').send({ refreshToken: user.refreshToken });
    expect(out.status).toBe(200);
    const res = await request(app).post('/api/auth/refresh').send({ refreshToken: user.refreshToken });
    expect(res.status).toBe(401);
  });

  it('cleans up expired refresh tokens on the next login', async () => {
    db.put('refreshTokens', 'old', { userId: user.userId, tokenHash: 'x'.repeat(64), expiresAt: '2020-01-01T00:00:00.000Z', createdAt: '2019-12-25T00:00:00.000Z' });
    await request(app).post('/api/login').send({ email: 'alice@test.com', password: 'Secret123' });
    expect(db.dump('refreshTokens')).not.toHaveProperty('old');
  });
});

describe('access tokens', () => {
  it('protected routes need a valid token', async () => {
    const user = await signup(app);
    expect((await request(app).get('/api/user/orders')).status).toBe(401);
    expect((await request(app).get('/api/user/orders').set('Authorization', 'Bearer nope')).status).toBe(401);
    expect((await as(app, user).get('/api/user/orders')).status).toBe(200);
  });

  it('rejects an admin token forged with the old public fallback secret', async () => {
    const forged = jwt.sign({ userId: 'x', email: 'evil@test.com', role: 'admin' }, 'flavor_alchemist_jwt_access_secret_key_2026', { expiresIn: '15m' });
    const res = await request(app).get('/api/admin/users').set('Authorization', `Bearer ${forged}`);
    expect(res.status).toBe(401);
  });

  it('reports expired tokens with TOKEN_EXPIRED so the frontend can refresh', async () => {
    const expired = jwt.sign({ userId: 'u', role: 'user', exp: Math.floor(Date.now() / 1000) - 10 }, process.env.JWT_SECRET);
    const res = await request(app).get('/api/user/orders').set('Authorization', `Bearer ${expired}`);
    expect(res.status).toBe(401);
    expect(res.body.code).toBe('TOKEN_EXPIRED');
  });
});

describe('profile and password', () => {
  it('updates the name', async () => {
    const user = await signup(app);
    const res = await as(app, user).put('/api/user/profile', { name: '  Alice B  ' });
    expect(res.status).toBe(200);
    expect(res.body.name).toBe('Alice B');
    expect(credentials()[0].name).toBe('Alice B');
    expect((await as(app, user).put('/api/user/profile', { name: ' ' })).status).toBe(400);
  });

  it('changes the password', async () => {
    const user = await signup(app);
    expect((await as(app, user).put('/api/user/change-password', { oldPassword: 'wrong1', newPassword: 'Newpass123' })).status).toBe(401);
    expect((await as(app, user).put('/api/user/change-password', { oldPassword: 'Secret123', newPassword: 'Secret123' })).status).toBe(400);

    const ok = await as(app, user).put('/api/user/change-password', { oldPassword: 'Secret123', newPassword: 'Newpass123' });
    expect(ok.status).toBe(200);
    expect((await request(app).post('/api/login').send({ email: 'alice@test.com', password: 'Newpass123' })).status).toBe(200);
    expect((await request(app).post('/api/login').send({ email: 'alice@test.com', password: 'Secret123' })).status).toBe(401);
  });

  it('explains that OTP-only accounts have no password (instead of a 500)', async () => {
    db.put('credentials', 'otp', { userId: 'u-otp', email: 'otp@test.com', name: 'Otp', role: 'user' });
    const token = jwt.sign({ userId: 'u-otp', email: 'otp@test.com', role: 'user' }, process.env.JWT_SECRET);
    const res = await as(app, { accessToken: token }).put('/api/user/change-password', { oldPassword: 'whatever1', newPassword: 'Newpass123' });
    expect(res.status).toBe(400);
    expect(res.body.message).toMatch(/OTP/);
  });
});

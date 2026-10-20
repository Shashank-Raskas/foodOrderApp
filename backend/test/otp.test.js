import { describe, it, expect, beforeEach, jest } from '@jest/globals';
import { db, request, freshApp, latestOtp, stubEnv, stubGlobal, ADMIN_EMAIL } from './support/helpers.js';

let app;
beforeEach(async () => {
  app = await freshApp();
});

const send = (destination, type = 'email') => request(app).post('/api/otp/send').send({ type, destination });
const verify = (body) => request(app).post('/api/otp/verify').send({ type: 'email', ...body });

describe('GET /api/auth/config', () => {
  it('reports email OTP on and phone OTP off without Twilio', async () => {
    const res = await request(app).get('/api/auth/config');
    expect(res.body).toEqual({ emailOtp: true, phoneOtp: false });
  });
});

describe('POST /api/otp/send', () => {
  it('stores a 6-digit code that expires in 5 minutes', async () => {
    const res = await send('New@Test.com');
    expect(res.status).toBe(200);
    const [doc] = Object.values(db.dump('otps'));
    expect(doc).toMatchObject({ destination: 'new@test.com', type: 'email', attempts: 0, verified: false });
    expect(doc.otp).toMatch(/^\d{6}$/);
    const ttl = Date.parse(doc.expiresAt) - Date.parse(doc.createdAt);
    expect(ttl).toBeGreaterThan(4.9 * 60 * 1000);
    expect(ttl).toBeLessThanOrEqual(5 * 60 * 1000 + 50);
  });

  it.each([
    [{ type: 'fax', destination: 'a@b.com' }, 400],
    [{ type: 'email', destination: '' }, 400],
    [{ type: 'email', destination: 'not-an-email' }, 400],
    [{ type: 'email', destination: 42 }, 400],
    [{ type: 'phone', destination: '12345' }, 400],
    [{ type: 'phone', destination: '+919876543210' }, 503], // SMS not configured
  ])('validates %o', async (body, status) => {
    expect((await request(app).post('/api/otp/send').send(body)).status).toBe(status);
  });

  it('allows 3 codes per address per 10 minutes', async () => {
    for (let i = 0; i < 3; i++) expect((await send('limit@test.com')).status).toBe(200);
    const fourth = await send('limit@test.com');
    expect(fourth.status).toBe(429);
    // A different address is not affected
    expect((await send('other@test.com')).status).toBe(200);
  });

  it('keeps provider errors out of the response', async () => {
    stubEnv('BREVO_API_KEY', 'test-key');
    stubGlobal('fetch', jest.fn(async () => ({ ok: false, status: 401, text: async () => '{"code":"unauthorized","message":"Key not found: test-key"}' })));
    const res = await send('fail@test.com');
    expect(res.status).toBe(500);
    expect(res.body.message).toBe('Failed to send OTP. Please try again.');
    expect(JSON.stringify(res.body)).not.toContain('test-key');
  });

  it('sends the code through Brevo when configured', async () => {
    stubEnv('BREVO_API_KEY', 'test-key');
    const fetchMock = jest.fn(async () => ({ ok: true, json: async () => ({ messageId: 'm1' }) }));
    stubGlobal('fetch', fetchMock);
    expect((await send('mail@test.com')).status).toBe(200);
    const [url, options] = fetchMock.mock.calls[0];
    expect(url).toBe('https://api.brevo.com/v3/smtp/email');
    const payload = JSON.parse(options.body);
    expect(payload.to).toEqual([{ email: 'mail@test.com' }]);
    expect(payload.htmlContent).toContain(latestOtp('mail@test.com'));
  });
});

describe('POST /api/otp/verify', () => {
  it('asks a new user for their name, then creates the account with the same code', async () => {
    await send('new@test.com');
    const otp = latestOtp('new@test.com');

    const first = await verify({ destination: 'new@test.com', otp });
    expect(first.status).toBe(400);
    expect(first.body.needsName).toBe(true);

    const second = await verify({ destination: 'new@test.com', otp, name: 'Newbie' });
    expect(second.status).toBe(200);
    expect(second.body).toMatchObject({ email: 'new@test.com', name: 'Newbie', role: 'user', isNewUser: true });
    expect(second.body.accessToken).toBeTruthy();
    // Used codes are cleaned up
    expect(Object.keys(db.dump('otps'))).toHaveLength(0);
  });

  it('logs in an existing user', async () => {
    db.put('credentials', 'c1', { userId: 'u1', email: 'old@test.com', name: 'Old', role: 'user', createdAt: '2024-01-01T00:00:00.000Z' });
    await send('old@test.com');
    const res = await verify({ destination: 'old@test.com', otp: latestOtp('old@test.com') });
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ userId: 'u1', name: 'Old', isNewUser: false });
  });

  it('rejects a wrong code and locks the code after 5 wrong attempts', async () => {
    await send('guess@test.com');
    const real = latestOtp('guess@test.com');
    const wrong = real === '111111' ? '222222' : '111111';

    for (let i = 0; i < 5; i++) {
      const res = await verify({ destination: 'guess@test.com', otp: wrong });
      expect(res.status).toBe(400);
      expect(res.body.message).toMatch(/Incorrect/);
    }
    const locked = await verify({ destination: 'guess@test.com', otp: real, name: 'X' });
    expect(locked.status).toBe(400);
    expect(locked.body.message).toMatch(/Too many failed attempts/);
  });

  it('rejects an expired code', async () => {
    await send('late@test.com');
    const [id, doc] = Object.entries(db.dump('otps'))[0];
    db.put('otps', id, { ...doc, expiresAt: new Date(Date.now() - 1000).toISOString() });
    const res = await verify({ destination: 'late@test.com', otp: doc.otp, name: 'Late' });
    expect(res.status).toBe(400);
    expect(res.body.message).toMatch(/expired/);
  });

  it('after a resend only the newest code works', async () => {
    await send('resend@test.com');
    const oldCode = latestOtp('resend@test.com');
    await send('resend@test.com');
    const newCode = latestOtp('resend@test.com');

    const docs = Object.values(db.dump('otps'));
    expect(docs).toHaveLength(2);
    expect(docs.filter((d) => d.superseded)).toHaveLength(1);

    if (oldCode !== newCode) {
      expect((await verify({ destination: 'resend@test.com', otp: oldCode, name: 'R' })).status).toBe(400);
    }
    expect((await verify({ destination: 'resend@test.com', otp: newCode, name: 'R' })).status).toBe(200);
  });

  it('gives the admin role to the admin email once it is verified by OTP', async () => {
    // Existing account created by a password signup (role "user")
    db.put('credentials', 'admin', { userId: 'u-admin', email: ADMIN_EMAIL, name: 'Admin', role: 'user', createdAt: '2024-01-01T00:00:00.000Z' });
    await send(ADMIN_EMAIL);
    const res = await verify({ destination: ADMIN_EMAIL, otp: latestOtp(ADMIN_EMAIL) });
    expect(res.body.role).toBe('admin');
    expect(db.dump('credentials').admin.role).toBe('admin');
  });

  it('validates input without crashing', async () => {
    expect((await verify({ destination: 'a@test.com' })).status).toBe(400);
    expect((await verify({ destination: { $ne: 1 }, otp: '123456' })).status).toBe(400);
    expect((await request(app).post('/api/otp/verify').send({ type: 'sms', destination: 'a@test.com', otp: '1' })).status).toBe(400);
    expect((await verify({ destination: 'nobody@test.com', otp: '123456' })).body.message).toMatch(/No OTP found/);
  });
});

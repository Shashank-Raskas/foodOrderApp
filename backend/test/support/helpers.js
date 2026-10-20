import { jest } from '@jest/globals';
import request from 'supertest';
import db from './fakeFirestore.js';
import { stubEnv, stubGlobal, waitFor } from './stubs.js';

export { db, request, stubEnv, stubGlobal, waitFor };

export const ADMIN_EMAIL = 'flavor.alchemist9@gmail.com';

/**
 * A brand-new app instance with fresh module state (rate-limit counters, menu cache).
 * Pass env overrides to test deployed-mode behaviour; they're applied before the modules load.
 */
export async function freshApp(env = {}) {
  for (const [key, value] of Object.entries(env)) stubEnv(key, value);
  jest.resetModules();
  const { createApp } = await import('../../createApp.js');
  return createApp();
}

export const validCustomer = {
  name: 'Alice Tester',
  email: 'alice@test.com',
  phone: '+919876543210',
  street: '12 Baker Street',
  'postal-code': '411001',
  city: 'Pune',
};

/** Sign up with email + password and return the response body (user + tokens). */
export async function signup(app, { email = 'alice@test.com', password = 'Secret123', name = 'Alice' } = {}) {
  const res = await request(app).post('/api/signup').send({ email, password, name });
  if (res.status !== 201) throw new Error(`signup failed: ${res.status} ${JSON.stringify(res.body)}`);
  return res.body;
}

/** The latest active OTP stored for a destination (what the user would receive by email). */
export function latestOtp(destination) {
  const docs = Object.values(db.dump('otps'))
    .filter((d) => d.destination === destination.toLowerCase() && !d.superseded)
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  return docs[0]?.otp;
}

/** Log in (or sign up) via email OTP, end to end. */
export async function otpLogin(app, email, name = 'OTP User') {
  const sent = await request(app).post('/api/otp/send').send({ type: 'email', destination: email });
  if (sent.status !== 200) throw new Error(`otp send failed: ${sent.status} ${JSON.stringify(sent.body)}`);
  const otp = latestOtp(email);
  let res = await request(app).post('/api/otp/verify').send({ type: 'email', destination: email, otp });
  if (res.body.needsName) {
    res = await request(app).post('/api/otp/verify').send({ type: 'email', destination: email, otp, name });
  }
  if (res.status !== 200) throw new Error(`otp verify failed: ${res.status} ${JSON.stringify(res.body)}`);
  return res.body;
}

/** Log in as the admin account (email OTP proves ownership of the admin address). */
export const adminLogin = (app) => otpLogin(app, ADMIN_EMAIL, 'Admin');

/** Shorthand for an authenticated request. */
export function as(app, user) {
  const auth = (req) => req.set('Authorization', `Bearer ${user.accessToken}`);
  return {
    get: (url) => auth(request(app).get(url)),
    post: (url, body) => auth(request(app).post(url)).send(body),
    put: (url, body) => auth(request(app).put(url)).send(body),
    delete: (url) => auth(request(app).delete(url)),
  };
}

/** The menu as the API serves it (also seeds Firestore on first call). */
export async function getMenu(app) {
  return (await request(app).get('/meals')).body;
}

/** Create a coupon straight in the database. */
export function seedCoupon(fields) {
  const coupon = { type: 'percent', value: 10, maxDiscount: 0, minOrder: 0, maxUses: 0, usedCount: 0, active: true, createdAt: new Date().toISOString(), ...fields };
  db.put('coupons', `c-${coupon.code}`, coupon);
  return coupon;
}

export const money = (n) => Math.round(n * 100) / 100;

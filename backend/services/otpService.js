import crypto from 'node:crypto';
import db from '../firebase.js';

const OTP_COLLECTION = 'otps';
const OTP_EXPIRY_MINUTES = 5;
const MAX_ATTEMPTS = 5; // max verification attempts before OTP is invalidated
const RATE_LIMIT_WINDOW_MINUTES = 10;
const RATE_LIMIT_MAX_SENDS = 3;

/**
 * Generate a 6-digit numeric OTP
 */
export function generateOtp() {
  return crypto.randomInt(100000, 999999).toString();
}

/**
 * Store OTP in Firestore with expiry
 */
export async function storeOtp(destination, otp, type) {
  const expiresAt = new Date(Date.now() + OTP_EXPIRY_MINUTES * 60 * 1000).toISOString();

  // Remove any existing OTPs for this destination
  const existing = await db
    .collection(OTP_COLLECTION)
    .where('destination', '==', destination.toLowerCase())
    .get();

  const batch = db.batch();
  existing.forEach((doc) => batch.delete(doc.ref));
  await batch.commit();

  // Store new OTP
  await db.collection(OTP_COLLECTION).add({
    destination: destination.toLowerCase(),
    otp,
    type, // 'email' | 'phone'
    expiresAt,
    attempts: 0,
    verified: false,
    createdAt: new Date().toISOString(),
  });
}

/**
 * Check rate limit — max RATE_LIMIT_MAX_SENDS per destination in RATE_LIMIT_WINDOW_MINUTES
 */
export async function checkRateLimit(destination) {
  const windowStart = new Date(Date.now() - RATE_LIMIT_WINDOW_MINUTES * 60 * 1000).toISOString();

  // Single-field query to avoid composite index requirement, then filter in JS
  const snapshot = await db
    .collection(OTP_COLLECTION)
    .where('destination', '==', destination.toLowerCase())
    .get();

  const recentCount = snapshot.docs.filter(
    (doc) => doc.data().createdAt >= windowStart
  ).length;

  return recentCount < RATE_LIMIT_MAX_SENDS;
}

/**
 * Verify OTP
 * Returns { valid: boolean, reason?: string }
 */
export async function verifyOtp(destination, otp) {
  // Single-field query to avoid composite index requirement, then filter in JS
  const snapshot = await db
    .collection(OTP_COLLECTION)
    .where('destination', '==', destination.toLowerCase())
    .get();

  // Include both verified and unverified docs — the needs-name re-verification flow
  // calls this a second time after the OTP was already marked verified on the first attempt.
  if (snapshot.docs.length === 0) {
    return { valid: false, reason: 'No OTP found. Please request a new one.' };
  }

  const doc = snapshot.docs[0];
  const data = doc.data();

  // Check expiry
  if (new Date(data.expiresAt) < new Date()) {
    await doc.ref.delete();
    return { valid: false, reason: 'OTP has expired. Please request a new one.' };
  }

  // Check max attempts (skip when already verified — identity already proved once)
  if (!data.verified && data.attempts >= MAX_ATTEMPTS) {
    await doc.ref.delete();
    return { valid: false, reason: 'Too many failed attempts. Please request a new OTP.' };
  }

  // Check OTP match
  if (data.otp !== otp) {
    if (!data.verified) await doc.ref.update({ attempts: data.attempts + 1 });
    return { valid: false, reason: 'Incorrect OTP. Please try again.' };
  }

  // OTP matches — mark as verified if not already (first-time verification)
  if (!data.verified) {
    await doc.ref.update({ verified: true });
  }

  return { valid: true };
}

/**
 * Clean up OTPs for a destination after successful login/signup
 */
export async function cleanupOtp(destination) {
  const snapshot = await db
    .collection(OTP_COLLECTION)
    .where('destination', '==', destination.toLowerCase())
    .get();

  const batch = db.batch();
  snapshot.forEach((doc) => batch.delete(doc.ref));
  if (!snapshot.empty) await batch.commit();
}

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

  // We count by checking recent OTPs created
  const recentSnapshot = await db
    .collection(OTP_COLLECTION)
    .where('destination', '==', destination.toLowerCase())
    .where('createdAt', '>=', windowStart)
    .get();

  return recentSnapshot.size < RATE_LIMIT_MAX_SENDS;
}

/**
 * Verify OTP
 * Returns { valid: boolean, reason?: string }
 */
export async function verifyOtp(destination, otp) {
  const snapshot = await db
    .collection(OTP_COLLECTION)
    .where('destination', '==', destination.toLowerCase())
    .where('verified', '==', false)
    .limit(1)
    .get();

  if (snapshot.empty) {
    return { valid: false, reason: 'No OTP found. Please request a new one.' };
  }

  const doc = snapshot.docs[0];
  const data = doc.data();

  // Check expiry
  if (new Date(data.expiresAt) < new Date()) {
    await doc.ref.delete();
    return { valid: false, reason: 'OTP has expired. Please request a new one.' };
  }

  // Check max attempts
  if (data.attempts >= MAX_ATTEMPTS) {
    await doc.ref.delete();
    return { valid: false, reason: 'Too many failed attempts. Please request a new OTP.' };
  }

  // Check OTP match
  if (data.otp !== otp) {
    await doc.ref.update({ attempts: data.attempts + 1 });
    return { valid: false, reason: 'Incorrect OTP. Please try again.' };
  }

  // OTP is correct — mark as verified and clean up
  await doc.ref.update({ verified: true });
  // Delete after successful verification
  await doc.ref.delete();

  return { valid: true };
}

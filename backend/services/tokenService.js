import crypto from 'node:crypto';
import jwt from 'jsonwebtoken';
import db from '../firebase.js';
import { JWT_SECRET, JWT_REFRESH_SECRET, JWT_ACCESS_EXPIRY, JWT_REFRESH_EXPIRY } from '../config/env.js';

const REFRESH_TOKENS = 'refreshTokens';

// Admin email — used ONLY for initial role assignment (first signup/login)
export const ADMIN_EMAIL = 'flavor.alchemist9@gmail.com';

/**
 * Generate JWT access and refresh tokens.
 * @param {{ userId: string, email: string, role: string }} payload
 * @returns {{ accessToken: string, refreshToken: string }}
 */
export function generateTokens(payload) {
  const accessToken = jwt.sign(
    { userId: payload.userId, email: payload.email, role: payload.role },
    JWT_SECRET,
    { expiresIn: JWT_ACCESS_EXPIRY }
  );
  const refreshToken = jwt.sign(
    { userId: payload.userId, email: payload.email, role: payload.role },
    JWT_REFRESH_SECRET,
    // jwtid makes every refresh token unique — two logins in the same second used to get identical
    // tokens, so rotating one left its twin still valid
    { expiresIn: JWT_REFRESH_EXPIRY, jwtid: crypto.randomUUID() }
  );
  return { accessToken, refreshToken };
}

/** Verify a refresh token's signature and expiry (throws like jwt.verify). */
export function verifyRefreshToken(refreshToken) {
  return jwt.verify(refreshToken, JWT_REFRESH_SECRET);
}

// Refresh tokens are stored as SHA-256 hashes, so a leaked database export can't be replayed as sessions.
function hashToken(token) {
  return crypto.createHash('sha256').update(token).digest('hex');
}

/**
 * Store refresh token in Firestore for revocation support.
 */
export async function storeRefreshToken(userId, refreshToken) {
  const { exp } = jwt.decode(refreshToken);
  await db.collection(REFRESH_TOKENS).add({
    userId,
    tokenHash: hashToken(refreshToken),
    expiresAt: new Date(exp * 1000).toISOString(),
    createdAt: new Date().toISOString(),
  });
  await deleteExpiredRefreshTokens(userId);
}

/** Drop a user's expired refresh tokens so the collection doesn't grow forever. Never fails the caller. */
async function deleteExpiredRefreshTokens(userId) {
  try {
    const now = Date.now();
    const snapshot = await db.collection(REFRESH_TOKENS).where('userId', '==', userId).get();
    const batch = db.batch();
    let expired = 0;
    snapshot.forEach((doc) => {
      const data = doc.data();
      // Older docs stored the raw token and no expiresAt — read the expiry from the token itself
      const expiresAt = data.expiresAt
        ? Date.parse(data.expiresAt)
        : (jwt.decode(data.token || '')?.exp || 0) * 1000;
      if (expiresAt < now) {
        batch.delete(doc.ref);
        expired++;
      }
    });
    if (expired > 0) await batch.commit();
  } catch (err) {
    console.error('[Auth] Refresh token cleanup failed:', err.message);
  }
}

/**
 * Find the stored doc for a refresh token (or null if it was revoked/rotated).
 * Also matches docs written before tokens were hashed, so existing sessions keep working.
 */
export async function findRefreshToken(refreshToken, userId) {
  const byHash = await db.collection(REFRESH_TOKENS)
    .where('tokenHash', '==', hashToken(refreshToken))
    .where('userId', '==', userId)
    .limit(1)
    .get();
  if (!byHash.empty) return byHash.docs[0];

  const legacy = await db.collection(REFRESH_TOKENS)
    .where('token', '==', refreshToken)
    .where('userId', '==', userId)
    .limit(1)
    .get();
  return legacy.empty ? null : legacy.docs[0];
}

/** Revoke a refresh token on logout. Accepts hashed and legacy (raw) stored tokens. */
export async function revokeRefreshToken(refreshToken) {
  for (const [field, value] of [['tokenHash', hashToken(refreshToken)], ['token', refreshToken]]) {
    const snapshot = await db.collection(REFRESH_TOKENS).where(field, '==', value).limit(1).get();
    if (!snapshot.empty) {
      await snapshot.docs[0].ref.delete();
      return;
    }
  }
}

/**
 * Determine the role for a user. Admin email gets 'admin', everyone else gets 'user'.
 */
export function determineRole(email) {
  return email?.toLowerCase() === ADMIN_EMAIL ? 'admin' : 'user';
}

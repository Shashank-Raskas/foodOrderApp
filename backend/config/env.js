import crypto from 'node:crypto';
import dotenv from 'dotenv';

// Load environment variables
// This runs in its own module, imported first by app.js and by middleware/auth.js. ES module imports are
// evaluated before the importing file's body, so calling dotenv.config() inside app.js ran *after*
// middleware/auth.js had already read process.env.JWT_SECRET.
dotenv.config({ path: `.env.${process.env.NODE_ENV || 'development'}` });

// Render sets RENDER=true on every service, so this is true on the live backend.
export const IS_DEPLOYED = Boolean(process.env.RENDER) || process.env.NODE_ENV === 'production';

/**
 * Read a required secret. The deployed server refuses to start without it, because a fallback value
 * committed to a public repo would let anyone sign their own tokens (including admin ones).
 * Local development without a .env file gets a random secret instead, so logins reset on restart.
 */
function requireSecret(name) {
  const value = process.env[name];
  if (value) return value;
  if (IS_DEPLOYED) {
    throw new Error(`${name} is not set. Add it to the service's environment variables before starting the server.`);
  }
  console.warn(`[Config] ${name} is not set — using a random development secret (logins reset when the server restarts).`);
  return crypto.randomBytes(32).toString('hex');
}

// ── JWT Configuration ──
export const JWT_SECRET = requireSecret('JWT_SECRET');
export const JWT_REFRESH_SECRET = requireSecret('JWT_REFRESH_SECRET');
export const JWT_ACCESS_EXPIRY = process.env.JWT_ACCESS_EXPIRY || '15m';
export const JWT_REFRESH_EXPIRY = process.env.JWT_REFRESH_EXPIRY || '7d';

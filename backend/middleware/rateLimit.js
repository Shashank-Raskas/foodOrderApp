/**
 * Minimal in-memory, fixed-window rate limiter.
 * Good enough for a single Render instance; move the counters to a shared store (Redis/Firestore)
 * if the backend is ever scaled to more than one instance.
 *
 * @param {object} options
 * @param {number} options.windowMs   window length in ms
 * @param {number} options.max        requests allowed per key per window
 * @param {string} options.message    error message for the 429 response
 * @param {(req) => string|null} [options.key]  what to count by (default: client IP). Return null to skip.
 */
export function rateLimit({ windowMs, max, message, key = (req) => req.ip }) {
  const hits = new Map();

  // Forget finished windows so the map doesn't grow without bound
  setInterval(() => {
    const now = Date.now();
    for (const [k, entry] of hits) {
      if (entry.resetAt <= now) hits.delete(k);
    }
  }, windowMs).unref();

  return (req, res, next) => {
    const k = key(req);
    if (!k) return next();

    const now = Date.now();
    let entry = hits.get(k);
    if (!entry || entry.resetAt <= now) {
      entry = { count: 0, resetAt: now + windowMs };
      hits.set(k, entry);
    }
    entry.count++;

    if (entry.count > max) {
      res.setHeader('Retry-After', Math.ceil((entry.resetAt - now) / 1000));
      return res.status(429).json({ message });
    }
    next();
  };
}

/** Count by the email/destination in the request body (lower-cased), e.g. to slow password guessing per account. */
export const byBodyField = (field) => (req) => {
  const value = req.body?.[field];
  return typeof value === 'string' && value.trim() ? `${field}:${value.trim().toLowerCase()}` : null;
};

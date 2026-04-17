import jwt from 'jsonwebtoken';

const JWT_SECRET = process.env.JWT_SECRET || 'flavor_alchemist_jwt_access_secret_key_2026';

/**
 * Middleware: verifies JWT access token from Authorization header.
 * On success, attaches `req.user` with { userId, email, role }.
 */
export function authenticate(req, res, next) {
  const authHeader = req.headers.authorization;

  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ message: 'Authentication required. Please log in.' });
  }

  const token = authHeader.split(' ')[1];

  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    req.user = {
      userId: decoded.userId,
      email: decoded.email,
      role: decoded.role,
    };
    next();
  } catch (err) {
    if (err.name === 'TokenExpiredError') {
      return res.status(401).json({ message: 'Token expired. Please refresh.', code: 'TOKEN_EXPIRED' });
    }
    return res.status(401).json({ message: 'Invalid token. Please log in again.' });
  }
}

/**
 * Middleware: requires the user to have the 'admin' role.
 * Must be used AFTER `authenticate`.
 */
export function requireAdmin(req, res, next) {
  if (!req.user || req.user.role !== 'admin') {
    return res.status(403).json({ message: 'Forbidden: Admin access only.' });
  }
  next();
}

// Must be the first import: loads .env and validates secrets before any other module reads them
import { IS_DEPLOYED } from './config/env.js';
import compression from 'compression';
import express from 'express';
import authRoutes from './routes/auth.js';
import userRoutes from './routes/user.js';
import orderRoutes from './routes/orders.js';
import mealRoutes from './routes/meals.js';
import adminRoutes from './routes/admin.js';

/**
 * Build the Express app (middleware + routes) without starting a server.
 * app.js calls this and listens; the tests call it and drive it with supertest.
 */
export function createApp() {
  const app = express();

  // Render sits behind proxies; this makes req.ip the real client IP (used by the rate limiters)
  app.set('trust proxy', true);
  app.disable('x-powered-by');

  // Basic security headers for a JSON + images API (the parts of helmet that apply here).
  // No Cross-Origin-Resource-Policy header, because the frontend on another domain loads meal images from here.
  app.use((req, res, next) => {
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('X-Frame-Options', 'DENY');
    res.setHeader('Referrer-Policy', 'no-referrer');
    next();
  });

  // Gzip/Brotli compress all responses (JSON, images, HTML)
  app.use(compression());

  app.use(express.json());
  app.use(express.static('public', {
    maxAge: '7d',
    etag: true,
    lastModified: true,
    immutable: true,
  }));

  // Browser origins allowed to call the API once deployed: the Render frontend, plus any extra
  // comma-separated origins in ALLOWED_ORIGINS / FRONTEND_URL (e.g. a custom domain).
  const allowedOrigins = new Set(
    ['https://foodorderapp-99re.onrender.com', process.env.ALLOWED_ORIGINS, process.env.FRONTEND_URL]
      .filter(Boolean)
      .join(',')
      .split(',')
      .map((o) => o.trim().replace(/\/$/, ''))
      .filter(Boolean)
  );

  // Ultra-permissive CORS for development and cloud deployment
  // In production with real security, you'd be more restrictive
  // Update: once deployed (Render / NODE_ENV=production) only `allowedOrigins` get CORS headers;
  // local development still allows every origin, as before.
  app.use((req, res, next) => {
    const origin = req.headers.origin;
    const requestMethod = req.method;

    // ALWAYS allow requests - this is safe because:
    // 1. GET /meals just returns public data
    // 2. POST /orders still validates all data on backend
    // 3. Firebase auth happens on backend (environment variable)
    // Real security comes from backend validation, not CORS

    // Requests without an Origin header (curl, server-to-server, <img> loads) don't involve CORS
    if (origin && IS_DEPLOYED && !allowedOrigins.has(origin)) {
      console.warn(`[CORS] Blocked ${requestMethod} request from origin: ${origin}`);
      return res.status(403).json({ message: 'Origin not allowed.' });
    }

    // Set CORS headers
    res.setHeader('Access-Control-Allow-Origin', origin || '*');
    res.setHeader('Vary', 'Origin');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS, PATCH, HEAD');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Requested-With, Accept');
    res.setHeader('Access-Control-Allow-Credentials', 'true');
    res.setHeader('Access-Control-Max-Age', '86400');

    // Immediately respond to preflight OPTIONS requests
    if (requestMethod === 'OPTIONS') {
      return res.sendStatus(200);
    }

    next();
  });

  // Routes — paths are unchanged; they're just grouped by area now
  app.use(mealRoutes);   // GET /meals, reviews, coupon validation
  app.use(authRoutes);   // signup, login, OTP, token refresh, logout
  app.use(userRoutes);   // profile, password, loyalty, addresses, contact
  app.use(orderRoutes);  // place order, order history
  app.use(adminRoutes);  // /api/admin/*

  // ===================== Health Check =====================
  app.get('/api/health', (req, res) => {
    res.status(200).json({ status: 'ok', uptime: process.uptime(), timestamp: Date.now() });
  });

  app.use((req, res) => {
    if (req.method === 'OPTIONS') {
      return res.sendStatus(200);
    }

    res.status(404).json({ message: 'Not found' });
  });

  // Errors from route handlers (see lib/router.js) and malformed JSON bodies end up here.
  // Express recognises an error handler by its four parameters, so `next` must stay even though it's unused.
  app.use((err, req, res, next) => {
    if (err.type === 'entity.parse.failed') {
      return res.status(400).json({ message: 'Invalid JSON in request body.' });
    }
    if (err.type === 'entity.too.large') {
      return res.status(413).json({ message: 'Request body is too large.' });
    }
    console.error(`[Error] ${req.method} ${req.originalUrl}:`, err);
    res.status(500).json({ message: 'Something went wrong. Please try again.' });
  });

  return app;
}

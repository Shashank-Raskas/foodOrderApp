// Must be the first import: loads .env and validates secrets before any other module reads them
import './config/env.js';
import dns from 'node:dns';

// Force IPv4 for all DNS lookups — Render doesn't support outbound IPv6
dns.setDefaultResultOrder('ipv4first');
import { createApp } from './createApp.js';

// The Express app (middleware + routes) is built in createApp.js so tests can use it without listening
const app = createApp();

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);

  // ===================== Keep-Alive Self-Ping =====================
  // Ping ourselves every 10 minutes to prevent Render free-tier spin-down.
  // 750 free hours/month ≈ 31.25 days — covers 24/7 for a single service.
  const RENDER_URL = process.env.RENDER_EXTERNAL_URL; // Render sets this automatically
  if (RENDER_URL) {
    const PING_INTERVAL = 10 * 60 * 1000; // 10 minutes
    setInterval(async () => {
      try {
        const resp = await fetch(`${RENDER_URL}/api/health`);
        console.log(`[Keep-Alive] Pinged ${RENDER_URL}/api/health — ${resp.status}`);
      } catch (err) {
        console.warn(`[Keep-Alive] Ping failed:`, err.message);
      }
    }, PING_INTERVAL);
    console.log(`[Keep-Alive] Self-ping enabled every 10 min → ${RENDER_URL}/api/health`);
  } else {
    console.log('[Keep-Alive] No RENDER_EXTERNAL_URL set — self-ping disabled (local dev)');
  }
});

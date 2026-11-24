// Must be the first import: loads .env and validates secrets before any other module reads them
import './config/env.js';
import dns from 'node:dns';

// Force IPv4 for all DNS lookups — Render doesn't support outbound IPv6
dns.setDefaultResultOrder('ipv4first');
import { createApp } from './createApp.js';
import { warmUp, startLiveSync, chatHealth } from './rag/chat/index.js';
import { startTracing, shutdownTracing } from './rag/observability/langfuse.js';
import { onKnowledgeChange } from './lib/knowledgeEvents.js';
import db from './firebase.js';

// Langfuse tracing for the chatbot (only when its keys are set)
if (startTracing()) console.log('[Chat] Langfuse tracing on');

// Render stops the old instance with SIGTERM on every deploy: send buffered traces before exiting
process.once('SIGTERM', () => {
  shutdownTracing().finally(() => process.exit(0));
});

// The Express app (middleware + routes) is built in createApp.js so tests can use it without listening
const app = createApp();

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);

  // Load the chatbot's local models in the background, so the first customer doesn't wait for them.
  // Does nothing if the chatbot's keys aren't configured.
  warmUp()
    .then((ms) => ms && console.log(`[Chat] Models warmed up in ${ms} ms, RSS ${Math.round(process.memoryUsage().rss / 1048576)} MB`))
    .catch((err) => console.warn('[Chat] Warm-up failed (the first chat will load the models):', err.message));

  // Re-index the chatbot in the background when an admin edits the menu or a review is posted
  if (startLiveSync({ db, onKnowledgeChange })) console.log('[Chat] Live re-indexing on menu/review changes');

  // Touch the vector index every 6 hours: Qdrant's free cluster pauses after a period of inactivity,
  // and a quiet week (no chats) shouldn't take the chatbot down. Also logs if it becomes unreachable.
  setInterval(() => {
    chatHealth()
      .then((h) => h.configured && !h.index?.ok && console.warn('[Chat] Vector index unreachable:', h.index?.error))
      .catch(() => {});
  }, 6 * 60 * 60 * 1000).unref();

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

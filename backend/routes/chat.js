// POST /api/chat — the support chatbot, streamed with Server-Sent Events (SSE).
//
// Request:  { "message": "Do you have biryani?", "history": [{ "role": "user"|"assistant", "content": "…" }] }
// Response: text/event-stream of `meta`, `token` (many), then `done` — or `error`.
// SSE over a normal POST: the browser reads it with fetch() + a stream reader, and the answer
// appears word by word instead of after the whole LLM call.

import { rateLimit } from '../middleware/rateLimit.js';
import { createRouter, isNonEmptyString } from '../lib/router.js';
import { getChatService, isChatConfigured } from '../rag/chat/index.js';
import { CHAT } from '../rag/config.js';

const router = createRouter();

// Per IP: a burst limit, plus a daily cap that protects the free LLM quotas from one heavy user
const burstLimiter = rateLimit({ windowMs: 60 * 1000, max: 10, message: 'You are sending messages too quickly. Please wait a moment.' });
const dailyLimiter = rateLimit({ windowMs: 24 * 60 * 60 * 1000, max: 150, message: 'Daily chat limit reached. Please try again tomorrow, or contact support.' });

function validate(body) {
  const { message, history = [] } = body || {};
  if (!isNonEmptyString(message)) return 'Please type a message.';
  if (message.length > CHAT.maxMessageChars) return `Messages can be at most ${CHAT.maxMessageChars} characters.`;
  if (!Array.isArray(history) || history.length > 20) return 'Invalid chat history.';
  const ok = history.every((m) => m && (m.role === 'user' || m.role === 'assistant') && typeof m.content === 'string' && m.content.length <= 4000);
  return ok ? null : 'Invalid chat history.';
}

router.post('/api/chat', burstLimiter, dailyLimiter, async (req, res) => {
  if (!isChatConfigured()) return res.status(503).json({ message: 'The chat assistant is not available right now.' });
  const problem = validate(req.body);
  if (problem) return res.status(400).json({ message: problem });

  res.writeHead(200, {
    'Content-Type': 'text/event-stream; charset=utf-8',
    // no-transform: the compression middleware skips the response, so events aren't held back
    'Cache-Control': 'no-cache, no-transform',
    Connection: 'keep-alive',
    'X-Accel-Buffering': 'no', // and proxies don't buffer it either
  });
  const send = (event) => {
    res.write(`event: ${event.type}\ndata: ${JSON.stringify(event)}\n\n`);
    res.flush?.();
  };

  // Stop the LLM call when the customer closes the chat, or when the request takes too long
  const disconnected = new AbortController();
  res.on('close', () => {
    if (!res.writableEnded) disconnected.abort();
  });
  const signal = AbortSignal.any([disconnected.signal, AbortSignal.timeout(CHAT.answerTimeoutMs)]);

  try {
    const { message, history = [] } = req.body;
    for await (const event of getChatService().chat({ message: message.trim(), history, signal })) {
      if (disconnected.signal.aborted) break;
      send(event);
    }
  } catch (err) {
    if (!disconnected.signal.aborted) {
      console.error('[Chat] Failed:', err.message);
      const timedOut = signal.aborted;
      send({
        type: 'error',
        message: timedOut ? 'That took too long. Please try again.' : `Sorry, something went wrong. Please try again, or contact ${CHAT.support.email}.`,
      });
    }
  } finally {
    res.end();
  }
});

export default router;

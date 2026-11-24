// POST /api/chat — the support chatbot, streamed with Server-Sent Events (SSE).
//
// Request:  { "message": "Do you have biryani?", "history": [{ "role": "user"|"assistant", "content": "…" }],
//             "sessionId": "<random id for this browser tab's conversation, optional>" }
// Response: text/event-stream of `meta`, `token` (many), then `done` — or `error`.
// SSE over a normal POST: the browser reads it with fetch() + a stream reader, and the answer
// appears word by word instead of after the whole LLM call.

import crypto from 'node:crypto';
import { optionalAuthenticate } from '../middleware/auth.js';
import { rateLimit } from '../middleware/rateLimit.js';
import { createRouter, isNonEmptyString } from '../lib/router.js';
import { getChatService, isChatConfigured, chatHealth } from '../rag/chat/index.js';
import { CHAT } from '../rag/config.js';
import { withChatTrace, scoreTrace, TRACE_ID } from '../rag/observability/langfuse.js';

// Traces group a customer's chats under a stable, non-reversible id — never their email or name
const anonymousId = (userId) => (userId ? `u_${crypto.createHash('sha256').update(`chat:${userId}`).digest('hex').slice(0, 16)}` : undefined);
const SESSION_ID = /^[A-Za-z0-9-]{8,64}$/;

const router = createRouter();

// Per IP: a burst limit, plus a daily cap that protects the free LLM quotas from one heavy user
const burstLimiter = rateLimit({ windowMs: 60 * 1000, max: 10, message: 'You are sending messages too quickly. Please wait a moment.' });
const dailyLimiter = rateLimit({ windowMs: 24 * 60 * 60 * 1000, max: 150, message: 'Daily chat limit reached. Please try again tomorrow, or contact support.' });

function validate(body) {
  const { message, history = [] } = body || {};
  if (!isNonEmptyString(message)) return 'Please type a message.';
  if (message.length > CHAT.maxMessageChars) return `Messages can be at most ${CHAT.maxMessageChars} characters.`;
  if (!Array.isArray(history) || history.length > 20) return 'Invalid chat history.';
  if (body.sessionId !== undefined && (typeof body.sessionId !== 'string' || !SESSION_ID.test(body.sessionId))) return 'Invalid session.';
  const ok = history.every((m) => m && (m.role === 'user' || m.role === 'assistant') && typeof m.content === 'string' && m.content.length <= 4000);
  return ok ? null : 'Invalid chat history.';
}

// Signing in is optional: guests can ask about the menu and policies; order and loyalty questions
// need a valid token (an expired one gets a 401 so the frontend refreshes it).
router.post('/api/chat', burstLimiter, dailyLimiter, optionalAuthenticate, async (req, res) => {
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
    const { message, history = [], sessionId } = req.body;
    const trace = {
      userId: anonymousId(req.user?.userId),
      sessionId: typeof sessionId === 'string' && SESSION_ID.test(sessionId) ? sessionId : undefined,
      input: message.trim(),
      tags: [req.user ? 'signed-in' : 'guest'],
    };
    await withChatTrace(trace, async ({ callbacks, setOutput, traceId }) => {
      for await (const event of getChatService().chat({ message: message.trim(), history, user: req.user ?? null, signal, callbacks })) {
        if (disconnected.signal.aborted) break;
        if (event.type === 'done') {
          setOutput({ answer: event.answer, route: event.route, citations: event.citations?.map((c) => c.id), mealIds: event.mealIds });
          // The id lets the customer's 👍/👎 be attached to this exact answer in Langfuse
          if (traceId) event.traceId = traceId;
        }
        send(event);
      }
    });
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

// GET /api/chat/health — is the chatbot configured, are its models loaded, can it reach the vector
// index (and how many chunks it holds), cache and live re-index status. 503 when it can't answer.
const healthLimiter = rateLimit({ windowMs: 60 * 1000, max: 20, message: 'Too many requests.' });
router.get('/api/chat/health', healthLimiter, async (req, res) => {
  const health = await chatHealth();
  const ok = health.configured && health.index?.ok;
  res.status(ok ? 200 : 503).json({ status: ok ? 'ok' : 'unavailable', ...health });
});

// POST /api/chat/feedback — { traceId, helpful: true|false, comment? } from the 👍/👎 under an answer.
// Stored as a "user-feedback" score (1 / 0) on that answer's Langfuse trace, next to its prompts and
// retrieved sources, so a 👎 can be investigated in context. Trace ids are random 128-bit values
// only ever sent to the person who asked, so they can't be guessed to score other answers.
const feedbackLimiter = rateLimit({ windowMs: 60 * 1000, max: 30, message: 'Too many feedback requests. Please wait a moment.' });

router.post('/api/chat/feedback', feedbackLimiter, async (req, res) => {
  const { traceId, helpful, comment } = req.body || {};
  if (typeof traceId !== 'string' || !TRACE_ID.test(traceId) || typeof helpful !== 'boolean') {
    return res.status(400).json({ message: 'Invalid feedback.' });
  }
  if (comment !== undefined && (typeof comment !== 'string' || comment.length > 500)) {
    return res.status(400).json({ message: 'Comments can be at most 500 characters.' });
  }
  try {
    const recorded = await scoreTrace({ traceId, name: 'user-feedback', value: helpful ? 1 : 0, comment: comment?.trim() || undefined });
    res.status(202).json({ recorded });
  } catch (err) {
    // Feedback is best-effort: never show the customer an error for it
    console.warn('[Chat] Feedback not recorded:', err.message);
    res.status(202).json({ recorded: false });
  }
});

export default router;

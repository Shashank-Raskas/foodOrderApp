// Langfuse tracing (free cloud tier). Every chat request becomes ONE trace — "SupportChat" — with
// the question, route, retrieval steps (filters, scores), the exact prompts sent to Gemini/Groq,
// outputs, token counts, which provider answered, and the time of each step.
//
// How it hooks in: LangChain callbacks. A Langfuse CallbackHandler in the run config records every
// chain, retriever, LLM, tool and LangGraph node automatically; no logging code lives in the
// pipeline. A root observation opened per request makes retrieval and answering (two separate
// LangChain runs) children of the same trace. Spans are exported through OpenTelemetry in the
// background (batched), so tracing never slows down or breaks a chat: if Langfuse is unreachable,
// the answer is unaffected.
//
// Off unless LANGFUSE_PUBLIC_KEY and LANGFUSE_SECRET_KEY are set, and always off in tests.

import '../env.js';
import { CallbackHandler } from '@langfuse/langchain';
import { LangfuseSpanProcessor } from '@langfuse/otel';
import { startActiveObservation, propagateAttributes, getActiveTraceId } from '@langfuse/tracing';
import { NodeTracerProvider } from '@opentelemetry/sdk-trace-node';

let provider = null;
let processor = null;

export const isTracingEnabled = () =>
  Boolean(process.env.LANGFUSE_PUBLIC_KEY && process.env.LANGFUSE_SECRET_KEY) && process.env.NODE_ENV !== 'test';

/** Starts the exporter once (no-op without keys). Returns whether tracing is on. */
export function startTracing() {
  if (provider) return true;
  if (!isTracingEnabled()) return false;
  processor = new LangfuseSpanProcessor({
    publicKey: process.env.LANGFUSE_PUBLIC_KEY,
    secretKey: process.env.LANGFUSE_SECRET_KEY,
    baseUrl: process.env.LANGFUSE_BASE_URL || process.env.LANGFUSE_BASEURL || 'https://cloud.langfuse.com',
    environment: process.env.RENDER ? 'production' : 'development',
  });
  provider = new NodeTracerProvider({ spanProcessors: [processor] });
  provider.register();
  return true;
}

/**
 * Runs one chat request inside a trace. `fn` receives { callbacks, setOutput, traceId }:
 * pass `callbacks` into the LangChain run config, call setOutput(result) when done, and give
 * `traceId` to the client so its 👍/👎 can be attached to this trace.
 * Without tracing, callbacks and traceId are undefined and setOutput does nothing.
 *
 * userId must already be anonymous (a hash), never an email or a name.
 */
export async function withChatTrace({ userId, sessionId, input, tags = [] }, fn) {
  if (!startTracing()) return fn({ callbacks: undefined, setOutput: () => {}, traceId: undefined });

  return startActiveObservation('SupportChat', (span) =>
    propagateAttributes({ userId, sessionId }, async () => {
      let output;
      span.update({ input });
      const handler = new CallbackHandler({ userId, sessionId, tags: ['support-chat', ...tags] });
      try {
        return await fn({ callbacks: [handler], setOutput: (value) => { output = value; }, traceId: getActiveTraceId() });
      } finally {
        span.update({ output });
        span.setTraceIO({ input, output });
      }
    }),
  );
}

export const TRACE_ID = /^[a-f0-9]{32}$/;

/**
 * Attaches a score to a trace (e.g. a customer's 👍 = 1 / 👎 = 0, or an eval result), through
 * Langfuse's public scores API. Returns false if tracing is off; throws if Langfuse rejects it.
 */
export async function scoreTrace({ traceId, name, value, comment }, { fetchImpl = fetch, enabled = isTracingEnabled() } = {}) {
  if (!enabled || !TRACE_ID.test(String(traceId))) return false;
  const auth = Buffer.from(`${process.env.LANGFUSE_PUBLIC_KEY}:${process.env.LANGFUSE_SECRET_KEY}`).toString('base64');
  const base = process.env.LANGFUSE_BASE_URL || process.env.LANGFUSE_BASEURL || 'https://cloud.langfuse.com';
  const res = await fetchImpl(`${base}/api/public/scores`, {
    method: 'POST',
    headers: { Authorization: `Basic ${auth}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ traceId, name, value, dataType: 'NUMERIC', ...(comment && { comment }) }),
    signal: AbortSignal.timeout(5000),
  });
  if (!res.ok) throw new Error(`Langfuse score rejected: ${res.status}`);
  return true;
}

/** Sends any buffered spans now (on shutdown, and in scripts that exit right after a request). */
export async function flushTraces() {
  await processor?.forceFlush();
}

export async function shutdownTracing() {
  await provider?.shutdown();
  provider = null;
  processor = null;
}

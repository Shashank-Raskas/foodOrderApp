// RAG phase 7: Langfuse tracing (off in tests / without keys), scores, and the feedback endpoint.
import { describe, it, expect, jest } from '@jest/globals';
import { withChatTrace, scoreTrace, isTracingEnabled, TRACE_ID } from '../rag/observability/langfuse.js';
import { freshApp, request } from './support/helpers.js';

const TRACE = 'a'.repeat(32);

describe('withChatTrace', () => {
  it('is a no-op without Langfuse keys: no callbacks, no trace id, same result', async () => {
    expect(isTracingEnabled()).toBe(false);
    const fn = jest.fn(async ({ callbacks, traceId, setOutput }) => {
      setOutput({ answer: 'x' });
      return { callbacks, traceId };
    });
    expect(await withChatTrace({ userId: 'u_1', sessionId: 's-12345678', input: 'hi' }, fn)).toEqual({ callbacks: undefined, traceId: undefined });
    expect(fn).toHaveBeenCalledTimes(1);
  });
});

describe('scoreTrace', () => {
  const ok = () => jest.fn(async () => ({ ok: true, status: 200 }));

  it('posts a numeric score to the trace with basic auth', async () => {
    process.env.LANGFUSE_PUBLIC_KEY = 'pk-test';
    process.env.LANGFUSE_SECRET_KEY = 'sk-test';
    process.env.LANGFUSE_BASE_URL = 'https://lf.example';
    try {
      const fetchImpl = ok();
      expect(await scoreTrace({ traceId: TRACE, name: 'user-feedback', value: 1, comment: 'great' }, { fetchImpl, enabled: true })).toBe(true);
      const [url, init] = fetchImpl.mock.calls[0];
      expect(url).toBe('https://lf.example/api/public/scores');
      expect(init.headers.Authorization).toBe(`Basic ${Buffer.from('pk-test:sk-test').toString('base64')}`);
      expect(JSON.parse(init.body)).toEqual({ traceId: TRACE, name: 'user-feedback', value: 1, dataType: 'NUMERIC', comment: 'great' });
    } finally {
      for (const k of ['LANGFUSE_PUBLIC_KEY', 'LANGFUSE_SECRET_KEY', 'LANGFUSE_BASE_URL']) delete process.env[k];
    }
  });

  it('does nothing when tracing is off or the trace id is malformed; throws if Langfuse rejects it', async () => {
    const fetchImpl = ok();
    expect(await scoreTrace({ traceId: TRACE, name: 'x', value: 1 }, { fetchImpl })).toBe(false);
    expect(await scoreTrace({ traceId: 'not-a-trace', name: 'x', value: 1 }, { fetchImpl, enabled: true })).toBe(false);
    expect(fetchImpl).not.toHaveBeenCalled();
    await expect(scoreTrace({ traceId: TRACE, name: 'x', value: 1 }, { fetchImpl: async () => ({ ok: false, status: 401 }), enabled: true })).rejects.toThrow(/401/);
    expect(TRACE_ID.test(TRACE)).toBe(true);
  });
});

describe('POST /api/chat/feedback', () => {
  it('accepts 👍/👎 for a trace (recorded=false without Langfuse keys)', async () => {
    const res = await request(await freshApp()).post('/api/chat/feedback').send({ traceId: TRACE, helpful: false, comment: 'wrong price' });
    expect(res.status).toBe(202);
    expect(res.body).toEqual({ recorded: false });
  });

  it.each([
    [{ helpful: true }],
    [{ traceId: 'abc', helpful: true }],
    [{ traceId: TRACE, helpful: 'yes' }],
    [{ traceId: TRACE, helpful: true, comment: 'x'.repeat(501) }],
  ])('rejects invalid feedback %#', async (body) => {
    expect((await request(await freshApp()).post('/api/chat/feedback').send(body)).status).toBe(400);
  });
});

describe('POST /api/chat session ids', () => {
  it('accepts a well-formed session id and rejects anything else', async () => {
    const app = await freshApp();
    const { setChatServiceForTests } = await import('../rag/chat/index.js');
    setChatServiceForTests({
      async *chat() {
        yield { type: 'done', answer: 'ok', citations: [], mealIds: [] };
      },
    });
    try {
      expect((await request(app).post('/api/chat').send({ message: 'hi', sessionId: 'a1b2c3d4-e5f6-4a7b-8c9d-0e1f2a3b4c5d' })).status).toBe(200);
      expect((await request(app).post('/api/chat').send({ message: 'hi', sessionId: '<script>' })).status).toBe(400);
      expect((await request(app).post('/api/chat').send({ message: 'hi', sessionId: 42 })).status).toBe(400);
    } finally {
      setChatServiceForTests(null);
    }
  });
});

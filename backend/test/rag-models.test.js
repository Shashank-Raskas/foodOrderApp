// Model failover: a slow primary (Gemini) must hand over to the fallback (Groq) after its own
// time limit, instead of using up the whole request budget.
import { describe, it, expect } from '@jest/globals';
import { RunnableLambda } from '@langchain/core/runnables';
import { structuredWithFallback } from '../rag/llm/models.js';
import { LLM } from '../rag/config.js';
import { stubEnv } from './support/stubs.js';

// Stand-ins exposing withStructuredOutput, like LangChain chat models
const fakeModel = (name, delayMs) => ({
  withStructuredOutput: () => RunnableLambda.from(async (_input, config) => {
    await new Promise((resolve, reject) => {
      const t = setTimeout(resolve, delayMs);
      config?.signal?.addEventListener('abort', () => {
        clearTimeout(t);
        reject(new Error('aborted'));
      });
    });
    return { from: name };
  }),
});

describe('structuredWithFallback', () => {
  it('a primary slower than its limit is abandoned and the fallback answers', async () => {
    stubEnv('RAG_GEMINI_TIMEOUT_ANALYSIS_MS', '80');
    expect(LLM.primaryTimeoutMs.analysis).toBe(80);
    const started = Date.now();
    const out = await structuredWithFallback({ primary: fakeModel('gemini', 1000), fallback: fakeModel('groq', 10) }, null, 'x').invoke('q');
    expect(out).toEqual({ from: 'groq' });
    expect(Date.now() - started).toBeLessThan(600);
  });

  it('a primary within its limit answers itself', async () => {
    stubEnv('RAG_GEMINI_TIMEOUT_ANALYSIS_MS', '500');
    expect(await structuredWithFallback({ primary: fakeModel('gemini', 10), fallback: fakeModel('groq', 10) }, null, 'x').invoke('q')).toEqual({ from: 'gemini' });
  });

  it('without a fallback, the primary runs with no extra limit', async () => {
    stubEnv('RAG_GEMINI_TIMEOUT_ANALYSIS_MS', '20');
    expect(await structuredWithFallback({ primary: fakeModel('gemini', 60), fallback: null }, null, 'x').invoke('q')).toEqual({ from: 'gemini' });
  });

  it('defaults: Gemini gets 2.5 s for analysis, 5 s for answers, 4 s for tools', () => {
    expect(LLM.primaryTimeoutMs).toEqual({ analysis: 2500, answer: 5000, tools: 4000 });
  });
});

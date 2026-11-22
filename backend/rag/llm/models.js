// Chat models, both on free tiers: Gemini (primary) and Groq (fallback). Callers get LangChain
// Runnables, so failover is just .withFallbacks() — if Gemini is rate-limited or down, the same
// request goes to Groq with no change to the calling code.

import { ChatGoogleGenerativeAI } from '@langchain/google-genai';
import { ChatGroq } from '@langchain/groq';
import { CHAT, LLM } from '../config.js';
import { requireEnv } from '../env.js';

const common = { temperature: 0, maxRetries: 1 };

export function createFastModels() {
  return {
    // No retries on the primary: on a 429/503 the fallback answers immediately, instead of the
    // user waiting through backoff (the eval saw ~45 s stalls with retries on)
    primary: new ChatGoogleGenerativeAI({ ...common, maxRetries: 0, model: LLM.fastModel, apiKey: requireEnv('GEMINI_API_KEY') }),
    fallback: process.env.GROQ_API_KEY ? new ChatGroq({ ...common, model: LLM.fastFallbackModel, apiKey: process.env.GROQ_API_KEY }) : null,
  };
}

/** The answer model: Gemini, failing over to Groq. Streams tokens either way. */
export function createAnswerModel() {
  const answer = { ...common, maxRetries: 0, temperature: 0.2 };
  const primary = new ChatGoogleGenerativeAI({ ...answer, model: LLM.answerModel, maxOutputTokens: CHAT.maxOutputTokens, apiKey: requireEnv('GEMINI_API_KEY') });
  if (!process.env.GROQ_API_KEY) return primary;
  const fallback = new ChatGroq({ ...answer, maxRetries: 1, model: LLM.answerFallbackModel, maxTokens: CHAT.maxOutputTokens, apiKey: process.env.GROQ_API_KEY });
  return primary.withFallbacks([fallback]);
}

/**
 * The tool-calling model for the account agent. Returns an object with bindTools(tools), so the
 * agent binds its per-user tools to both providers and keeps the Gemini → Groq failover.
 * (Tested: both call the tools correctly, including two tools at once.)
 */
export function createToolModel() {
  const opts = { ...common, maxRetries: 0, temperature: 0 };
  const primary = new ChatGoogleGenerativeAI({ ...opts, model: LLM.fastModel, maxOutputTokens: CHAT.maxOutputTokens, apiKey: requireEnv('GEMINI_API_KEY') });
  const fallback = process.env.GROQ_API_KEY
    ? new ChatGroq({ ...opts, maxRetries: 1, model: LLM.answerFallbackModel, maxTokens: CHAT.maxOutputTokens, apiKey: process.env.GROQ_API_KEY })
    : null;
  return {
    bindTools(tools) {
      const main = primary.bindTools(tools);
      return fallback ? main.withFallbacks([fallback.bindTools(tools)]) : main;
    },
  };
}

/** primary.withStructuredOutput(schema), failing over to the fallback model with the same schema. */
export function structuredWithFallback({ primary, fallback }, schema, name) {
  const main = primary.withStructuredOutput(schema, { name });
  return fallback ? main.withFallbacks([fallback.withStructuredOutput(schema, { name })]) : main;
}

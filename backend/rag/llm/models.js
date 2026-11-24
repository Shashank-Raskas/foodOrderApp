// Chat models, both on free tiers: Gemini (primary) and Groq (fallback). Callers get LangChain
// Runnables, so failover is just .withFallbacks() — if Gemini is rate-limited, down or *slow*, the
// same request goes to Groq with no change to the calling code.
//
// "Slow" matters as much as "down": each Gemini call gets its own time limit (LLM.primaryTimeoutMs),
// after which LangChain aborts it and tries Groq. Without it, one overall timeout covered both, so
// a slow Gemini used up the whole budget and Groq never got a turn (seen on Render).

import { ChatGoogleGenerativeAI } from '@langchain/google-genai';
import { ChatGroq } from '@langchain/groq';
import { CHAT, LLM } from '../config.js';
import { requireEnv } from '../env.js';

const common = { temperature: 0, maxRetries: 1 };

/** primary with its own time limit, then the fallback (if configured). */
function withTimedFallback(primary, fallback, timeoutMs) {
  return fallback ? primary.withConfig({ timeout: timeoutMs }).withFallbacks([fallback]) : primary;
}

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
  const fallback = process.env.GROQ_API_KEY
    ? new ChatGroq({ ...answer, maxRetries: 1, model: LLM.answerFallbackModel, maxTokens: CHAT.maxOutputTokens, apiKey: process.env.GROQ_API_KEY })
    : null;
  return withTimedFallback(primary, fallback, LLM.primaryTimeoutMs.answer);
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
      return withTimedFallback(primary.bindTools(tools), fallback?.bindTools(tools), LLM.primaryTimeoutMs.tools);
    },
  };
}

/**
 * The judge for the answer-quality eval: Groq's gpt-oss-120b, a different model family from the
 * Gemini answerer, so the judge isn't grading its own style. Falls back to Gemini without a Groq key.
 */
export function createJudgeModel() {
  if (process.env.GROQ_API_KEY) {
    return new ChatGroq({ ...common, maxRetries: 3, model: process.env.GROQ_JUDGE_MODEL || 'openai/gpt-oss-120b', apiKey: process.env.GROQ_API_KEY });
  }
  return new ChatGoogleGenerativeAI({ ...common, maxRetries: 3, model: LLM.answerModel, apiKey: requireEnv('GEMINI_API_KEY') });
}

/** primary.withStructuredOutput(schema), failing over to the fallback model with the same schema. */
export function structuredWithFallback({ primary, fallback }, schema, name) {
  return withTimedFallback(
    primary.withStructuredOutput(schema, { name }),
    fallback?.withStructuredOutput(schema, { name }),
    LLM.primaryTimeoutMs.analysis,
  );
}

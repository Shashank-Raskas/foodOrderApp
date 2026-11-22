// Chat models, both on free tiers: Gemini (primary) and Groq (fallback). Callers get LangChain
// Runnables, so failover is just .withFallbacks() — if Gemini is rate-limited or down, the same
// request goes to Groq with no change to the calling code.

import { ChatGoogleGenerativeAI } from '@langchain/google-genai';
import { ChatGroq } from '@langchain/groq';
import { LLM } from '../config.js';
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

/** primary.withStructuredOutput(schema), failing over to the fallback model with the same schema. */
export function structuredWithFallback({ primary, fallback }, schema, name) {
  const main = primary.withStructuredOutput(schema, { name });
  return fallback ? main.withFallbacks([fallback.withStructuredOutput(schema, { name })]) : main;
}

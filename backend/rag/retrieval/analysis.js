// Query analysis — the first retrieval step. One structured LLM call does three jobs:
//   1. rewrite a follow-up into a standalone question ("and the cheaper one?" → "Which is cheaper,
//      Paneer Tikka or Palak Paneer?") so retrieval doesn't depend on chat history
//   2. classify the intent, which picks the route: retrieval, a tool (orders, loyalty), or a polite refusal
//   3. extract filters ("veg under 300, spicy") that Qdrant applies *before* scoring
// One call rather than three keeps latency and free-tier request counts down.
//
// Degrades gracefully: Gemini → Groq (.withFallbacks) → a rule-based analyzer, so retrieval keeps
// working even with both LLMs rate-limited. The rules are also the deterministic baseline in the eval.

import { z } from 'zod';
import { ChatPromptTemplate, MessagesPlaceholder } from '@langchain/core/prompts';
import { RunnableLambda } from '@langchain/core/runnables';
import { AIMessage, HumanMessage } from '@langchain/core/messages';
import { RETRIEVAL } from '../config.js';

export const INTENTS = ['menu', 'reviews', 'policy', 'order_status', 'loyalty', 'chitchat', 'out_of_scope'];
export const SPICE_LEVELS = ['non-spicy', 'mild', 'medium', 'hot', 'extra-hot'];
export const CATEGORIES = ['entrees', 'sides', 'desserts', 'appetizers', 'beverages', 'soups'];

// Gemini rejects JSON-schema "nullable" unions, so optional fields use .optional(), never .nullable()
export const AnalysisSchema = z.object({
  standaloneQuestion: z.string().describe('The question rewritten to make sense without the chat history'),
  intent: z.enum(INTENTS).describe('What the user wants'),
  isVeg: z.boolean().optional().describe('true only if the user asked for veg/vegetarian; false only if they asked for non-veg/meat'),
  maxPrice: z.number().optional().describe('Upper price limit in rupees, only if stated'),
  minPrice: z.number().optional().describe('Lower price limit in rupees, only if stated'),
  spiceLevels: z.array(z.enum(SPICE_LEVELS)).optional().describe('Acceptable spice levels, only if spiciness was mentioned'),
  category: z.enum(CATEGORIES).optional().describe('Menu category, only if clearly asked for'),
});

const SYSTEM = `You analyse questions sent to the support assistant of The Flavor Alchemist, a food delivery restaurant in Hyderabad.
Return:
- standaloneQuestion: if the latest message depends on the chat history ("it", "that one", "the cheaper one"), rewrite it so it is understandable on its own. If it is already understandable, return it unchanged. Never add the restaurant's name or any words the user did not imply, and do not answer it.
- intent:
  menu = dishes, ingredients, prices, recommendations, what's available
  reviews = what other customers think of a dish, ratings
  policy = ordering, delivery, payments, refunds, cancellations, accounts, privacy, terms and conditions, legal questions (disputes, courts, governing law, age limits), contact details and support hours
  order_status = the user's own orders (where is my order, my last order, track)
  loyalty = the user's own reward points or offers on their account
  chitchat = greetings, thanks, small talk
  out_of_scope = anything unrelated to this restaurant or food ordering
- filters, ONLY when the user states them:
  isVeg: true for veg/vegetarian/vegan, false for non-veg/chicken/meat/fish requests in general
  maxPrice / minPrice in rupees ("under 300" → maxPrice 300; "above 500" → minPrice 500)
  spiceLevels: "spicy" → ["medium","hot","extra-hot"]; "very/extra spicy" → ["hot","extra-hot"]; "not spicy"/"mild" → ["non-spicy","mild"]
  category: entrees (mains), sides, desserts (sweets), appetizers (starters, snacks), beverages (drinks), soups
Never invent filters the user did not ask for.`;

export const analysisPrompt = ChatPromptTemplate.fromMessages([
  ['system', SYSTEM],
  new MessagesPlaceholder('history'),
  ['human', '{question}'],
]);

const toMessages = (history = []) =>
  history.slice(-6).map((m) => (m.role === 'assistant' ? new AIMessage(m.content) : new HumanMessage(m.content)));

// ---------- rule-based analyzer (fallback + deterministic eval baseline) ----------

const has = (text, re) => re.test(text);

export function analyzeWithRules({ question }) {
  const q = ` ${question.toLowerCase()} `;
  const analysis = { standaloneQuestion: question.trim(), intent: 'menu' };

  // Patterns match word stems (deliver\w* covers delivered/delivery) — exact words were too brittle
  if (has(q, /\b(where('?s| is)|track\w*|status of|has my|did my|when will my)\b.*\border\b|\bmy (last|latest|recent|previous) orders?\b|\border (status|history)\b/)) analysis.intent = 'order_status';
  else if (has(q, /\b(loyalty|rewards?|points)\b/)) analysis.intent = 'loyalty';
  else if (has(q, /\b(reviews?|ratings?|rated|people say|customers think)\b/)) analysis.intent = 'reviews';
  else if (has(q, /\b(refund\w*|cancel\w*|deliver\w*|pay\w*|upi|card|cashfree|razorpay|phonepe|promo\w*|coupons?|accounts?|sign ?up|register\w*|password|otp|address\w*|privacy|data|terms|polic\w+|age|old|court|legal|law\w*|complain\w*|escalat\w*|support|contact|hours|minimum|schedul\w*|tomorrow|later|wrong|someone else'?s|stale|cold food|money back|log ?in)\b/)) analysis.intent = 'policy';
  else if (has(q, /^\s*(hi|hello|hey|thanks|thank you|good (morning|evening))\b/)) analysis.intent = 'chitchat';

  if (analysis.intent !== 'menu' && analysis.intent !== 'reviews') return analysis;

  // "non-veg" is checked first because it contains "veg"
  if (has(q, /\bnon[- ]?veg(etarian)?\b/)) analysis.isVeg = false;
  else if (has(q, /\b(veg|vegetarian|vegan|veggie)\b/)) analysis.isVeg = true;

  const max = q.match(/\b(?:under|below|less than|cheaper than|within|upto|up to|max(?:imum)?)\s*(?:rs\.?|₹|inr)?\s*(\d{2,5})\b/);
  if (max) analysis.maxPrice = Number(max[1]);
  const min = q.match(/\b(?:above|over|more than|at least)\s*(?:rs\.?|₹|inr)?\s*(\d{2,5})\b/);
  if (min) analysis.minPrice = Number(min[1]);

  if (has(q, /\b(not spicy|non[- ]spicy|no spice|mild)\b/)) analysis.spiceLevels = ['non-spicy', 'mild'];
  else if (has(q, /\b(very|extra|really|super) (spicy|hot)\b|\bfiery\b/)) analysis.spiceLevels = ['hot', 'extra-hot'];
  else if (has(q, /\bspicy\b/)) analysis.spiceLevels = ['medium', 'hot', 'extra-hot'];

  const categoryWords = [
    ['desserts', /\b(desserts?|sweets?|sweet dish)\b/],
    ['appetizers', /\b(starters?|appetizers?|snacks?)\b/],
    ['beverages', /\b(drinks?|beverages?|shakes?|lassi|coffee|tea|chai)\b/],
    ['soups', /\bsoups?\b/],
    ['sides', /\bsides?( dish(es)?)?\b/],
    ['entrees', /\b(mains?|main course|entrees?)\b/],
  ];
  for (const [category, re] of categoryWords) {
    if (has(q, re)) {
      analysis.category = category;
      break;
    }
  }
  return analysis;
}

// ---------- normalisation shared by both analyzers ----------

export function normalizeAnalysis(raw, question) {
  const a = AnalysisSchema.safeParse(raw);
  if (!a.success) return analyzeWithRules({ question });
  const out = { ...a.data };
  if (!out.standaloneQuestion?.trim()) out.standaloneQuestion = question;
  for (const k of ['maxPrice', 'minPrice']) if (!(out[k] > 0)) delete out[k];
  if (out.spiceLevels && !out.spiceLevels.length) delete out.spiceLevels;
  // Filters only make sense for menu-type questions
  if (out.intent !== 'menu' && out.intent !== 'reviews') {
    for (const k of ['isVeg', 'maxPrice', 'minPrice', 'spiceLevels', 'category']) delete out[k];
  }
  return out;
}

/**
 * The query analyzer as a LangChain Runnable: { question, history } → analysis.
 * `structuredModel` is e.g. structuredWithFallback(models, AnalysisSchema, 'query_analysis');
 * pass null to use the rules only (offline, or for the eval baseline).
 *
 * mode (default from RETRIEVAL.analyzerMode / RAG_ANALYZER_MODE):
 *   'llm'  — LLM for every question: best routing and filters (96.6% Recall@5 on batch 1), ~2 s
 *   'auto' — LLM only for follow-ups (there is chat history to resolve), rules otherwise:
 *            93.8% Recall@5 in ~0 ms, and no LLM quota used for standalone questions
 * timeoutMs: an LLM call slower than this falls back (free tiers can stall for tens of seconds).
 */
export function createQueryAnalyzer(structuredModel, { mode = RETRIEVAL.analyzerMode, timeoutMs = 4000 } = {}) {
  const rules = RunnableLambda.from((input) => ({ ...analyzeWithRules(input), analyzer: 'rules' })).withConfig({ runName: 'RuleAnalyzer' });
  if (!structuredModel) return rules.withConfig({ runName: 'QueryAnalysis' });

  const llm = RunnableLambda.from(async ({ question, history = [] }, config) => {
    const messages = await analysisPrompt.formatMessages({ question, history: toMessages(history) });
    const raw = await structuredModel.invoke(messages, { ...config, timeout: timeoutMs });
    const analysis = normalizeAnalysis(raw, question);
    // Without history there is nothing to resolve, so search with the user's own words: in the
    // eval, "helpful" rewrites ("…at The Flavor Alchemist?") dragged unrelated pages into results
    if (!history.length) analysis.standaloneQuestion = question.trim();
    return { ...analysis, analyzer: 'llm' };
  }).withConfig({ runName: 'LLMAnalyzer' });

  // Last-resort fallback: if every LLM fails or times out, the rules still produce a usable analysis
  const llmWithFallback = llm.withFallbacks([rules]);
  if (mode === 'llm') return llmWithFallback.withConfig({ runName: 'QueryAnalysis' });
  return RunnableLambda.from((input, config) => (input.history?.length ? llmWithFallback : rules).invoke(input, config)).withConfig({ runName: 'QueryAnalysis' });
}

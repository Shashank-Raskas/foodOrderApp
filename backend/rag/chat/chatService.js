// The chat service: one customer message in, a stream of events out.
//
//   { type: 'meta',  route, intent, lowConfidence, relaxedFilters }   what the pipeline decided
//   { type: 'token', text }                                           answer text, as it is written
//   { type: 'done',  answer, citations, mealIds, route, timings }      the final, validated result
//
// Retrieval decides the route; only 'retrieve' with confident results calls the answer LLM.
// Everything else gets a fixed reply: cheaper, instant, and it can't hallucinate.

import { CHAT } from '../config.js';
import { answerInput, parseCitations } from '../generation/answer.js';
import { runAccountAgent } from '../graph/accountAgent.js';
import { ACCOUNT_PAGES } from '../tools/accountTools.js';

const { email, phone, hours } = CHAT.support;

export const REPLIES = {
  chitchat: "Hi! I'm the Flavor Alchemist assistant. Ask me about our menu, prices, delivery, payments, refunds or your account.",
  refuse: 'Sorry, I can only help with The Flavor Alchemist: our menu, ordering, delivery, payments and policies.',
  signIn: 'Please sign in so I can look up your orders and loyalty points. You can also see them any time under "My Orders" and in your profile.',
  unknown: `I couldn't find that in our information. Please contact our support team at ${email} or ${phone} (${hours}).`,
};

// Links to the account pages behind the tools that were used, in the same shape as citations
const accountCitations = (toolsUsed) =>
  toolsUsed.filter((t) => ACCOUNT_PAGES[t]).map((t, i) => ({ n: i + 1, id: `account:${t}`, title: ACCOUNT_PAGES[t].title, url: ACCOUNT_PAGES[t].url, docType: 'account' }));

/**
 * retrieval:   the phase 3 pipeline (Runnable)
 * answerChain: the phase 4 grounded answer chain (Runnable)
 * agentFor:    (userId) → the account agent graph with tools bound to that user (phase 5)
 * cache, embedQuery: the semantic cache and the function that embeds a question (phase 8)
 */
export function createChatService({ retrieval, answerChain, agentFor = null, includeContext = false, cache = null, embedQuery = null }) {
  // Evaluation only: attach the exact sources the answer was generated from, so a judge can check
  // faithfulness. Never enabled for the API (the route uses the default), so clients don't get it.
  const contextOf = (documents) => (includeContext ? { context: documents.map((d, i) => ({ n: i + 1, id: d.metadata.id, text: d.metadata.context ?? d.pageContent })) } : {});
  async function* fixedReply(text, route, extra = {}) {
    yield { type: 'token', text };
    yield { type: 'done', answer: text, citations: [], mealIds: [], route, ...extra };
  }

  return {
    async *chat({ message, history = [], user = null, signal, callbacks }) {
      const config = { signal, callbacks };

      // Semantic cache: only standalone questions (a follow-up's answer depends on the conversation)
      const useCache = Boolean(cache && embedQuery && !history.length && !includeContext);
      let questionVector = null;
      if (useCache) {
        const t = Date.now();
        questionVector = await embedQuery(message);
        const hit = cache.get(questionVector, message);
        if (hit) {
          const { route, intent, done } = hit.value;
          yield { type: 'meta', route, intent, lowConfidence: false, relaxedFilters: false, cached: true };
          yield { type: 'token', text: done.answer };
          yield { type: 'done', ...done, cached: true, timings: { cache: Date.now() - t } };
          return;
        }
      }
      // Only general, confident answers are cached — never account answers or "I don't know"
      const remember = (intent, done) => {
        if (useCache) cache.set(questionVector, message, { route: done.route, intent, done: { answer: done.answer, citations: done.citations, mealIds: done.mealIds, route: done.route } });
      };

      const retrieved = await retrieval.invoke({ question: message, history }, config);
      const { route, analysis, documents, lowConfidence, relaxedFilters, timings } = retrieved;
      yield { type: 'meta', route, intent: analysis.intent, lowConfidence, relaxedFilters };

      if (route === 'chitchat' || route === 'refuse') {
        remember(analysis.intent, { answer: REPLIES[route], citations: [], mealIds: [], route });
        yield* fixedReply(REPLIES[route], route, { timings });
        return;
      }

      if (route === 'tool') {
        if (!user?.userId || !agentFor) {
          yield* fixedReply(REPLIES.signIn, route, { signInRequired: true, timings });
          return;
        }
        const started = Date.now();
        let result = null;
        for await (const event of runAccountAgent({ graph: agentFor(user.userId), question: message, history, signal, callbacks })) {
          if (event.type === 'token') yield event;
          else result = event;
        }
        timings.agent = Date.now() - started;
        if (!result?.answer) {
          yield* fixedReply(REPLIES.unknown, route, { timings });
          return;
        }
        yield { type: 'done', answer: result.answer, citations: accountCitations(result.toolsUsed), mealIds: [], route, toolsUsed: result.toolsUsed, timings };
        return;
      }
      if (lowConfidence || !documents.length) {
        yield* fixedReply(REPLIES.unknown, route, { lowConfidence: true, timings });
        return;
      }

      const started = Date.now();
      let text = '';
      const stream = await answerChain.stream(answerInput({ question: message, history, documents, relaxedFilters }), config);
      for await (const chunk of stream) {
        if (!chunk) continue;
        text += chunk;
        yield { type: 'token', text: chunk };
      }
      timings.answer = Date.now() - started;

      if (!text.trim()) {
        yield* fixedReply(REPLIES.unknown, route, { lowConfidence: true, timings });
        return;
      }
      const result = parseCitations(text, documents);
      // A relaxed-filter answer ("nothing matched exactly, here are close options") isn't reused
      if (!relaxedFilters) remember(analysis.intent, { ...result, route });
      yield { type: 'done', ...result, route, timings, ...contextOf(documents) };
    },
  };
}

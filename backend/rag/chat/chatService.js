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
 */
export function createChatService({ retrieval, answerChain, agentFor = null, includeContext = false }) {
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
      const retrieved = await retrieval.invoke({ question: message, history }, config);
      const { route, analysis, documents, lowConfidence, relaxedFilters, timings } = retrieved;
      yield { type: 'meta', route, intent: analysis.intent, lowConfidence, relaxedFilters };

      if (route === 'chitchat' || route === 'refuse') {
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
      yield { type: 'done', ...parseCitations(text, documents), route, timings, ...contextOf(documents) };
    },
  };
}

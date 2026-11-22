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

const { email, phone, hours } = CHAT.support;

export const REPLIES = {
  chitchat: "Hi! I'm the Flavor Alchemist assistant. Ask me about our menu, prices, delivery, payments, refunds or your account.",
  refuse: 'Sorry, I can only help with The Flavor Alchemist: our menu, ordering, delivery, payments and policies.',
  // Phase 5 replaces this with real order / loyalty lookups for signed-in users
  tool: 'I can\'t look up your account from here yet. After signing in, you can see your orders under "My Orders" and your reward points in your profile.',
  unknown: `I couldn't find that in our information. Please contact our support team at ${email} or ${phone} (${hours}).`,
};

export function createChatService({ retrieval, answerChain }) {
  async function* fixedReply(text, route, extra = {}) {
    yield { type: 'token', text };
    yield { type: 'done', answer: text, citations: [], mealIds: [], route, ...extra };
  }

  return {
    async *chat({ message, history = [], signal, callbacks }) {
      const config = { signal, callbacks };
      const retrieved = await retrieval.invoke({ question: message, history }, config);
      const { route, analysis, documents, lowConfidence, relaxedFilters, timings } = retrieved;
      yield { type: 'meta', route, intent: analysis.intent, lowConfidence, relaxedFilters };

      if (route === 'chitchat' || route === 'refuse' || route === 'tool') {
        yield* fixedReply(REPLIES[route], route, { timings });
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
      yield { type: 'done', ...parseCitations(text, documents), route, timings };
    },
  };
}

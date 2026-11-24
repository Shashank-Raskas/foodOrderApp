// Semantic cache: reuse the answer to a question that means the same as one answered recently.
//
// Free-tier quotas are the real constraint here: a cache hit skips both LLM calls (analysis and
// answer), and answers in milliseconds instead of seconds. "Means the same" is decided by the
// embedding model (cosine similarity of the question vectors) — so "is delivery free?" and
// "do you charge for delivery?" can share an answer — plus strict guards, because two questions can
// be very similar in meaning yet need different answers:
//   - the numbers must match exactly       ("veg under 300" ≠ "veg under 200")
//   - the filter words must match exactly  ("veg" ≠ "non-veg", "spicy" ≠ "not spicy")
// Never cached: follow-ups (they depend on the conversation), account answers (personal),
// "I don't know" replies, and failures. Entries expire, and the whole cache is cleared whenever the
// chatbot's index changes (menu edit, new review), so a cached price is never stale.

import { CACHE } from '../config.js';

// Words that change what a question asks for even when its meaning is otherwise identical
const FILTER_WORDS = new Set([
  'veg', 'vegetarian', 'vegan', 'non', 'nonveg', 'egg', 'chicken', 'mutton', 'lamb', 'fish', 'prawn', 'prawns', 'seafood', 'beef', 'pork',
  'spicy', 'mild', 'hot', 'not', 'no', 'without', 'with', 'under', 'below', 'above', 'over', 'less', 'more', 'cheap', 'cheapest', 'expensive',
  'breakfast', 'lunch', 'dinner', 'dessert', 'desserts', 'starter', 'starters', 'drink', 'drinks', 'soup', 'soups',
]);

/** What must match exactly between two questions for them to share an answer. */
export function guardKey(question) {
  const words = String(question).toLowerCase().normalize('NFKD').match(/[a-z]+|\d+/g) || [];
  const numbers = words.filter((w) => /^\d+$/.test(w));
  const filters = [...new Set(words.filter((w) => FILTER_WORDS.has(w)))].sort();
  return `${numbers.join(',')}|${filters.join(',')}`;
}

const dot = (a, b) => {
  let s = 0;
  for (let i = 0; i < a.length; i++) s += a[i] * b[i];
  return s; // vectors are L2-normalized, so this is cosine similarity
};

export function createSemanticCache({ maxEntries = CACHE.maxEntries, ttlMs = CACHE.ttlMs, minSimilarity = CACHE.minSimilarity, now = () => Date.now() } = {}) {
  let entries = []; // newest last: { vector, guard, question, value, at, hits }
  const stats = { hits: 0, misses: 0, stores: 0, clears: 0 };

  const fresh = (e) => now() - e.at < ttlMs;

  return {
    /** The cached answer for a question with this vector, or null. */
    get(vector, question) {
      const guard = guardKey(question);
      let best = null;
      let bestScore = minSimilarity;
      for (const e of entries) {
        if (e.guard !== guard || !fresh(e)) continue;
        const score = dot(vector, e.vector);
        if (score >= bestScore) {
          best = e;
          bestScore = score;
        }
      }
      if (!best) {
        stats.misses++;
        return null;
      }
      stats.hits++;
      best.hits++;
      return { value: best.value, similarity: bestScore, cachedQuestion: best.question };
    },

    set(vector, question, value) {
      entries = entries.filter(fresh);
      entries.push({ vector, guard: guardKey(question), question, value, at: now(), hits: 0 });
      // Least-recently-added first out once full (a small cache: a few hundred answers)
      if (entries.length > maxEntries) entries = entries.slice(entries.length - maxEntries);
      stats.stores++;
    },

    clear() {
      entries = [];
      stats.clears++;
    },

    stats() {
      return { ...stats, size: entries.filter(fresh).length, minSimilarity, ttlMinutes: Math.round(ttlMs / 60000) };
    },
  };
}

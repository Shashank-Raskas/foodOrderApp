// MMR (Maximal Marginal Relevance) selection over already-scored candidates.
//
// Greedy: repeatedly pick the candidate maximising
//     λ · relevance(c)  −  (1 − λ) · max similarity(c, anything already picked)
// so each pick must be relevant *and* add something new. λ = 1 is plain top-k by relevance;
// λ = 0 is pure diversity.
//
// LangChain's maximalMarginalRelevance() measures relevance as cosine to the query vector. Here
// relevance is the cross-encoder's score instead — a much better relevance signal — and cosine
// between the candidates' dense vectors measures redundancy.

const cosine = (a, b) => {
  let dot = 0, na = 0, nb = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    na += a[i] * a[i];
    nb += b[i] * b[i];
  }
  return na && nb ? dot / Math.sqrt(na * nb) : 0;
};

/** Returns the indices of the k selected candidates, in pick order. */
export function mmrSelect({ relevance, vectors, k, lambda }) {
  const n = relevance.length;
  if (!n) return [];
  // Rescale relevance to 0–1 so it is on the same scale as cosine similarity
  const max = Math.max(...relevance);
  const min = Math.min(...relevance);
  const rel = relevance.map((r) => (max === min ? 1 : (r - min) / (max - min)));

  const picked = [];
  const remaining = new Set(relevance.map((_, i) => i));
  while (picked.length < Math.min(k, n)) {
    let best = -1;
    let bestScore = -Infinity;
    for (const i of remaining) {
      const redundancy = picked.length ? Math.max(...picked.map((j) => cosine(vectors[i], vectors[j]))) : 0;
      const score = lambda * rel[i] - (1 - lambda) * redundancy;
      if (score > bestScore) {
        bestScore = score;
        best = i;
      }
    }
    picked.push(best);
    remaining.delete(best);
  }
  return picked;
}

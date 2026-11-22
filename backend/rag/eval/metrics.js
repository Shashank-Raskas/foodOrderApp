// Retrieval metrics over a ranked list of chunk ids and the set of relevant (correct) ids.
//
//   Recall@k  share of the relevant chunks found in the top k. When there are more relevant
//             chunks than k, the denominator is k (finding 5 of 26 vegan dishes in a top 5 is perfect).
//   Hit@k     1 if at least one relevant chunk is in the top k — "could the LLM answer at all?"
//   MRR       Mean Reciprocal Rank: 1/rank of the first relevant chunk (1st → 1, 2nd → 0.5, missing → 0).
//             Rewards putting a correct answer at the very top.
//   nDCG@k    normalized Discounted Cumulative Gain: every relevant chunk counts, discounted by
//             log2(rank + 1), divided by the best possible ordering — rewards good *ordering*.

export function recallAtK(ranked, relevant, k) {
  if (!relevant.length) return null;
  const rel = new Set(relevant);
  const found = ranked.slice(0, k).filter((id) => rel.has(id)).length;
  return found / Math.min(relevant.length, k);
}

export function hitAtK(ranked, relevant, k) {
  if (!relevant.length) return null;
  const rel = new Set(relevant);
  return ranked.slice(0, k).some((id) => rel.has(id)) ? 1 : 0;
}

export function reciprocalRank(ranked, relevant) {
  if (!relevant.length) return null;
  const rel = new Set(relevant);
  const index = ranked.findIndex((id) => rel.has(id));
  return index === -1 ? 0 : 1 / (index + 1);
}

export function ndcgAtK(ranked, relevant, k) {
  if (!relevant.length) return null;
  const rel = new Set(relevant);
  const dcg = ranked.slice(0, k).reduce((sum, id, i) => sum + (rel.has(id) ? 1 / Math.log2(i + 2) : 0), 0);
  let ideal = 0;
  for (let i = 0; i < Math.min(relevant.length, k); i++) ideal += 1 / Math.log2(i + 2);
  return dcg / ideal;
}

const mean = (values) => {
  const v = values.filter((x) => x !== null && x !== undefined);
  return v.length ? v.reduce((a, b) => a + b, 0) / v.length : null;
};

/** rows: [{ ranked: [ids], relevant: [ids] }] → mean metrics */
export function summarize(rows, k = 5) {
  return {
    n: rows.filter((r) => r.relevant.length).length,
    recallAtK: mean(rows.map((r) => recallAtK(r.ranked, r.relevant, k))),
    hitAtK: mean(rows.map((r) => hitAtK(r.ranked, r.relevant, k))),
    mrr: mean(rows.map((r) => reciprocalRank(r.ranked, r.relevant))),
    // Same k as the others: the pipeline hands the LLM only k documents, so that's what counts
    ndcgAtK: mean(rows.map((r) => ndcgAtK(r.ranked, r.relevant, k))),
  };
}

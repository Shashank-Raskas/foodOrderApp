// BM25 (Best Matching 25) as Qdrant sparse vectors — the keyword half of hybrid search.
// Dense embeddings capture meaning but blur exact terms ("pav bhaji", "Cashfree", "₹299");
// BM25 matches them exactly.
//
// BM25 score(term, doc) = IDF(term) · tf·(k1+1) / (tf + k1·(1 − b + b·docLen/avgDocLen))
//   tf part  — saturates: the 5th "spicy" adds far less than the 1st (k1 controls how fast)
//   length   — long documents are normalized down so they don't win just by containing more words (b)
//   IDF      — applied by Qdrant at query time (modifier: "idf"), from its own corpus statistics
// We store the tf·length part per document; a query vector is just weight 1 per unique term.

import { BM25 } from '../config.js';

const STOP_WORDS = new Set(
  ('a an and are as at be but by can do does for from has have how i if in into is it its me my no not of on or our ' +
    'so than that the their them then there these they this to was we were what when where which who why will with ' +
    'you your am any all also been being did get got i\'m it\'s just more most much very would could should').split(' '),
);

// Light plural folding so "dishes"/"dish" and "fries"/"fry" match; no full stemmer needed for this corpus
function stem(token) {
  if (token.length > 4 && token.endsWith('ies')) return `${token.slice(0, -3)}y`;
  if (token.length > 4 && /(ches|shes|sses|xes|zes)$/.test(token)) return token.slice(0, -2);
  if (token.length > 3 && token.endsWith('s') && !/(ss|us|is)$/.test(token)) return token.slice(0, -1);
  return token;
}

export function tokenize(text) {
  const words = String(text)
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '') // strip accents
    .match(/[a-z0-9]+/g);
  if (!words) return [];
  return words.filter((w) => !STOP_WORDS.has(w) && (w.length > 1 || /\d/.test(w))).map(stem);
}

// Token → sparse dimension. FNV-1a 32-bit hash: no vocabulary file to store or keep in sync;
// a rare collision just merges two terms' weights.
export function tokenId(token) {
  let hash = 0x811c9dc5;
  for (let i = 0; i < token.length; i++) {
    hash ^= token.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return hash >>> 0;
}

function termCounts(tokens) {
  const counts = new Map();
  for (const t of tokens) {
    const id = tokenId(t);
    counts.set(id, (counts.get(id) || 0) + 1);
  }
  return counts;
}

export function averageDocLength(texts) {
  if (!texts.length) return 1;
  return texts.reduce((sum, t) => sum + tokenize(t).length, 0) / texts.length || 1;
}

export function bm25DocVector(text, { avgDocLength, k1 = BM25.k1, b = BM25.b }) {
  const tokens = tokenize(text);
  const lengthNorm = 1 - b + (b * tokens.length) / avgDocLength;
  const indices = [];
  const values = [];
  for (const [id, tf] of termCounts(tokens)) {
    indices.push(id);
    values.push((tf * (k1 + 1)) / (tf + k1 * lengthNorm));
  }
  return { indices, values };
}

export function bm25QueryVector(text) {
  const indices = [...termCounts(tokenize(text)).keys()];
  return { indices, values: indices.map(() => 1) };
}

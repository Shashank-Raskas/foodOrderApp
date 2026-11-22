// Tunables for the RAG (Retrieval-Augmented Generation) ingestion pipeline.
// Bump CHUNKER_VERSION whenever chunking logic or templates change: the manifest diff then
// treats every chunk as changed, forcing a full re-embed (old vectors would no longer match).

export const CHUNKER_VERSION = 1;

export const POLICY_CHUNK = {
  // Policy sections longer than this are split. ~400 tokens keeps one idea per chunk
  // while staying well under the embedding model's 512-token input limit.
  maxTokens: 400,
  // ~12% overlap so a sentence cut at a boundary still appears whole in one chunk
  overlapTokens: 50,
  // Recursive split order: paragraphs → lines → sentences → words → characters (last resort)
  separators: ['\n\n', '\n', '. ', ' ', ''],
};

export const REVIEWS = {
  // Most recent comments kept per meal, and their maximum length
  maxComments: 5,
  maxCommentChars: 240,
  // Meals with fewer reviews than this get no reviews chunk (too little signal)
  minReviews: 1,
};

// Dense embeddings: BAAI bge-small-en-v1.5 (384 dimensions), run in-process by transformers.js.
// Free (no API, no rate limit). q8 = int8-quantized ONNX weights: ~4x smaller, a little faster,
// with a negligible accuracy loss. bge uses the [CLS] token's vector (pooling: 'cls'), and queries
// (not passages) get an instruction prefix — "asymmetric" retrieval, as the model was trained.
export const EMBEDDING = {
  model: 'Xenova/bge-small-en-v1.5',
  dimensions: 384,
  dtype: 'q8',
  pooling: 'cls',
  queryInstruction: 'Represent this sentence for searching relevant passages: ',
  batchSize: 16,
};

// Sparse (keyword) vectors: BM25 term weights computed here; Qdrant applies IDF itself
// (sparse vector "modifier: idf"), so rare words count more without us tracking corpus stats.
export const BM25 = { version: 1, k1: 1.2, b: 0.75 };

// The live index is whatever collection the alias points to. A rebuild creates a new collection,
// verifies it, then moves the alias in one atomic call (zero-downtime; rollback = move it back).
export const INDEX = {
  alias: 'kb',
  collectionPrefix: 'kb',
  keepPrevious: 1, // old collections kept for rollback (the free cluster has 1 GB)
};

// Cross-encoder reranker: reads (question, chunk) *together*, so it judges relevance far more
// precisely than comparing two separately-made vectors — but it's too slow to run over the whole
// index, so it only re-scores the top candidates from hybrid search. ~23 MB quantized.
export const RERANKER = { model: 'Xenova/ms-marco-MiniLM-L-6-v2', dtype: 'q8' };

export const RETRIEVAL = {
  prefetchK: 30, // candidates fetched by each of dense and BM25 before fusion
  candidates: 20, // fused candidates handed to the reranker
  finalK: 5, // documents given to the LLM
  // MMR trade-off: 1 = pure relevance, 0 = pure diversity. Tuned with the eval (batch 1):
  // λ 0.5 / 0.7 / 0.9 cost 9 / 8 / 5 points of Recall@5 versus no MMR, because here the
  // "similar" results are usually *all* correct (four biryanis for "do you have biryani?").
  // So MMR is off by default (see DEFAULT_STAGES) and 0.9 is the setting when it is switched on.
  mmrLambda: 0.9,
  // "I don't know" threshold on the best cross-encoder score (0–1), for policy questions only.
  // Measured (batch 1): unanswerable questions ≤ 9e-5, weakest answerable policy question 4.7e-3,
  // so 5e-4 separates them with margin. Not applied to menu questions: the model (trained on web
  // search Q&A) scores vague browsing like "something sweet under 200" as low as nonsense, even
  // when the results are right — there the grounded answer prompt handles "nothing matches".
  minRelevance: 5e-4,
  minRelevanceIntents: ['policy'],
  // Query analysis: 'llm' = Gemini → Groq for every question (best quality: 96.6% vs 93.8%
  // Recall@5 on batch 1, ~2 s); 'auto' = LLM only for follow-ups, rules otherwise (~0 ms).
  // Both providers are free tier with no billing attached, so quality wins by default.
  get analyzerMode() {
    return process.env.RAG_ANALYZER_MODE || 'llm';
  },
};

// Free-tier LLMs behind LangChain's .withFallbacks(). Model names are env-configurable because
// providers retire them (gemini-2.5-flash was already closed to new keys).
// Getters, so the values are read when used (after .env files are loaded), not at import time.
export const LLM = {
  get fastModel() {
    return process.env.GEMINI_FAST_MODEL || 'gemini-3.1-flash-lite';
  },
  get fastFallbackModel() {
    return process.env.GROQ_FAST_MODEL || 'openai/gpt-oss-20b';
  },
};

// Anything that changes stored vectors is part of the signature; a different signature means the
// existing collection is stale and a full rebuild into a new one is needed.
export const INDEX_SIGNATURE_PARTS = () => [`chunker${CHUNKER_VERSION}`, EMBEDDING.model, EMBEDDING.dtype, EMBEDDING.pooling, `bm25v${BM25.version}`];

// Rough token estimate: English averages ~4 characters per token for WordPiece/BPE tokenizers.
// Good enough for sizing chunks; the exact tokenizer is used only at embedding time.
export function approxTokens(text) {
  return Math.ceil(text.length / 4);
}

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

// ONNX Runtime starts one thread per visible core. A Render free instance sees the host's cores
// but is only allowed a fraction of one CPU, so many threads mostly wait on each other (CPU-quota
// throttling). One thread there; ONNX's default (all cores) locally. RAG_ONNX_THREADS overrides.
export function onnxSessionOptions() {
  const threads = Number(process.env.RAG_ONNX_THREADS) || (process.env.RENDER ? 1 : 0);
  return threads ? { intraOpNumThreads: threads, interOpNumThreads: 1 } : undefined;
}

export const RETRIEVAL = {
  prefetchK: 30, // candidates fetched by each of dense and BM25 before fusion
  candidates: 20, // fused candidates kept from hybrid search
  // Cross-encoder cost is linear in pairs scored, and Render's free instance (~0.1 CPU) took
  // 13–15 s for 20 pairs (0.3 s locally). So only the top N fused candidates are reranked, and only
  // for the intents listed (env-tunable without a code change; values chosen with the eval).
  // Eval (batch 1): top 8 = same Recall@5 as top 20 (96.6%), better MRR (0.972 vs 0.944) and
  // nDCG@5 (94.8% vs 93.2%), at 40% of the cost; top 5 drops recall to 94.4%.
  get rerankCandidates() {
    return Number(process.env.RAG_RERANK_CANDIDATES) || 8;
  },
  get rerankIntents() {
    return (process.env.RAG_RERANK_INTENTS || 'menu,reviews,policy').split(',').map((s) => s.trim()).filter(Boolean);
  },
  finalK: 5, // documents given to the LLM
  // MMR trade-off: 1 = pure relevance, 0 = pure diversity. Tuned with the eval (batch 1):
  // λ 0.5 / 0.7 / 0.9 cost 9 / 8 / 5 points of Recall@5 versus no MMR, because here the
  // "similar" results are usually *all* correct (four biryanis for "do you have biryani?").
  // So MMR is off by default (see DEFAULT_STAGES) and 0.9 is the setting when it is switched on.
  mmrLambda: 0.9,
  // "I don't know" short-cut on the best cross-encoder score (0–1), for policy questions only: below
  // it, the fixed "I couldn't find that" reply is sent without calling the answer LLM.
  // History: 5e-4 (batch 1) wrongly refused "How do I contact customer care?" (3.4e-4); and in
  // batch 2 "What happens if I'm not home when the rider arrives?" scored 1.85e-5 — inside the
  // unanswerable range (1.3–1.7e-5) — so no threshold separates them. The answer-quality eval then
  // showed the grounded answer LLM itself declined 6/6 unanswerable questions. So the threshold now
  // only catches near-zero matches, and borderline questions get a real (grounded) answer.
  // Not applied to menu questions: the model (trained on web search Q&A) scores vague browsing
  // like "something sweet under 200" as low as nonsense, even when the results are right.
  minRelevance: 1e-5,
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
  // qwen, not gpt-oss-20b: the answer-quality eval showed gpt-oss fills unused optional fields with
  // null (rejected by the schema) — 0/4 valid analyses vs 4/4 for qwen — so whenever Gemini was
  // slow, the fallback failed too and analysis dropped to the rules.
  get fastFallbackModel() {
    return process.env.GROQ_FAST_MODEL || 'qwen/qwen3.8-27b';
  },
  // Answer models, picked by a streaming test on the free tier (time to first token):
  // gemini-3.1-flash-lite ~0.6 s; gemini-3.5-flash ~18 s; gemini-3.8-flash 503 "high demand";
  // Groq qwen3.8-27b ~0.3 s with clean [n] citations (gpt-oss-120b writes 【n】 instead).
  get answerModel() {
    return process.env.GEMINI_ANSWER_MODEL || 'gemini-3.1-flash-lite';
  },
  get answerFallbackModel() {
    return process.env.GROQ_ANSWER_MODEL || 'qwen/qwen3.8-27b';
  },
  // How long Gemini gets before the same request goes to Groq. Measured on Render: Gemini took
  // 4+ s for query analysis (1.5–2 s locally) and 3–6.7 s for answers, while Groq answers in
  // 0.2–1.3 s. Groq stays the fallback, not the primary: its free tier allows far fewer tokens per
  // minute, and each answer prompt is a few thousand tokens.
  get primaryTimeoutMs() {
    return {
      analysis: Number(process.env.RAG_GEMINI_TIMEOUT_ANALYSIS_MS) || 2500,
      answer: Number(process.env.RAG_GEMINI_TIMEOUT_ANSWER_MS) || 5000,
      tools: Number(process.env.RAG_GEMINI_TIMEOUT_TOOLS_MS) || 4000,
    };
  },
};

// /api/chat limits. Small on purpose: they bound cost (free-tier quotas), latency and prompt size.
export const CHAT = {
  maxMessageChars: 500,
  maxHistoryMessages: 6, // last 3 exchanges are enough to resolve "it" / "the cheaper one"
  maxHistoryChars: 1500, // per history message
  maxSourceChars: 1500, // per retrieved document in the prompt
  maxOutputTokens: 500,
  answerTimeoutMs: 30000, // whole request, including retrieval
  support: { email: 'flavoralchemist9@gmail.com', phone: '040-4857-2936', hours: '9:00 AM – 11:00 PM IST' },
};

// Anything that changes stored vectors is part of the signature; a different signature means the
// existing collection is stale and a full rebuild into a new one is needed.
export const INDEX_SIGNATURE_PARTS = () => [`chunker${CHUNKER_VERSION}`, EMBEDDING.model, EMBEDDING.dtype, EMBEDDING.pooling, `bm25v${BM25.version}`];

// Rough token estimate: English averages ~4 characters per token for WordPiece/BPE tokenizers.
// Good enough for sizing chunks; the exact tokenizer is used only at embedding time.
export function approxTokens(text) {
  return Math.ceil(text.length / 4);
}

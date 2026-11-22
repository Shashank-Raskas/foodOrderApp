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

// Rough token estimate: English averages ~4 characters per token for WordPiece/BPE tokenizers.
// Good enough for sizing chunks; the exact tokenizer is used only at embedding time.
export function approxTokens(text) {
  return Math.ceil(text.length / 4);
}

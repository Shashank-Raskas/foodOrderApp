// Cross-encoder reranking as a LangChain BaseDocumentCompressor (the interface LangChain's
// ContextualCompressionRetriever uses), running ms-marco-MiniLM-L-6-v2 locally with transformers.js.
//
// Bi-encoder (embeddings): question and chunk are embedded separately, then compared — fast,
// works over millions of chunks, but coarse. Cross-encoder: question and chunk go through the model
// together, so every word can attend to every other — much more precise, but one model run per pair,
// so it only re-scores the ~20 candidates hybrid search already found.

import { BaseDocumentCompressor } from '@langchain/core/retrievers/document_compressors';
import { RERANKER, onnxSessionOptions } from '../config.js';
import { MODEL_CACHE_DIR } from '../env.js';

const sigmoid = (x) => 1 / (1 + Math.exp(-x));

// Loads tokenizer + model on first use; returns score(query, texts) → raw logits
async function loadCrossEncoder({ model, dtype }) {
  const { AutoTokenizer, AutoModelForSequenceClassification, env } = await import('@huggingface/transformers');
  env.cacheDir = MODEL_CACHE_DIR;
  const [tokenizer, net] = await Promise.all([
    AutoTokenizer.from_pretrained(model),
    AutoModelForSequenceClassification.from_pretrained(model, { dtype, session_options: onnxSessionOptions() }),
  ]);
  return async (query, texts) => {
    const inputs = tokenizer(new Array(texts.length).fill(query), { text_pair: texts, padding: true, truncation: true, max_length: 512 });
    const { logits } = await net(inputs);
    return logits.tolist().map((row) => row[0]);
  };
}

export class CrossEncoderReranker extends BaseDocumentCompressor {
  constructor({ model = RERANKER.model, dtype = RERANKER.dtype, topN = null, scorerFactory = loadCrossEncoder } = {}) {
    super();
    Object.assign(this, { model, dtype, topN, scorerFactory });
    this.scorerPromise = null;
  }

  scorer() {
    if (!this.scorerPromise) {
      this.scorerPromise = this.scorerFactory({ model: this.model, dtype: this.dtype }).catch((err) => {
        this.scorerPromise = null;
        throw err;
      });
    }
    return this.scorerPromise;
  }

  /** Returns the documents sorted by relevance, each with metadata.rerankScore in 0–1. */
  async compressDocuments(documents, query) {
    if (!documents.length) return [];
    const score = await this.scorer();
    const logits = await score(query, documents.map((d) => d.pageContent));
    const ranked = documents
      .map((doc, i) => {
        doc.metadata = { ...doc.metadata, rerankScore: sigmoid(logits[i]) };
        return doc;
      })
      .sort((a, b) => b.metadata.rerankScore - a.metadata.rerankScore);
    return this.topN ? ranked.slice(0, this.topN) : ranked;
  }
}

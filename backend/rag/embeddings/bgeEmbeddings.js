// A LangChain Embeddings implementation for bge-small, run locally with transformers.js.
// (@langchain/community's HuggingFaceTransformersEmbeddings is deprecated, and it can't add bge's
// query instruction — so this small class implements the interface directly.)
//
//   embedDocuments(texts) → passages, embedded as-is, in batches
//   embedQuery(text)      → "Represent this sentence for searching relevant passages: " + text
//
// Vectors are L2-normalized, so cosine similarity = dot product.

import { Embeddings } from '@langchain/core/embeddings';
import { EMBEDDING, onnxSessionOptions } from '../config.js';
import { MODEL_CACHE_DIR } from '../env.js';

// Loads the ONNX model on first use only: importing this file costs nothing, which keeps the
// server's memory flat until the chatbot is actually used.
async function loadExtractor({ model, dtype }) {
  const { pipeline, env } = await import('@huggingface/transformers');
  env.cacheDir = MODEL_CACHE_DIR;
  return pipeline('feature-extraction', model, { dtype, session_options: onnxSessionOptions() });
}

export class BgeEmbeddings extends Embeddings {
  constructor({ model = EMBEDDING.model, dtype = EMBEDDING.dtype, pooling = EMBEDDING.pooling, batchSize = EMBEDDING.batchSize, queryInstruction = EMBEDDING.queryInstruction, extractorFactory = loadExtractor } = {}) {
    // maxConcurrency 1: one ONNX session, run sequentially (parallel calls would only fight for CPU)
    super({ maxConcurrency: 1 });
    Object.assign(this, { model, dtype, pooling, batchSize, queryInstruction, extractorFactory });
    this.extractorPromise = null;
  }

  extractor() {
    // Cache the promise, not the result, so concurrent first calls share one model load
    if (!this.extractorPromise) {
      this.extractorPromise = this.extractorFactory({ model: this.model, dtype: this.dtype }).catch((err) => {
        this.extractorPromise = null; // allow a retry after e.g. a network failure
        throw err;
      });
    }
    return this.extractorPromise;
  }

  async embed(texts) {
    const extract = await this.extractor();
    const vectors = [];
    for (let i = 0; i < texts.length; i += this.batchSize) {
      const output = await extract(texts.slice(i, i + this.batchSize), { pooling: this.pooling, normalize: true });
      vectors.push(...output.tolist());
    }
    return vectors;
  }

  embedDocuments(texts) {
    return this.caller.call(() => this.embed(texts));
  }

  async embedQuery(text) {
    const [vector] = await this.caller.call(() => this.embed([this.queryInstruction + text]));
    return vector;
  }
}

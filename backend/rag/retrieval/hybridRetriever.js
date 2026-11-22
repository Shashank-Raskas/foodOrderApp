// A LangChain retriever over the hybrid store: question in, Documents out. Being a BaseRetriever,
// it composes into LCEL chains and LangGraph nodes, and its runs show up in tracing callbacks.
// Phase 3 wraps it with query rewriting, filter extraction, MMR and reranking.

import { BaseRetriever } from '@langchain/core/retrievers';

export class HybridRetriever extends BaseRetriever {
  static lc_name() {
    return 'HybridRetriever';
  }

  lc_namespace = ['rag', 'retrievers'];

  constructor({ store, k = 10, prefetchK = 20, filter, mode = 'hybrid', ...rest }) {
    super(rest);
    Object.assign(this, { store, k, prefetchK, filter, mode });
  }

  async _getRelevantDocuments(query) {
    const results =
      this.mode === 'dense'
        ? await this.store.similaritySearchVectorWithScore(await this.store.embeddings.embedQuery(query), this.k, this.filter)
        : this.mode === 'sparse'
          ? await this.store.sparseSearch(query, this.k, this.filter)
          : await this.store.hybridSearch(query, { k: this.k, prefetchK: this.prefetchK, filter: this.filter });
    // The score travels with the document so later stages (rerank, citations, traces) can see it
    return results.map(([doc, score]) => {
      doc.metadata = { ...doc.metadata, score };
      return doc;
    });
  }
}

// A LangChain VectorStore over Qdrant with hybrid (dense + sparse) search.
// @langchain/qdrant only supports a single unnamed dense vector, so this implements the
// VectorStore interface on the official client instead. Because it *is* a LangChain VectorStore,
// asRetriever(), similaritySearch() and maxMarginalRelevanceSearch() all work as usual, and
// hybridSearch() adds what the stock integration can't do.
//
// Collection layout — one point per chunk:
//   vectors:  dense (384-d, cosine, HNSW index) + bm25 (sparse, IDF applied by Qdrant)
//   payload:  { content, metadata, bm25AvgDl } — LangChain's content/metadata convention
//   id:       UUID v5 of the chunk id: stable, so re-indexing a chunk overwrites it in place

import { VectorStore } from '@langchain/core/vectorstores';
import { Document } from '@langchain/core/documents';
import { maximalMarginalRelevance } from '@langchain/core/utils/math';
import { v5 as uuidv5 } from 'uuid';
import { EMBEDDING } from '../config.js';
import { bm25DocVector, bm25QueryVector } from '../sparse/bm25.js';

const POINT_NAMESPACE = '6f0f3d4e-7c1a-4b8e-9d2f-1a2b3c4d5e6f';
export const pointId = (chunkId) => uuidv5(chunkId, POINT_NAMESPACE);

export const DENSE = 'dense';
export const SPARSE = 'bm25';

// Payload fields filtered on at query time get an index, so filtering stays fast as data grows
export const PAYLOAD_INDEXES = {
  'metadata.id': 'keyword',
  'metadata.docType': 'keyword',
  'metadata.category': 'keyword',
  'metadata.mealId': 'keyword',
  'metadata.parentId': 'keyword',
  'metadata.spiceLevel': 'keyword',
  'metadata.isVeg': 'bool',
  'metadata.price': 'float',
};

// Creating an index that already exists is a no-op, so this also upgrades older collections
export async function ensurePayloadIndexes(client, name) {
  for (const [field, schema] of Object.entries(PAYLOAD_INDEXES)) {
    await client.createPayloadIndex(name, { field_name: field, field_schema: schema, wait: true });
  }
}

export async function createCollection(client, name) {
  await client.createCollection(name, {
    vectors: { [DENSE]: { size: EMBEDDING.dimensions, distance: 'Cosine' } },
    sparse_vectors: { [SPARSE]: { modifier: 'idf' } },
  });
  await ensurePayloadIndexes(client, name);
}

// Structured filters (extracted from the question by query analysis) → a Qdrant filter
export function buildFilter({ docType, isVeg, maxPrice, minPrice, category, spiceLevels } = {}) {
  const must = [];
  if (docType) must.push({ key: 'metadata.docType', match: Array.isArray(docType) ? { any: docType } : { value: docType } });
  if (typeof isVeg === 'boolean') must.push({ key: 'metadata.isVeg', match: { value: isVeg } });
  if (category) must.push({ key: 'metadata.category', match: { value: category } });
  if (spiceLevels?.length) must.push({ key: 'metadata.spiceLevel', match: { any: spiceLevels } });
  if (Number.isFinite(maxPrice) || Number.isFinite(minPrice)) {
    must.push({ key: 'metadata.price', range: { ...(Number.isFinite(minPrice) && { gte: minPrice }), ...(Number.isFinite(maxPrice) && { lte: maxPrice }) } });
  }
  return must.length ? { must } : undefined;
}

const toDocument = (point) =>
  new Document({ id: point.payload?.metadata?.id, pageContent: point.payload?.content ?? '', metadata: point.payload?.metadata ?? {} });

export class QdrantHybridStore extends VectorStore {
  _vectorstoreType() {
    return 'qdrant-hybrid';
  }

  constructor(embeddings, { client, collectionName, avgDocLength = 1 }) {
    super(embeddings, {});
    this.client = client;
    this.collectionName = collectionName;
    this.avgDocLength = avgDocLength; // BM25 length normalization for documents written by this store
  }

  // ---------- write ----------

  async addDocuments(documents) {
    const vectors = await this.embeddings.embedDocuments(documents.map((d) => d.pageContent));
    return this.addVectors(vectors, documents);
  }

  async addVectors(vectors, documents) {
    const points = documents.map((doc, i) => ({
      id: pointId(doc.id ?? doc.metadata.id),
      vector: { [DENSE]: vectors[i], [SPARSE]: bm25DocVector(doc.pageContent, { avgDocLength: this.avgDocLength }) },
      payload: { content: doc.pageContent, metadata: doc.metadata, bm25AvgDl: this.avgDocLength },
    }));
    // Batches keep each request well under Qdrant's request size limit
    for (let i = 0; i < points.length; i += 64) {
      await this.client.upsert(this.collectionName, { wait: true, points: points.slice(i, i + 64) });
    }
    return points.map((p) => p.id);
  }

  async delete({ ids }) {
    if (!ids?.length) return;
    await this.client.delete(this.collectionName, { wait: true, points: ids.map(pointId) });
  }

  // ---------- read ----------

  // Dense-only search (VectorStore contract; used by similaritySearch and asRetriever)
  async similaritySearchVectorWithScore(query, k, filter) {
    const { points } = await this.client.query(this.collectionName, { query, using: DENSE, limit: k, filter, with_payload: true });
    return points.map((p) => [toDocument(p), p.score]);
  }

  // Keyword-only search (for comparisons / ablations)
  async sparseSearch(text, k = 10, filter) {
    const sparse = bm25QueryVector(text);
    if (!sparse.indices.length) return [];
    const { points } = await this.client.query(this.collectionName, { query: sparse, using: SPARSE, limit: k, filter, with_payload: true });
    return points.map((p) => [toDocument(p), p.score]);
  }

  /**
   * Hybrid search: dense and BM25 candidate lists fetched in one request (prefetch), then merged
   * by Qdrant with RRF (Reciprocal Rank Fusion: score = Σ 1/(60 + rank)). RRF fuses *ranks*, so
   * cosine similarities and BM25 scores never have to be put on the same scale.
   * Filters apply inside each prefetch, before scoring.
   */
  async hybridSearch(text, { k = 10, prefetchK = 20, filter, withVectors = false } = {}) {
    const dense = await this.embeddings.embedQuery(text);
    const sparse = bm25QueryVector(text);
    const prefetch = [{ query: dense, using: DENSE, limit: prefetchK, filter }];
    // A question made only of stop words has no keyword vector; dense alone still answers it
    if (sparse.indices.length) prefetch.push({ query: sparse, using: SPARSE, limit: prefetchK, filter });
    const { points } = await this.client.query(this.collectionName, {
      prefetch, query: { fusion: 'rrf' }, limit: k, with_payload: true, ...(withVectors && { with_vector: [DENSE] }),
    });
    // withVectors: third element is the chunk's dense vector (for MMR), kept out of metadata
    return points.map((p) => (withVectors ? [toDocument(p), p.score, p.vector?.[DENSE]] : [toDocument(p), p.score]));
  }

  /**
   * MMR (Maximal Marginal Relevance): fetch fetchK candidates, then greedily pick k that are relevant
   * to the query but not redundant with picks so far. lambda 1 = pure relevance, 0 = pure diversity.
   */
  async maxMarginalRelevanceSearch(text, { k = 5, fetchK = 20, lambda = 0.5, filter } = {}) {
    const queryVector = await this.embeddings.embedQuery(text);
    const { points } = await this.client.query(this.collectionName, {
      query: queryVector, using: DENSE, limit: fetchK, filter, with_payload: true, with_vector: [DENSE],
    });
    if (!points.length) return [];
    const picks = maximalMarginalRelevance(queryVector, points.map((p) => p.vector[DENSE]), lambda, k);
    return picks.map((i) => toDocument(points[i]));
  }
}

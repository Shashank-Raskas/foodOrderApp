// RAG phase 2: BM25 sparse vectors, the bge Embeddings class, the hybrid Qdrant VectorStore,
// the hybrid retriever, and index sync (incremental updates + blue/green rebuild behind an alias).
// Offline: an in-memory fake Qdrant and deterministic fake embeddings stand in for the real ones.
import { describe, it, expect, jest } from '@jest/globals';
import { Document } from '@langchain/core/documents';
import { Embeddings } from '@langchain/core/embeddings';
import { tokenize, tokenId, bm25DocVector, bm25QueryVector, averageDocLength } from '../rag/sparse/bm25.js';
import { BgeEmbeddings } from '../rag/embeddings/bgeEmbeddings.js';
import { QdrantHybridStore, buildFilter, createCollection, pointId, PAYLOAD_INDEXES } from '../rag/store/qdrantHybridStore.js';
import { syncIndex, resolveAlias, readIndexState, indexSignature, liveStore } from '../rag/store/indexer.js';
import { HybridRetriever } from '../rag/retrieval/hybridRetriever.js';
import { EMBEDDING, INDEX } from '../rag/config.js';
import { createFakeQdrant } from './support/fakeQdrant.js';

// Deterministic "embeddings": a bag-of-words vector over a tiny vocabulary, normalized.
// Similar wording → similar vectors, which is all the store/indexer logic needs.
const VOCAB = ['refund', 'delivery', 'paneer', 'spicy', 'veg', 'chicken', 'biryani', 'payment', 'time', 'order'];
class FakeEmbeddings extends Embeddings {
  constructor() {
    super({});
    this.embedded = [];
  }
  vector(text) {
    const words = text.toLowerCase();
    const v = VOCAB.map((w) => (words.includes(w) ? 1 : 0));
    const norm = Math.hypot(...v) || 1;
    return v.map((x) => x / norm);
  }
  async embedDocuments(texts) {
    this.embedded.push(...texts);
    return texts.map((t) => this.vector(t));
  }
  async embedQuery(text) {
    return this.vector(text);
  }
}

const doc = (id, text, metadata = {}) =>
  new Document({ id, pageContent: text, metadata: { id, hash: `h-${text}`, docType: 'menu', ...metadata } });

const corpus = () => [
  doc('menu:m1', 'Paneer Tikka spicy veg starter', { isVeg: true, price: 280, category: 'appetizers' }),
  doc('menu:m2', 'Chicken Biryani spicy rice', { isVeg: false, price: 350, category: 'entrees' }),
  doc('menu:m3', 'Veg Biryani mild rice', { isVeg: true, price: 300, category: 'entrees' }),
  doc('faq:refund', 'Refund time is 5 to 7 business days', { docType: 'faq' }),
  doc('faq:delivery', 'Delivery time is about 30 minutes', { docType: 'faq' }),
];

describe('BM25 sparse vectors', () => {
  it('tokenizes: lowercase, accents and stop words removed, plurals folded', () => {
    expect(tokenize('How long do the Refunds take? Crème brûlée & dishes, fries!')).toEqual(['long', 'refund', 'take', 'creme', 'brulee', 'dish', 'fry']);
    expect(tokenize('₹299 or 5–7 days')).toEqual(['299', '5', '7', 'day']);
    expect(tokenize('the of and')).toEqual([]);
  });

  it('maps tokens to stable unsigned 32-bit ids', () => {
    expect(tokenId('refund')).toBe(tokenId('refund'));
    expect(tokenId('refund')).not.toBe(tokenId('delivery'));
    expect(tokenId('refund')).toBeGreaterThanOrEqual(0);
    expect(tokenId('refund')).toBeLessThan(2 ** 32);
  });

  it('weights saturate with term frequency and shrink for longer documents', () => {
    const weight = (text, avg = 5) => {
      const v = bm25DocVector(text, { avgDocLength: avg });
      return v.values[v.indices.indexOf(tokenId('spicy'))];
    };
    const once = weight('spicy paneer tikka starter dish');
    const twice = weight('spicy spicy paneer tikka starter');
    const thrice = weight('spicy spicy spicy paneer tikka');
    expect(twice).toBeGreaterThan(once);
    expect(thrice - twice).toBeLessThan(twice - once); // diminishing returns (k1)
    expect(weight('spicy paneer tikka starter dish with a lot more words added here')).toBeLessThan(once); // length norm (b)
  });

  it('query vectors have weight 1 per unique term; averageDocLength handles empty input', () => {
    const q = bm25QueryVector('spicy spicy paneer');
    expect(q.indices).toEqual([tokenId('spicy'), tokenId('paneer')]);
    expect(q.values).toEqual([1, 1]);
    expect(averageDocLength([])).toBe(1);
    expect(averageDocLength(['spicy paneer', 'veg biryani rice mild'])).toBe(3);
  });
});

describe('BgeEmbeddings (LangChain Embeddings over transformers.js)', () => {
  const fakeExtractor = () => {
    const calls = [];
    const extract = async (texts, opts) => {
      calls.push({ texts, opts });
      return { tolist: () => texts.map((t) => [t.length, 1]) };
    };
    return { calls, factory: jest.fn(async () => extract) };
  };

  it('embeds documents as-is in batches, with CLS pooling and normalization', async () => {
    const { calls, factory } = fakeExtractor();
    const emb = new BgeEmbeddings({ batchSize: 2, extractorFactory: factory });
    const vectors = await emb.embedDocuments(['a', 'bb', 'ccc']);
    expect(vectors).toEqual([[1, 1], [2, 1], [3, 1]]);
    expect(calls.map((c) => c.texts)).toEqual([['a', 'bb'], ['ccc']]);
    expect(calls[0].opts).toEqual({ pooling: 'cls', normalize: true });
  });

  it('prefixes queries with the bge retrieval instruction', async () => {
    const { calls, factory } = fakeExtractor();
    await new BgeEmbeddings({ extractorFactory: factory }).embedQuery('refund time');
    expect(calls[0].texts).toEqual([`${EMBEDDING.queryInstruction}refund time`]);
  });

  it('loads the model once even under concurrent first calls, and retries after a failed load', async () => {
    const { factory } = fakeExtractor();
    const emb = new BgeEmbeddings({ extractorFactory: factory });
    await Promise.all([emb.embedQuery('a'), emb.embedQuery('b'), emb.embedDocuments(['c'])]);
    expect(factory).toHaveBeenCalledTimes(1);
    expect(factory).toHaveBeenCalledWith({ model: EMBEDDING.model, dtype: 'q8' });

    const flaky = jest.fn().mockRejectedValueOnce(new Error('network')).mockImplementation(fakeExtractor().factory);
    const emb2 = new BgeEmbeddings({ extractorFactory: flaky });
    emb2.caller.maxRetries = 0;
    await expect(emb2.embedQuery('x')).rejects.toThrow('network');
    await expect(emb2.embedQuery('x')).resolves.toEqual([1 + EMBEDDING.queryInstruction.length, 1]);
  });
});

describe('QdrantHybridStore', () => {
  async function setup() {
    const client = createFakeQdrant();
    await createCollection(client, 'kb_test');
    const store = new QdrantHybridStore(new FakeEmbeddings(), { client, collectionName: 'kb_test', avgDocLength: 5 });
    await store.addDocuments(corpus());
    return { client, store };
  }

  it('creates a collection with named dense + IDF sparse vectors and payload indexes', async () => {
    const client = createFakeQdrant();
    await createCollection(client, 'kb_x');
    expect(client.collections.get('kb_x').config).toEqual({
      vectors: { dense: { size: 384, distance: 'Cosine' } },
      sparse_vectors: { bm25: { modifier: 'idf' } },
    });
    expect(client.collections.get('kb_x').indexes).toEqual(PAYLOAD_INDEXES);
  });

  it('stores each chunk under a stable UUID with both vectors and LangChain-style payload', async () => {
    const { client } = await setup();
    const point = client.collections.get('kb_test').points.get(pointId('menu:m1'));
    expect(pointId('menu:m1')).toMatch(/^[0-9a-f-]{36}$/);
    expect(pointId('menu:m1')).toBe(pointId('menu:m1'));
    expect(point.vector.dense).toHaveLength(VOCAB.length);
    expect(point.vector.bm25.indices).toContain(tokenId('paneer'));
    expect(point.payload).toEqual({ content: 'Paneer Tikka spicy veg starter', metadata: expect.objectContaining({ id: 'menu:m1', isVeg: true }), bm25AvgDl: 5 });
  });

  it('hybrid search sends dense + sparse prefetches fused with RRF, and returns Documents', async () => {
    const { client, store } = await setup();
    const results = await store.hybridSearch('refund time', { k: 2, prefetchK: 4 });
    const req = client.calls.filter((c) => c[0] === 'query').at(-1)[2];
    expect(req.query).toEqual({ fusion: 'rrf' });
    expect(req.prefetch.map((p) => [p.using, p.limit])).toEqual([['dense', 4], ['bm25', 4]]);
    expect(results[0][0]).toBeInstanceOf(Document);
    expect(results[0][0].metadata.id).toBe('faq:refund');
    expect(results).toHaveLength(2);
  });

  it('applies filters inside every prefetch', async () => {
    const { client, store } = await setup();
    const filter = buildFilter({ isVeg: true, maxPrice: 300 });
    const results = await store.hybridSearch('spicy biryani', { k: 5, filter });
    expect(results.map(([d]) => d.metadata.id).sort()).toEqual(['menu:m1', 'menu:m3']);
    const req = client.calls.filter((c) => c[0] === 'query').at(-1)[2];
    expect(req.prefetch.every((p) => p.filter === filter)).toBe(true);
  });

  it('falls back to dense only when the question has no keywords', async () => {
    const { client, store } = await setup();
    await store.hybridSearch('what is the', { k: 2 });
    const req = client.calls.filter((c) => c[0] === 'query').at(-1)[2];
    expect(req.prefetch.map((p) => p.using)).toEqual(['dense']);
    expect(await store.sparseSearch('what is the')).toEqual([]);
  });

  it('supports the standard VectorStore calls: similaritySearch, MMR and delete', async () => {
    const { client, store } = await setup();
    const [top] = await store.similaritySearch('paneer veg', 1);
    expect(top.metadata.id).toBe('menu:m1');

    // MMR: the two biryanis are near-duplicates, so the second pick should be something else
    const mmr = await store.maxMarginalRelevanceSearch('biryani rice', { k: 2, fetchK: 5, lambda: 0.3 });
    expect(mmr).toHaveLength(2);
    expect(mmr.map((d) => d.metadata.id).filter((id) => id.includes('m2') || id.includes('m3'))).toHaveLength(1);

    await store.delete({ ids: ['menu:m1'] });
    expect(client.collections.get('kb_test').points.has(pointId('menu:m1'))).toBe(false);
    await store.delete({ ids: [] }); // no-op
  });

  it('buildFilter: only the given conditions; none → undefined', () => {
    expect(buildFilter()).toBeUndefined();
    expect(buildFilter({ docType: ['faq', 'policy'], isVeg: false, category: 'soups', maxPrice: 0 })).toEqual({
      must: [
        { key: 'metadata.docType', match: { any: ['faq', 'policy'] } },
        { key: 'metadata.isVeg', match: { value: false } },
        { key: 'metadata.category', match: { value: 'soups' } },
        { key: 'metadata.price', range: { lte: 0 } },
      ],
    });
  });
});

describe('HybridRetriever (LangChain BaseRetriever)', () => {
  it('returns Documents with their score, in each mode', async () => {
    const client = createFakeQdrant();
    await createCollection(client, 'kb_r');
    const store = new QdrantHybridStore(new FakeEmbeddings(), { client, collectionName: 'kb_r', avgDocLength: 5 });
    await store.addDocuments(corpus());
    for (const mode of ['hybrid', 'dense', 'sparse']) {
      const docs = await new HybridRetriever({ store, k: 2, mode }).invoke('delivery time');
      expect(docs[0].metadata.id).toBe('faq:delivery');
      expect(typeof docs[0].metadata.score).toBe('number');
    }
  });
});

describe('syncIndex (incremental + blue/green behind an alias)', () => {
  const clock = (n) => new Date(Date.UTC(2026, 10, 22, 10, n, 0));

  it('first run builds a collection, then points the alias at it', async () => {
    const client = createFakeQdrant();
    const embeddings = new FakeEmbeddings();
    const report = await syncIndex({ client, embeddings, documents: corpus(), now: clock(0) });
    expect(report.collection).toBe(`kb_${indexSignature()}_20261122100000`);
    expect(report.rebuilt).toBe(true);
    expect(report.diff.added).toHaveLength(5);
    expect(await resolveAlias(client)).toBe(report.collection);
    expect(embeddings.embedded).toHaveLength(5);
    const state = await readIndexState(client, INDEX.alias);
    expect(Object.keys(state.hashes)).toHaveLength(5);
    expect(state.avgDocLength).toBeGreaterThan(0);
  });

  it('a re-run with no changes embeds nothing', async () => {
    const client = createFakeQdrant();
    await syncIndex({ client, embeddings: new FakeEmbeddings(), documents: corpus(), now: clock(0) });
    const embeddings = new FakeEmbeddings();
    const report = await syncIndex({ client, embeddings, documents: corpus(), now: clock(1) });
    expect(report.rebuilt).toBe(false);
    expect(report.diff.unchanged).toHaveLength(5);
    expect(embeddings.embedded).toEqual([]);
    expect(client.collections.size).toBe(1);
  });

  it('re-embeds only changed/added chunks and deletes removed ones, in place', async () => {
    const client = createFakeQdrant();
    const first = await syncIndex({ client, embeddings: new FakeEmbeddings(), documents: corpus(), now: clock(0) });
    const docs = corpus().filter((d) => d.metadata.id !== 'faq:delivery');
    docs[0] = doc('menu:m1', 'Paneer Tikka extra spicy veg starter', { isVeg: true, price: 299 });
    docs.push(doc('menu:m4', 'Chicken 65 spicy starter', { isVeg: false, price: 260 }));

    const embeddings = new FakeEmbeddings();
    const report = await syncIndex({ client, embeddings, documents: docs, now: clock(1) });
    expect(report.collection).toBe(first.collection);
    expect(report.diff).toMatchObject({ added: ['menu:m4'], changed: ['menu:m1'], removed: ['faq:delivery'] });
    expect(embeddings.embedded).toEqual(['Paneer Tikka extra spicy veg starter', 'Chicken 65 spicy starter']);
    const ids = Object.keys((await readIndexState(client, INDEX.alias)).hashes).sort();
    expect(ids).toEqual(['faq:refund', 'menu:m1', 'menu:m2', 'menu:m3', 'menu:m4']);
  });

  it('a new index signature rebuilds into a new collection, swaps the alias atomically, keeps one for rollback', async () => {
    const client = createFakeQdrant();
    // Simulate collections from older chunker/model versions
    for (const name of ['kb_oldsig0001_20260101000000', 'kb_oldsig0002_20260201000000']) await createCollection(client, name);
    await client.updateCollectionAliases({ actions: [{ create_alias: { collection_name: 'kb_oldsig0002_20260201000000', alias_name: 'kb' } }] });

    const report = await syncIndex({ client, embeddings: new FakeEmbeddings(), documents: corpus(), now: clock(5) });
    expect(report.rebuilt).toBe(true);
    expect(report.previousCollection).toBe('kb_oldsig0002_20260201000000');
    expect(await resolveAlias(client)).toBe(report.collection);
    const aliasCall = client.calls.filter((c) => c[0] === 'updateCollectionAliases').at(-1)[1];
    expect(aliasCall).toEqual([
      { delete_alias: { alias_name: 'kb' } },
      { create_alias: { collection_name: report.collection, alias_name: 'kb' } },
    ]);
    expect([...client.collections.keys()].sort()).toEqual([report.collection, 'kb_oldsig0002_20260201000000'].sort());
    expect(report.deletedCollections).toEqual(['kb_oldsig0001_20260101000000']);
  });

  it('does not move the alias if the new collection is incomplete', async () => {
    const client = createFakeQdrant();
    const realUpsert = client.upsert;
    client.upsert = async (name, req) => realUpsert(name, { ...req, points: req.points.slice(1) }); // drop a point
    await expect(syncIndex({ client, embeddings: new FakeEmbeddings(), documents: corpus(), now: clock(0) })).rejects.toThrow(/Alias not moved/);
    expect(await resolveAlias(client)).toBeNull();
  });

  it('liveStore reads through the alias', async () => {
    const client = createFakeQdrant();
    await syncIndex({ client, embeddings: new FakeEmbeddings(), documents: corpus(), now: clock(0) });
    const [top] = await liveStore({ client, embeddings: new FakeEmbeddings() }).hybridSearch('refund', { k: 1 });
    expect(top[0].metadata.id).toBe('faq:refund');
  });
});

// RAG phase 8: the semantic cache, live re-indexing on menu/review changes, change notifications
// from the existing routes, and the chatbot health endpoint.
import { describe, it, expect, jest } from '@jest/globals';
import { Document } from '@langchain/core/documents';
import { Embeddings } from '@langchain/core/embeddings';
import { RunnableLambda } from '@langchain/core/runnables';
import { FakeListChatModel } from '@langchain/core/utils/testing';
import { createSemanticCache, guardKey } from '../rag/cache/semanticCache.js';
import { createChatService } from '../rag/chat/chatService.js';
import { createAnswerChain } from '../rag/generation/answer.js';
import { createLiveSync } from '../rag/indexing/liveSync.js';
import { createMemoryQdrant } from '../rag/store/memoryQdrant.js';
import { syncIndex, resolveAlias, readIndexState } from '../rag/store/indexer.js';
import { createCollection } from '../rag/store/qdrantHybridStore.js';
import { CACHE } from '../rag/config.js';
import { db, freshApp, request } from './support/helpers.js';

const unit = (v) => {
  const n = Math.hypot(...v);
  return v.map((x) => x / n);
};

describe('semantic cache', () => {
  it('serves a stored answer for a near-identical question', () => {
    const cache = createSemanticCache({ minSimilarity: 0.93 });
    cache.set(unit([1, 0, 0]), 'How long does a refund take?', { answer: 'A' });
    const hit = cache.get(unit([1, 0.2, 0]), 'How long do refunds take?'); // cosine ≈ 0.98
    expect(hit.value).toEqual({ answer: 'A' });
    expect(hit.cachedQuestion).toBe('How long does a refund take?');
    expect(cache.get(unit([1, 1, 0]), 'How long do refunds take?')).toBeNull(); // cosine ≈ 0.71
    expect(cache.stats()).toMatchObject({ hits: 1, misses: 1, stores: 1, size: 1 });
  });

  it('never mixes up different numbers or filter words, however similar the meaning', () => {
    const cache = createSemanticCache({ minSimilarity: 0.5 });
    const v = unit([1, 0]);
    cache.set(v, 'veg dishes under 300', { answer: 'veg ≤ 300' });
    expect(cache.get(v, 'veg dishes under 200')).toBeNull();
    expect(cache.get(v, 'non-veg dishes under 300')).toBeNull();
    expect(cache.get(v, 'spicy veg dishes under 300')).toBeNull();
    expect(cache.get(v, 'Veg dishes under 300?').value.answer).toBe('veg ≤ 300'); // case/punctuation don't matter
    expect(guardKey('Veg under ₹300, not spicy')).toBe('300|not,spicy,under,veg');
  });

  it('expires entries, caps its size, and can be cleared', () => {
    let now = 0;
    const cache = createSemanticCache({ ttlMs: 1000, maxEntries: 2, minSimilarity: 0.9, now: () => now });
    cache.set(unit([1, 0, 0]), 'a', 'A');
    cache.set(unit([0, 1, 0]), 'b', 'B');
    cache.set(unit([0, 0, 1]), 'c', 'C');
    expect(cache.get(unit([1, 0, 0]), 'a')).toBeNull(); // evicted (oldest)
    expect(cache.get(unit([0, 1, 0]), 'b').value).toBe('B');
    now = 2000;
    expect(cache.get(unit([0, 1, 0]), 'b')).toBeNull(); // expired
    cache.set(unit([0, 1, 0]), 'b', 'B');
    cache.clear();
    expect(cache.stats().size).toBe(0);
  });

  it('defaults: on unless RAG_CACHE=off, 0.93 similarity, 6 hours', () => {
    expect(CACHE.enabled).toBe(true);
    expect(CACHE.minSimilarity).toBe(0.93);
    expect(CACHE.ttlMs).toBe(6 * 60 * 60 * 1000);
  });
});

// ---------- the cache inside the chat service ----------

const DOC = new Document({ id: 'faq:refund', pageContent: 'Refunds take 5–7 days', metadata: { id: 'faq:refund', docType: 'faq', title: 'Refunds', url: '/faqs', content: 'Refunds take 5–7 days' } });
const collect = async (iter) => {
  const out = [];
  for await (const e of iter) out.push(e);
  return out;
};

function serviceWith({ route = 'retrieve', intent = 'policy', lowConfidence = false, relaxedFilters = false } = {}) {
  const retrieval = jest.fn(() => ({ route, analysis: { intent }, documents: [DOC], lowConfidence, relaxedFilters, timings: {} }));
  const answerChain = createAnswerChain(new FakeListChatModel({ responses: ['Refunds take 5–7 business days [1].'] }));
  const cache = createSemanticCache();
  const embedQuery = jest.fn(async (q) => unit([q.length % 7, 1, 1])); // same text → same vector
  return { retrieval, cache, embedQuery, service: createChatService({ retrieval: RunnableLambda.from(retrieval), answerChain, cache, embedQuery }) };
}

describe('chat service with the semantic cache', () => {
  it('answers a repeated question from the cache, without retrieval or any LLM call', async () => {
    const { service, retrieval } = serviceWith();
    const first = await collect(service.chat({ message: 'How long does a refund take?' }));
    expect(first.at(-1).cached).toBeUndefined();
    const second = await collect(service.chat({ message: 'How long does a refund take?' }));
    expect(retrieval).toHaveBeenCalledTimes(1);
    expect(second.map((e) => e.type)).toEqual(['meta', 'token', 'done']);
    expect(second[0]).toMatchObject({ route: 'retrieve', intent: 'policy', cached: true });
    expect(second.at(-1)).toMatchObject({ answer: 'Refunds take 5–7 business days [1].', cached: true, mealIds: [] });
    expect(second.at(-1).citations.map((c) => c.id)).toEqual(['faq:refund']);
  });

  it('never caches follow-ups, account answers, "I don\'t know" or relaxed-filter answers', async () => {
    for (const setup of [{ route: 'tool' }, { lowConfidence: true }, { relaxedFilters: true }]) {
      const { service, retrieval } = serviceWith(setup);
      await collect(service.chat({ message: 'q one', user: null }));
      await collect(service.chat({ message: 'q one', user: null }));
      expect(retrieval).toHaveBeenCalledTimes(2);
    }
    const { service, retrieval, embedQuery } = serviceWith();
    const history = [{ role: 'user', content: 'paneer tikka?' }];
    await collect(service.chat({ message: 'is it spicy?', history }));
    await collect(service.chat({ message: 'is it spicy?', history }));
    expect(retrieval).toHaveBeenCalledTimes(2);
    expect(embedQuery).not.toHaveBeenCalled();
  });

  it('caches greetings and refusals too (they still cost an analysis call)', async () => {
    const { service, retrieval } = serviceWith({ route: 'chitchat', intent: 'chitchat' });
    await collect(service.chat({ message: 'hello' }));
    expect((await collect(service.chat({ message: 'hello' }))).at(-1).cached).toBe(true);
    expect(retrieval).toHaveBeenCalledTimes(1);
  });
});

// ---------- live re-indexing ----------

class FakeEmbeddings extends Embeddings {
  constructor() {
    super({});
    this.embedded = [];
  }
  async embedDocuments(ts) {
    this.embedded.push(...ts);
    return ts.map((t) => unit([t.length, 1, 1]));
  }
  async embedQuery(t) {
    return unit([t.length, 1, 1]);
  }
}

async function seedMenu() {
  await db.collection('meals').doc('m1').set({ id: 'm1', name: 'Mac & Cheese', price: '350', category: 'entrees', protein: 'vegetarian', description: 'Cheesy', sortOrder: 0 });
  await db.collection('meals').doc('m2').set({ id: 'm2', name: 'Pav Bhaji', price: '249', category: 'entrees', protein: 'vegetarian', description: 'Spicy', sortOrder: 1 });
}

describe('live re-indexing', () => {
  it('re-embeds only the edited dish and clears the cache', async () => {
    await seedMenu();
    const client = createMemoryQdrant();
    const embeddings = new FakeEmbeddings();
    const { runIngestion } = await import('../rag/ingestion/pipeline.js');
    await syncIndex({ client, embeddings, documents: (await runIngestion({ db })).documents });
    const cache = createSemanticCache();
    cache.set(unit([1, 0, 0]), 'q', 'A');

    await db.collection('meals').doc('m2').set({ id: 'm2', name: 'Pav Bhaji', price: '279', category: 'entrees', protein: 'vegetarian', description: 'Spicy', sortOrder: 1 });
    const sync = createLiveSync({ client, embeddings, db, cache, log: { log() {}, warn() {} } });
    embeddings.embedded = [];
    await sync.runNow();

    expect(embeddings.embedded).toHaveLength(1);
    expect(embeddings.embedded[0]).toContain('₹279');
    expect(sync.status()).toMatchObject({ runs: 1, lastError: null, lastResult: expect.stringMatching(/^0 added, 1 changed, 0 removed/) });
    expect(cache.stats().size).toBe(0);
    expect(Object.keys((await readIndexState(client, 'kb')).hashes)).toEqual(expect.arrayContaining(['menu:m1', 'menu:m2']));
  });

  it('debounces bursts of changes into one sync', async () => {
    jest.useFakeTimers();
    try {
      const sync = createLiveSync({ client: createMemoryQdrant(), embeddings: new FakeEmbeddings(), db, debounceMs: 1000, log: { log() {}, warn() {} } });
      const run = jest.spyOn(sync, 'runNow');
      sync.schedule('menu');
      sync.schedule('menu');
      sync.schedule('reviews');
      expect(sync.status().scheduled).toBe(true);
      jest.advanceTimersByTime(999);
      expect(sync.status().runs).toBe(0);
      jest.advanceTimersByTime(1);
      expect(sync.status().running).toBe(true);
      run.mockRestore();
    } finally {
      jest.useRealTimers();
    }
  });

  it('does not rebuild on the server when the index needs a full rebuild, and survives failures', async () => {
    const client = createMemoryQdrant();
    await createCollection(client, 'kb_oldsignature_20260101000000');
    await client.updateCollectionAliases({ actions: [{ create_alias: { collection_name: 'kb_oldsignature_20260101000000', alias_name: 'kb' } }] });
    const sync = createLiveSync({ client, embeddings: new FakeEmbeddings(), db, log: { log() {}, warn() {} } });
    await sync.runNow();
    expect(sync.status().lastResult).toMatch(/^skipped: the index needs a full rebuild/);
    expect(await resolveAlias(client)).toBe('kb_oldsignature_20260101000000');

    const broken = { getAliases: async () => { throw new Error('Qdrant unreachable'); } };
    const failing = createLiveSync({ client: broken, embeddings: new FakeEmbeddings(), db, log: { log() {}, warn() {} } });
    await expect(failing.runNow()).resolves.toBeUndefined();
    expect(failing.status().lastError).toBe('Qdrant unreachable');
  });
});

// ---------- change notifications from the existing routes ----------

describe('knowledge change notifications', () => {
  it('fires when an admin adds, edits or deletes a meal, and when a review is posted', async () => {
    const app = await freshApp();
    const { onKnowledgeChange: subscribe } = await import('../lib/knowledgeEvents.js');
    const seen = [];
    const off = subscribe((source) => seen.push(source));
    try {
      const { adminToken, userToken } = await tokens(app);
      const added = await request(app).post('/api/admin/meals').set('Authorization', `Bearer ${adminToken}`).send({ meal: { name: 'Test Dosa', price: 120 } });
      expect(added.status).toBe(201);
      const id = added.body.meal.id;
      expect((await request(app).put(`/api/admin/meals/${id}`).set('Authorization', `Bearer ${adminToken}`).send({ meal: { price: 130 } })).status).toBe(200);
      expect((await request(app).delete(`/api/admin/meals/${id}`).set('Authorization', `Bearer ${adminToken}`)).status).toBe(200);
      expect(seen).toEqual(['menu', 'menu', 'menu']);
      await seedMenu();
      expect((await request(app).post('/api/meals/m1/reviews').set('Authorization', `Bearer ${userToken}`).send({ rating: 5, comment: 'Great' })).status).toBe(201);
      expect(seen.at(-1)).toBe('reviews');
    } finally {
      off();
    }
  });

  it('a failing listener never breaks the request that changed the data', async () => {
    const app = await freshApp();
    const { onKnowledgeChange: subscribe } = await import('../lib/knowledgeEvents.js');
    const off = subscribe(() => {
      throw new Error('listener bug');
    });
    try {
      const { adminToken } = await tokens(app);
      expect((await request(app).post('/api/admin/meals').set('Authorization', `Bearer ${adminToken}`).send({ meal: { name: 'Safe', price: 99 } })).status).toBe(201);
    } finally {
      off();
    }
  });
});

// Real tokens for an admin and a customer, signed with the test secret
async function tokens() {
  const { default: jwt } = await import('jsonwebtoken');
  const sign = (payload) => jwt.sign(payload, process.env.JWT_SECRET, { expiresIn: '5m' });
  await db.collection('credentials').doc('cust').set({ userId: 'cust-1', name: 'Customer', email: 'c@test.com' });
  return { adminToken: sign({ userId: 'admin-1', email: 'flavor.alchemist9@gmail.com', role: 'admin' }), userToken: sign({ userId: 'cust-1', email: 'c@test.com', role: 'user' }) };
}

describe('GET /api/chat/health', () => {
  it('reports unavailable (503) when the chatbot is not configured', async () => {
    const res = await request(await freshApp()).get('/api/chat/health');
    expect(res.status).toBe(503);
    expect(res.body).toEqual({ status: 'unavailable', configured: false });
  });
});

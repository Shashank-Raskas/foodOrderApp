// The retrieval pipeline (phase 3):
//
//   question + history
//     → QueryAnalysis   standalone question, intent, filters        (Gemini → Groq → rules)
//     → route           retrieve | tool (orders, loyalty) | chitchat | refuse
//     → HybridSearch    dense + BM25, RRF-fused, filters applied in Qdrant      (~20 candidates)
//     → Rerank          cross-encoder scores each (question, chunk) pair        (precision)
//     → MMR             pick finalK that are relevant but not redundant         (diversity)
//     → Context         parent sections for policy chunks, de-duplicated
//
// Every step is a named LangChain Runnable invoked with the caller's config, so tracing callbacks
// (Langfuse, phase 7) see the full tree with per-step timing. Stages can be switched off for the
// eval's ablations.

import { RunnableLambda } from '@langchain/core/runnables';
import { RETRIEVAL } from '../config.js';
import { buildFilter } from '../store/qdrantHybridStore.js';
import { mmrSelect } from './mmr.js';

export const ROUTE_BY_INTENT = {
  menu: 'retrieve', reviews: 'retrieve', policy: 'retrieve',
  order_status: 'tool', loyalty: 'tool', chitchat: 'chitchat', out_of_scope: 'refuse',
};

// Which document types each intent searches. Narrowing the search space is a cheap precision win.
export const DOC_TYPES_BY_INTENT = { menu: ['menu', 'reviews'], reviews: ['reviews', 'menu'], policy: ['faq', 'policy'] };

const FILTER_KEYS = ['isVeg', 'maxPrice', 'minPrice', 'spiceLevels', 'category'];

// MMR is off by default: the eval showed it lowers recall on this corpus (see RETRIEVAL.mmrLambda)
export const DEFAULT_STAGES = { filters: true, routeDocTypes: true, rerank: true, mmr: false };

const step = (name, fn) => RunnableLambda.from(fn).withConfig({ runName: name });

export function createRetrievalPipeline({ store, analyzer, reranker = null, parents = null, options = {}, stages = {} }) {
  const opts = { ...RETRIEVAL, ...options };
  const use = { ...DEFAULT_STAGES, ...stages };
  if (!reranker) use.rerank = false;

  const search = step('HybridSearch', async ({ query, filter }) => {
    let results = await store.hybridSearch(query, { k: opts.candidates, prefetchK: opts.prefetchK, filter, withVectors: use.mmr });
    let relaxed = false;
    // Over-constrained ("veg under ₹50"): rather than return nothing, retry unfiltered and say so,
    // so the answer can offer the closest options instead of a dead end
    if (!results.length && filter) {
      results = await store.hybridSearch(query, { k: opts.candidates, prefetchK: opts.prefetchK, withVectors: use.mmr });
      relaxed = true;
    }
    return { results, relaxed };
  });

  const rerank = step('Rerank', ({ docs, query }) => reranker.compressDocuments(docs, query));

  const diversify = step('MMR', ({ docs, vectors }) => {
    const relevance = docs.map((d) => d.metadata.rerankScore ?? d.metadata.score ?? 0);
    return mmrSelect({ relevance, vectors: docs.map((d) => vectors.get(d.metadata.id)), k: opts.finalK, lambda: opts.mmrLambda }).map((i) => docs[i]);
  });

  const attachContext = step('Context', async ({ docs }) => {
    const parentMap = parents ? await parents() : null;
    const seenParents = new Set();
    const out = [];
    for (const doc of docs) {
      const parentId = doc.metadata.parentId;
      if (parentId && seenParents.has(parentId)) continue; // two children of one section → send it once
      if (parentId) seenParents.add(parentId);
      const parent = parentId && parentMap?.get(parentId);
      doc.metadata = { ...doc.metadata, context: parent ? parent.content : doc.metadata.content ?? doc.pageContent };
      out.push(doc);
    }
    return out;
  });

  return RunnableLambda.from(async (input, config) => {
    const { question, history = [] } = input;
    const timings = {};
    const time = async (name, fn) => {
      const t = Date.now();
      try {
        return await fn();
      } finally {
        timings[name] = Date.now() - t;
      }
    };

    const analysis = await time('analyze', () => analyzer.invoke({ ...input, question, history }, config));
    const route = ROUTE_BY_INTENT[analysis.intent] ?? 'retrieve';
    if (route !== 'retrieve') return { analysis, route, documents: [], lowConfidence: false, relaxedFilters: false, timings };

    const filterSpec = {
      ...(use.routeDocTypes && { docType: DOC_TYPES_BY_INTENT[analysis.intent] }),
      ...(use.filters && Object.fromEntries(FILTER_KEYS.filter((k) => analysis[k] !== undefined).map((k) => [k, analysis[k]]))),
    };
    const query = analysis.standaloneQuestion || question;
    const { results, relaxed } = await time('search', () => search.invoke({ query, filter: buildFilter(filterSpec) }, config));

    const vectors = new Map(results.map(([doc, , vector]) => [doc.metadata.id, vector]));
    let docs = results.map(([doc, score]) => {
      doc.metadata = { ...doc.metadata, score };
      return doc;
    });

    if (use.rerank && docs.length) docs = await time('rerank', () => rerank.invoke({ docs, query }, config));
    if (use.mmr && docs.length > opts.finalK && vectors.size && [...vectors.values()].every(Boolean)) {
      docs = await time('mmr', () => diversify.invoke({ docs, vectors }, config));
    } else {
      docs = docs.slice(0, opts.finalK);
    }
    docs = await time('context', () => attachContext.invoke({ docs }, config));

    // "I don't know" signal: even the best chunk is a weak match for the question
    const top = docs[0]?.metadata.rerankScore;
    const thresholdApplies = use.rerank && top !== undefined && opts.minRelevanceIntents.includes(analysis.intent);
    const lowConfidence = !docs.length || (thresholdApplies && top < opts.minRelevance);
    return { analysis, route, documents: docs, lowConfidence, relaxedFilters: relaxed, timings };
  }).withConfig({ runName: 'Retrieval' });
}

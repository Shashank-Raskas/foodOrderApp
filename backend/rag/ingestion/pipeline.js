// Ingestion pipeline: load → chunk (per document type) → enrich/hash → diff against the last run.
// The output is plain data (chunks + parents + stats); embedding and upserting into the vector DB
// is the next stage, which only needs to process the manifest diff's added/changed/removed IDs.

import { CHUNKER_VERSION } from '../config.js';
import { chunkFaqs, chunkMeal, chunkPolicy, chunkReviews, toDocument } from './chunkers.js';
import { loadContentDocs, loadMenu, loadReviews } from './loaders.js';
import { createPolicySplitter } from './splitter.js';

export async function buildChunks({ docs, meals, reviewsByMeal = new Map() }) {
  const chunks = [];
  const parents = [];
  const splitter = createPolicySplitter();

  for (const doc of docs) {
    if (doc.docType === 'faq') {
      chunks.push(...chunkFaqs(doc.source));
    } else {
      const result = await chunkPolicy(doc.source, doc.docId, splitter);
      chunks.push(...result.chunks);
      parents.push(...result.parents);
    }
  }
  chunks.push(...meals.map(chunkMeal));
  chunks.push(...chunkReviews(meals, reviewsByMeal));

  const ids = new Set();
  for (const chunk of chunks) {
    if (ids.has(chunk.id)) throw new Error(`Duplicate chunk id: ${chunk.id}`);
    ids.add(chunk.id);
  }

  // documents: the same chunks as LangChain Documents, ready for vectorStore.addDocuments()
  return { chunks, documents: chunks.map(toDocument), parents, stats: chunkStats(chunks) };
}

export async function runIngestion({ db = null, contentDir } = {}) {
  const [docs, meals, reviewsByMeal] = await Promise.all([loadContentDocs(contentDir), loadMenu(db), loadReviews(db)]);
  return buildChunks({ docs, meals, reviewsByMeal });
}

// Per-type counts and token distribution: the first thing to check when tuning chunk sizes
export function chunkStats(chunks) {
  const byType = {};
  for (const c of chunks) {
    const s = (byType[c.docType] ||= { count: 0, minTokens: Infinity, maxTokens: 0, totalTokens: 0 });
    s.count++;
    s.minTokens = Math.min(s.minTokens, c.tokens);
    s.maxTokens = Math.max(s.maxTokens, c.tokens);
    s.totalTokens += c.tokens;
  }
  for (const s of Object.values(byType)) s.avgTokens = Math.round(s.totalTokens / s.count);
  return { total: chunks.length, byType };
}

// ---------- Manifest: what is in the index, so re-runs only touch what changed ----------

export function buildManifest(chunks, generatedAt = new Date().toISOString()) {
  return {
    chunkerVersion: CHUNKER_VERSION,
    generatedAt,
    chunks: Object.fromEntries(chunks.map((c) => [c.id, c.hash])),
  };
}

/**
 * Compares this run's chunks with the previous manifest.
 * added/changed → embed + upsert; removed → delete from the index; unchanged → skip (no embedding cost).
 * A different chunkerVersion means every vector is stale, so everything counts as changed.
 */
export function diffManifest(previous, chunks) {
  const prev = previous && previous.chunkerVersion === CHUNKER_VERSION ? previous.chunks : null;
  const diff = { added: [], changed: [], unchanged: [], removed: [], fullReindex: !prev };
  const current = new Set();

  for (const { id, hash } of chunks) {
    current.add(id);
    if (!prev) diff[previous?.chunks?.[id] ? 'changed' : 'added'].push(id);
    else if (!(id in prev)) diff.added.push(id);
    else if (prev[id] !== hash) diff.changed.push(id);
    else diff.unchanged.push(id);
  }
  for (const id of Object.keys(previous?.chunks || {})) {
    if (!current.has(id)) diff.removed.push(id);
  }
  return diff;
}

// Wires the chat service from the real components, once per process.
// Importing this file is cheap: nothing connects or loads a model until the first chat (or warmUp).

import '../env.js';
import { BgeEmbeddings } from '../embeddings/bgeEmbeddings.js';
import { createQdrantClient } from '../store/client.js';
import { liveStore, resolveAlias } from '../store/indexer.js';
import { CrossEncoderReranker } from '../retrieval/reranker.js';
import { AnalysisSchema, AnalysisSchemaNullable, createQueryAnalyzer } from '../retrieval/analysis.js';
import { createRetrievalPipeline } from '../retrieval/pipeline.js';
import { loadParents } from '../retrieval/parents.js';
import { createAnswerModel, createFastModels, createToolModel, structuredWithFallback } from '../llm/models.js';
import { createAnswerChain } from '../generation/answer.js';
import { createAccountAgent } from '../graph/accountAgent.js';
import { createAccountTools } from '../tools/accountTools.js';
import { createSemanticCache } from '../cache/semanticCache.js';
import { createLiveSync } from '../indexing/liveSync.js';
import { CACHE, INDEX } from '../config.js';
import { createChatService } from './chatService.js';

const REQUIRED = ['QDRANT_URL', 'QDRANT_API_KEY', 'GEMINI_API_KEY'];

let parts = null;
let override = null;
let liveSync = null;

export const isChatConfigured = () => Boolean(override) || REQUIRED.every((k) => process.env[k]);

function build(serviceOptions = {}) {
  const embeddings = new BgeEmbeddings();
  const reranker = new CrossEncoderReranker();
  const client = createQdrantClient();
  const store = liveStore({ client, embeddings });
  const analyzer = createQueryAnalyzer(structuredWithFallback(createFastModels(), AnalysisSchema, 'query_analysis', AnalysisSchemaNullable));
  const retrieval = createRetrievalPipeline({ store, analyzer, reranker, parents: loadParents });
  const toolModel = createToolModel();
  // A fresh graph per request, with tools bound to that request's signed-in user (cheap: no I/O)
  const agentFor = (userId) => createAccountAgent({ model: toolModel, tools: createAccountTools({ userId }) });
  const cache = CACHE.enabled && !serviceOptions.includeContext ? createSemanticCache() : null;
  const service = createChatService({
    retrieval,
    answerChain: createAnswerChain(createAnswerModel()),
    agentFor,
    cache,
    embedQuery: (q) => embeddings.embedQuery(q),
    ...serviceOptions,
  });
  return { embeddings, reranker, client, cache, service };
}

/** A separate chat service for the answer-quality eval: same components, plus the sources used (no cache). */
export function createEvalChatService() {
  return build({ includeContext: true }).service;
}

export function getChatService() {
  if (override) return override;
  parts ??= build();
  return parts.service;
}

/** Loads both local models ahead of the first customer, so nobody waits ~10 s for a cold start. */
export async function warmUp() {
  if (override || !isChatConfigured()) return;
  parts ??= build();
  const started = Date.now();
  await parts.embeddings.embedQuery('warm up');
  await parts.reranker.compressDocuments([{ pageContent: 'warm up', metadata: {} }], 'warm up');
  await loadParents();
  return Date.now() - started;
}

/**
 * Background re-indexing when the menu or reviews change (phase 8). Uses the same embedding model
 * instance as the chat, so no second copy is loaded into memory. Returns false if not configured.
 */
export function startLiveSync({ db, onKnowledgeChange, debounceMs } = {}) {
  if (override || !isChatConfigured() || liveSync) return false;
  parts ??= build();
  liveSync = createLiveSync({ client: parts.client, embeddings: parts.embeddings, db, cache: parts.cache, debounceMs });
  onKnowledgeChange((source) => liveSync.schedule(source));
  return true;
}

/**
 * Touches the index (also what keeps Qdrant's free cluster from pausing when idle) and reports
 * the chatbot's state for GET /api/chat/health. No secrets, no customer data.
 */
export async function chatHealth() {
  if (!isChatConfigured()) return { configured: false };
  parts ??= build();
  const health = { configured: true, modelsLoaded: Boolean(parts.embeddings.extractorPromise), cache: parts.cache?.stats() ?? null, liveSync: liveSync?.status() ?? null };
  try {
    const started = Date.now();
    const collection = await resolveAlias(parts.client, INDEX.alias);
    const { count } = await parts.client.count(INDEX.alias, { exact: true });
    health.index = { ok: true, collection, points: count, latencyMs: Date.now() - started };
  } catch (err) {
    health.index = { ok: false, error: err.message };
  }
  return health;
}

/** Tests swap in a fake service (or null to restore the real one). */
export function setChatServiceForTests(service) {
  override = service;
}

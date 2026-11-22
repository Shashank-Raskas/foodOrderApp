// Wires the chat service from the real components, once per process.
// Importing this file is cheap: nothing connects or loads a model until the first chat (or warmUp).

import '../env.js';
import { BgeEmbeddings } from '../embeddings/bgeEmbeddings.js';
import { createQdrantClient } from '../store/client.js';
import { liveStore } from '../store/indexer.js';
import { CrossEncoderReranker } from '../retrieval/reranker.js';
import { AnalysisSchema, createQueryAnalyzer } from '../retrieval/analysis.js';
import { createRetrievalPipeline } from '../retrieval/pipeline.js';
import { loadParents } from '../retrieval/parents.js';
import { createAnswerModel, createFastModels, structuredWithFallback } from '../llm/models.js';
import { createAnswerChain } from '../generation/answer.js';
import { createChatService } from './chatService.js';

const REQUIRED = ['QDRANT_URL', 'QDRANT_API_KEY', 'GEMINI_API_KEY'];

let parts = null;
let override = null;

export const isChatConfigured = () => Boolean(override) || REQUIRED.every((k) => process.env[k]);

function build() {
  const embeddings = new BgeEmbeddings();
  const reranker = new CrossEncoderReranker();
  const store = liveStore({ client: createQdrantClient(), embeddings });
  const analyzer = createQueryAnalyzer(structuredWithFallback(createFastModels(), AnalysisSchema, 'query_analysis'));
  const retrieval = createRetrievalPipeline({ store, analyzer, reranker, parents: loadParents });
  return { embeddings, reranker, service: createChatService({ retrieval, answerChain: createAnswerChain(createAnswerModel()) }) };
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

/** Tests swap in a fake service (or null to restore the real one). */
export function setChatServiceForTests(service) {
  override = service;
}

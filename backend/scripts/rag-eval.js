// Retrieval evaluation over the golden dataset against the LIVE Qdrant index, with ablations.
//
// Usage (from backend/):
//   npm run rag:eval            rule-based query analysis (deterministic, no LLM calls)
//   npm run rag:eval -- --llm   Gemini (→ Groq) query analysis, as in production
//
// For the keyless regression check (in-memory index), see scripts/rag-eval-offline.js.

import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import '../rag/env.js';
import { BgeEmbeddings } from '../rag/embeddings/bgeEmbeddings.js';
import { createQdrantClient } from '../rag/store/client.js';
import { liveStore } from '../rag/store/indexer.js';
import { CrossEncoderReranker } from '../rag/retrieval/reranker.js';
import { createQueryAnalyzer, AnalysisSchema } from '../rag/retrieval/analysis.js';
import { loadParents } from '../rag/retrieval/parents.js';
import { createFastModels, structuredWithFallback } from '../rag/llm/models.js';
import { runRetrievalEval, formatReport } from '../rag/eval/runRetrievalEval.js';

const here = path.dirname(fileURLToPath(import.meta.url));
const golden = JSON.parse((await fs.readFile(path.join(here, '../rag/eval/golden.json'), 'utf8')).replace(/^\s+/, '')).questions;
const useLlm = process.argv.includes('--llm');

const embeddings = new BgeEmbeddings();
const reranker = new CrossEncoderReranker();
await embeddings.embedQuery('warm up');
await reranker.compressDocuments([{ pageContent: 'warm up', metadata: {} }], 'warm up');

const report = await runRetrievalEval({
  golden,
  store: liveStore({ client: createQdrantClient(), embeddings }),
  embeddings,
  reranker,
  analyzer: createQueryAnalyzer(useLlm ? structuredWithFallback(createFastModels(), AnalysisSchema, 'query_analysis') : null, { mode: 'llm' }),
  parents: loadParents,
  configNames: ['Dense only', 'BM25 only', 'Hybrid (RRF)', '+ routing & filters', '+ rerank (default)', '+ MMR λ=0.9', '+ MMR λ=0.7', 'rerank top 20', 'rerank top 5'],
  delayMs: useLlm ? 4500 : 0, // stay under the free tier's requests per minute
});
console.log(formatReport(report, { title: `Retrieval eval (live index, ${useLlm ? 'LLM' : 'rule'} analysis)` }));

await fs.mkdir(path.join(here, '../rag/.out'), { recursive: true });
const outFile = path.join(here, `../rag/.out/eval-${useLlm ? 'llm' : 'rules'}.json`);
await fs.writeFile(outFile, JSON.stringify({ date: new Date().toISOString(), ...report, analyses: Object.fromEntries(report.analyses) }, null, 2));
console.log(`\nDetails → ${outFile}`);
process.exit(0);

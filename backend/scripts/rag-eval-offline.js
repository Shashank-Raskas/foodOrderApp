// The keyless retrieval regression check: no Qdrant, no LLM, no API keys — so it can run on every
// change (locally or in CI) and fail the build if retrieval quality drops.
//
// It indexes the real corpus (content/ + seed menu) with the real embedding model into an in-memory
// Qdrant (same hybrid search, IDF and RRF logic), analyses questions with the deterministic rules,
// reranks with the real cross-encoder, and compares the metrics with rag/eval/thresholds.json.
// The models are downloaded once (~60 MB) into rag/.models.
//
// Usage (from backend/):  npm run rag:eval:offline        (exit code 1 on a regression)

import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { runIngestion } from '../rag/ingestion/pipeline.js';
import { BgeEmbeddings } from '../rag/embeddings/bgeEmbeddings.js';
import { createMemoryQdrant } from '../rag/store/memoryQdrant.js';
import { syncIndex, liveStore } from '../rag/store/indexer.js';
import { CrossEncoderReranker } from '../rag/retrieval/reranker.js';
import { createQueryAnalyzer } from '../rag/retrieval/analysis.js';
import { loadParents } from '../rag/retrieval/parents.js';
import { runRetrievalEval, formatReport } from '../rag/eval/runRetrievalEval.js';

const here = path.dirname(fileURLToPath(import.meta.url));
// (a byte-order mark, which some Windows editors add, is stripped before parsing)
const readJson = async (file) => JSON.parse((await fs.readFile(path.join(here, file), 'utf8')).replace(/^\s+/, ''));
const golden = (await readJson('../rag/eval/golden.json')).questions;
const thresholds = await readJson('../rag/eval/thresholds.json');

const started = Date.now();
const embeddings = new BgeEmbeddings();
const client = createMemoryQdrant();
const { documents } = await runIngestion(); // seed menu + content/, offline
await syncIndex({ client, embeddings, documents });
console.log(`Indexed ${documents.length} chunks in memory in ${Date.now() - started} ms`);

const report = await runRetrievalEval({
  golden,
  store: liveStore({ client, embeddings }),
  embeddings,
  reranker: new CrossEncoderReranker(),
  analyzer: createQueryAnalyzer(null), // deterministic rules
  parents: loadParents,
  configNames: ['Hybrid (RRF)', '+ routing & filters', '+ rerank (default)'],
});
console.log(formatReport(report, { title: 'Retrieval regression check (in-memory index, rule analysis)' }));

// Compare the production configuration with the thresholds
const prod = report.results.find((r) => r.name === '+ rerank (default)');
const routing = report.routeRows.filter((r) => r.ok).length / report.routeRows.length;
const checks = [
  ['Recall@5', prod.recallAtK, thresholds.recallAt5],
  ['Hit@5', prod.hitAtK, thresholds.hitAt5],
  ['MRR', prod.mrr, thresholds.mrr],
  ['Routing accuracy', routing, thresholds.routingAccuracy],
];
console.log('\nRegression check (production configuration):');
let failed = false;
for (const [name, value, min] of checks) {
  const ok = value >= min;
  failed ||= !ok;
  console.log(`  ${ok ? 'PASS' : 'FAIL'}  ${name.padEnd(17)} ${(value * 100).toFixed(1)}%  (minimum ${(min * 100).toFixed(1)}%)`);
}

await fs.mkdir(path.join(here, '../rag/.out'), { recursive: true });
await fs.writeFile(path.join(here, '../rag/.out/eval-offline.json'), JSON.stringify({ date: new Date().toISOString(), ...report, analyses: Object.fromEntries(report.analyses) }, null, 2));
console.log(`\n${failed ? 'Retrieval quality dropped below the thresholds.' : 'Retrieval quality is at or above the thresholds.'} (${Math.round((Date.now() - started) / 1000)} s)`);
process.exit(failed ? 1 : 0);

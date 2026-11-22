// Retrieval evaluation over the golden dataset, with ablations (each stage switched on in turn).
//
// Usage (from backend/):
//   npm run rag:eval            rule-based query analysis (deterministic, no LLM calls)
//   npm run rag:eval -- --llm   Gemini (→ Groq) query analysis, as in production
//
// The question analysis runs once per question and is shared by every configuration, so the
// table compares retrieval stages only (and the LLM is called once per question, not 7 times).

import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import '../rag/env.js';
import { RunnableLambda } from '@langchain/core/runnables';
import { BgeEmbeddings } from '../rag/embeddings/bgeEmbeddings.js';
import { createQdrantClient } from '../rag/store/client.js';
import { liveStore } from '../rag/store/indexer.js';
import { CrossEncoderReranker } from '../rag/retrieval/reranker.js';
import { createQueryAnalyzer, AnalysisSchema } from '../rag/retrieval/analysis.js';
import { createRetrievalPipeline, ROUTE_BY_INTENT } from '../rag/retrieval/pipeline.js';
import { loadParents } from '../rag/retrieval/parents.js';
import { createFastModels, structuredWithFallback } from '../rag/llm/models.js';
import { summarize } from '../rag/eval/metrics.js';
import { RETRIEVAL } from '../rag/config.js';

const here = path.dirname(fileURLToPath(import.meta.url));
const golden = JSON.parse(await fs.readFile(path.join(here, '../rag/eval/golden.json'), 'utf8')).questions;
const useLlm = process.argv.includes('--llm');
const K = RETRIEVAL.finalK;

const embeddings = new BgeEmbeddings();
const store = liveStore({ client: createQdrantClient(), embeddings });
const reranker = new CrossEncoderReranker();
const analyzer = createQueryAnalyzer(useLlm ? structuredWithFallback(createFastModels(), AnalysisSchema, 'query_analysis') : null, { mode: 'llm' });
await embeddings.embedQuery('warm up');
await reranker.compressDocuments([{ pageContent: 'warm up', metadata: {} }], 'warm up');

// 1. Analyse every question once
const analyses = new Map();
for (const q of golden) {
  const t = Date.now();
  analyses.set(q.id, { ...(await analyzer.invoke({ question: q.question, history: q.history || [] })), ms: Date.now() - t });
  if (useLlm) await new Promise((r) => setTimeout(r, 4500)); // stay under the free tier's requests/minute
}

// 2. Routing accuracy (did each question go to retrieval / a tool / refusal as expected?)
const expectedRoute = (q) => q.expectedRoute || (q.intent === 'out_of_scope' ? 'refuse' : 'retrieve');
const routeRows = golden.map((q) => ({ id: q.id, expected: expectedRoute(q), got: ROUTE_BY_INTENT[analyses.get(q.id).intent] ?? 'retrieve' }));

// 3. Retrieval configurations
const fixedAnalyzer = RunnableLambda.from(({ id }) => analyses.get(id));
const pipelineFor = (stages, options) =>
  createRetrievalPipeline({ store, analyzer: fixedAnalyzer, reranker, parents: loadParents, stages, options });
const viaPipeline = (pipeline) => async (q) => (await pipeline.invoke({ id: q.id, question: q.question, history: q.history })).documents;
const queryOf = (q) => analyses.get(q.id).standaloneQuestion || q.question;

const configs = [
  ['Dense only', async (q) => (await store.similaritySearchVectorWithScore(await embeddings.embedQuery(queryOf(q)), K)).map(([d]) => d)],
  ['BM25 only', async (q) => (await store.sparseSearch(queryOf(q), K)).map(([d]) => d)],
  ['Hybrid (RRF)', viaPipeline(pipelineFor({ filters: false, routeDocTypes: false, rerank: false }))],
  ['+ routing & filters', viaPipeline(pipelineFor({ rerank: false }))],
  ['+ rerank (default)', viaPipeline(pipelineFor({}))],
  ['+ MMR λ=0.9', viaPipeline(pipelineFor({ mmr: true }, { mmrLambda: 0.9 }))],
  ['+ MMR λ=0.7', viaPipeline(pipelineFor({ mmr: true }, { mmrLambda: 0.7 }))],
  ['+ MMR λ=0.5', viaPipeline(pipelineFor({ mmr: true }, { mmrLambda: 0.5 }))],
  ['rerank, no routing', viaPipeline(pipelineFor({ routeDocTypes: false }))],
  ['rerank top 10', viaPipeline(pipelineFor({}, { rerankCandidates: 10 }))],
  ['rerank top 8', viaPipeline(pipelineFor({}, { rerankCandidates: 8 }))],
  ['rerank top 5', viaPipeline(pipelineFor({}, { rerankCandidates: 5 }))],
  ['rerank policy only, top 8', viaPipeline(pipelineFor({}, { rerankCandidates: 8, rerankIntents: ['policy'] }))],
];

const answerable = golden.filter((q) => q.relevant.length);
const results = [];
for (const [name, run] of configs) {
  const rows = [];
  let ms = 0;
  for (const q of answerable) {
    const t = Date.now();
    const docs = await run(q);
    ms += Date.now() - t;
    rows.push({ id: q.id, ranked: docs.map((d) => d.metadata.id), relevant: q.relevant });
  }
  results.push({ name, ...summarize(rows, K), avgMs: Math.round(ms / answerable.length), misses: rows.filter((r) => !r.ranked.slice(0, K).some((id) => r.relevant.includes(id))).map((r) => r.id) });
}

// 4. "I don't know" threshold: best rerank score for answerable vs unanswerable questions
const full = pipelineFor({});
const topScores = [];
for (const q of golden.filter((x) => expectedRoute(x) === 'retrieve' || x.unanswerable)) {
  const out = await full.invoke({ id: q.id, question: q.question, history: q.history });
  topScores.push({ id: q.id, unanswerable: Boolean(q.unanswerable), top: out.documents[0]?.metadata.rerankScore ?? 0, lowConfidence: out.lowConfidence, route: out.route });
}

// ---------- report ----------
const pct = (x) => (x === null ? '  –  ' : `${(x * 100).toFixed(1).padStart(5)}%`);
console.log(`\nRetrieval eval — ${answerable.length} answerable questions, k=${K}, analysis: ${useLlm ? 'LLM (Gemini → Groq)' : 'rules'}\n`);
console.log('Configuration           Recall@5   Hit@5     MRR   nDCG@5   avg ms   misses');
for (const r of results) {
  console.log(`${r.name.padEnd(22)}  ${pct(r.recallAtK)}  ${pct(r.hitAtK)}  ${r.mrr.toFixed(3)}  ${pct(r.ndcgAtK)}  ${String(r.avgMs).padStart(6)}   ${r.misses.join(' ') || '-'}`);
}

const routeOk = routeRows.filter((r) => r.expected === r.got);
console.log(`\nRouting accuracy: ${routeOk.length}/${routeRows.length}${routeRows.length - routeOk.length ? `  wrong: ${routeRows.filter((r) => r.expected !== r.got).map((r) => `${r.id}(${r.got}≠${r.expected})`).join(' ')}` : ''}`);
console.log(`Analysis latency: avg ${Math.round([...analyses.values()].reduce((s, a) => s + a.ms, 0) / analyses.size)} ms per question (${[...analyses.values()].filter((a) => a.analyzer === 'llm').length} by LLM, ${[...analyses.values()].filter((a) => a.analyzer === 'rules').length} by rules)`);

const answ = topScores.filter((s) => !s.unanswerable && s.route === 'retrieve').map((s) => s.top);
const unans = topScores.filter((s) => s.unanswerable);
console.log(`\n"I don't know" check (minRelevance = ${RETRIEVAL.minRelevance}):`);
console.log(`  answerable   top rerank score: min ${Math.min(...answ).toFixed(3)}, median ${answ.sort((a, b) => a - b)[Math.floor(answ.length / 2)].toFixed(3)}`);
console.log(`  unanswerable top rerank score: ${unans.map((s) => `${s.id}=${s.top.toFixed(3)}${s.route !== 'retrieve' ? `(${s.route})` : s.lowConfidence ? '(low ✓)' : '(answered ✗)'}`).join(', ')}`);
console.log(`  answerable questions wrongly flagged low-confidence: ${topScores.filter((s) => !s.unanswerable && s.lowConfidence).map((s) => s.id).join(' ') || 'none'}`);

await fs.mkdir(path.join(here, '../rag/.out'), { recursive: true });
const outFile = path.join(here, `../rag/.out/eval-${useLlm ? 'llm' : 'rules'}.json`);
await fs.writeFile(outFile, JSON.stringify({ date: new Date().toISOString(), k: K, results, routeRows, topScores, analyses: Object.fromEntries(analyses) }, null, 2));
console.log(`\nDetails → ${outFile}`);
process.exit(0);

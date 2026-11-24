// The retrieval evaluation, shared by `npm run rag:eval` (live Qdrant, LLM or rule analysis) and
// `npm run rag:eval:offline` (in-memory index, rules; the keyless regression check).
//
// Each question is analysed once; every configuration then retrieves with that same analysis, so the
// table compares retrieval stages only (and the LLM is called once per question, not once per config).

import { RunnableLambda } from '@langchain/core/runnables';
import { createRetrievalPipeline, ROUTE_BY_INTENT } from '../retrieval/pipeline.js';
import { RETRIEVAL } from '../config.js';
import { summarize } from './metrics.js';

/** The routes a question may take: expectedRoute, acceptRoutes, or by its intent. */
export function allowedRoutes(q) {
  if (q.acceptRoutes) return q.acceptRoutes;
  if (q.expectedRoute) return [q.expectedRoute];
  return [q.intent === 'out_of_scope' ? 'refuse' : 'retrieve'];
}

/** Every named configuration; pick the ones to run by name. */
export function configurations({ store, embeddings, reranker, parents, analyses, k }) {
  const fixedAnalyzer = RunnableLambda.from(({ id }) => analyses.get(id));
  const pipelineFor = (stages, options) => createRetrievalPipeline({ store, analyzer: fixedAnalyzer, reranker, parents, stages, options });
  const viaPipeline = (pipeline) => async (q) => (await pipeline.invoke({ id: q.id, question: q.question, history: q.history })).documents;
  const queryOf = (q) => analyses.get(q.id).standaloneQuestion || q.question;
  return {
    'Dense only': async (q) => (await store.similaritySearchVectorWithScore(await embeddings.embedQuery(queryOf(q)), k)).map(([d]) => d),
    'BM25 only': async (q) => (await store.sparseSearch(queryOf(q), k)).map(([d]) => d),
    'Hybrid (RRF)': viaPipeline(pipelineFor({ filters: false, routeDocTypes: false, rerank: false })),
    '+ routing & filters': viaPipeline(pipelineFor({ rerank: false })),
    '+ rerank (default)': viaPipeline(pipelineFor({})),
    '+ MMR λ=0.9': viaPipeline(pipelineFor({ mmr: true }, { mmrLambda: 0.9 })),
    '+ MMR λ=0.7': viaPipeline(pipelineFor({ mmr: true }, { mmrLambda: 0.7 })),
    'rerank top 20': viaPipeline(pipelineFor({}, { rerankCandidates: 20 })),
    'rerank top 5': viaPipeline(pipelineFor({}, { rerankCandidates: 5 })),
  };
}

export async function runRetrievalEval({ golden, store, embeddings, reranker, analyzer, parents, configNames, k = RETRIEVAL.finalK, delayMs = 0, log = () => {} }) {
  // 1. Analyse every question once
  const analyses = new Map();
  for (const q of golden) {
    const t = Date.now();
    analyses.set(q.id, { ...(await analyzer.invoke({ question: q.question, history: q.history || [] })), ms: Date.now() - t });
    if (delayMs) await new Promise((r) => setTimeout(r, delayMs));
  }
  log(`Analysed ${golden.length} questions`);

  // 2. Routing: did each question go to retrieval / a tool / chit-chat / refusal as allowed?
  const routeRows = golden.map((q) => {
    const got = ROUTE_BY_INTENT[analyses.get(q.id).intent] ?? 'retrieve';
    return { id: q.id, allowed: allowedRoutes(q), got, ok: allowedRoutes(q).includes(got) };
  });

  // 3. Retrieval metrics per configuration, over answerable questions
  const all = configurations({ store, embeddings, reranker, parents, analyses, k });
  const answerable = golden.filter((q) => q.relevant.length);
  const results = [];
  for (const name of configNames) {
    const run = all[name];
    if (!run) throw new Error(`Unknown configuration: ${name}`);
    const rows = [];
    let ms = 0;
    for (const q of answerable) {
      const t = Date.now();
      const docs = await run(q);
      ms += Date.now() - t;
      rows.push({ id: q.id, ranked: docs.map((d) => d.metadata.id), relevant: q.relevant });
    }
    results.push({
      name,
      ...summarize(rows, k),
      avgMs: Math.round(ms / answerable.length),
      misses: rows.filter((r) => !r.ranked.slice(0, k).some((id) => r.relevant.includes(id))).map((r) => r.id),
    });
    log(`${name}: done`);
  }

  // 4. "I don't know": best rerank score and low-confidence flag, answerable vs unanswerable
  const full = createRetrievalPipeline({ store, analyzer: RunnableLambda.from(({ id }) => analyses.get(id)), reranker, parents });
  const topScores = [];
  for (const q of golden.filter((x) => allowedRoutes(x).includes('retrieve') || x.unanswerable)) {
    const out = await full.invoke({ id: q.id, question: q.question, history: q.history });
    topScores.push({ id: q.id, unanswerable: Boolean(q.unanswerable), top: out.documents[0]?.metadata.rerankScore ?? 0, lowConfidence: out.lowConfidence, route: out.route });
  }

  return { k, answerable: answerable.length, results, routeRows, topScores, analyses };
}

/** Plain-text report of an eval run. */
export function formatReport({ k, answerable, results, routeRows, topScores, analyses }, { title = 'Retrieval eval' } = {}) {
  const pct = (x) => (x === null || x === undefined ? '  –  ' : `${(x * 100).toFixed(1).padStart(5)}%`);
  const lines = [`\n${title} — ${answerable} answerable questions, k=${k}\n`, 'Configuration           Recall@5   Hit@5     MRR   nDCG@5   avg ms   misses'];
  for (const r of results) {
    lines.push(`${r.name.padEnd(22)}  ${pct(r.recallAtK)}  ${pct(r.hitAtK)}  ${r.mrr.toFixed(3)}  ${pct(r.ndcgAtK)}  ${String(r.avgMs).padStart(6)}   ${r.misses.join(' ') || '-'}`);
  }
  const wrong = routeRows.filter((r) => !r.ok);
  lines.push(`\nRouting accuracy: ${routeRows.length - wrong.length}/${routeRows.length}${wrong.length ? `  wrong: ${wrong.map((r) => `${r.id}(${r.got}∉${r.allowed.join('|')})`).join(' ')}` : ''}`);
  const a = [...analyses.values()];
  lines.push(`Analysis: avg ${Math.round(a.reduce((s, x) => s + x.ms, 0) / a.length)} ms per question (${a.filter((x) => x.analyzer === 'llm').length} by LLM, ${a.filter((x) => x.analyzer === 'rules').length} by rules)`);
  const unans = topScores.filter((s) => s.unanswerable);
  lines.push(`"I don't know" (threshold ${RETRIEVAL.minRelevance}, policy questions): ${unans.filter((s) => s.lowConfidence || s.route !== 'retrieve').length}/${unans.length} unanswerable caught; answerable wrongly flagged: ${topScores.filter((s) => !s.unanswerable && s.lowConfidence).map((s) => s.id).join(' ') || 'none'}`);
  return lines.join('\n');
}

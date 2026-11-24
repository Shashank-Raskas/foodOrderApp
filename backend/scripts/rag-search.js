// Searches the live index from the command line (phase 2 check; phase 3 adds rewrite/MMR/rerank).
//
// Usage (from backend/):
//   npm run rag:search -- "spicy veg starter"
//   npm run rag:search -- "how long do refunds take" --mode dense|sparse|hybrid|mmr|compare
//   npm run rag:search -- "paneer" --veg --max-price 300 --type menu -k 5
//   npm run rag:search -- "very spicy veg starters under 300" --mode pipeline   (full phase 3 pipeline)

import '../rag/env.js';
import { BgeEmbeddings } from '../rag/embeddings/bgeEmbeddings.js';
import { createQdrantClient } from '../rag/store/client.js';
import { liveStore } from '../rag/store/indexer.js';
import { buildFilter } from '../rag/store/qdrantHybridStore.js';
import { HybridRetriever } from '../rag/retrieval/hybridRetriever.js';

const args = process.argv.slice(2);
const flag = (name) => (args.includes(name) ? args[args.indexOf(name) + 1] : undefined);
const query = args.find((a, i) => !a.startsWith('-') && !['--mode', '--max-price', '--type', '-k'].includes(args[i - 1]));
if (!query) {
  console.log('Usage: npm run rag:search -- "your question" [--mode dense|sparse|hybrid|mmr|compare] [--veg] [--max-price N] [--type menu|faq|policy|reviews] [-k N]');
  process.exit(1);
}

const k = Number(flag('-k') || 5);
const filter = buildFilter({
  isVeg: args.includes('--veg') ? true : args.includes('--non-veg') ? false : undefined,
  maxPrice: flag('--max-price') ? Number(flag('--max-price')) : undefined,
  docType: flag('--type'),
});
const mode = flag('--mode') || 'hybrid';
const store = liveStore({ client: createQdrantClient(), embeddings: new BgeEmbeddings() });

const show = (title, docs) => {
  console.log(`\n${title}`);
  docs.forEach((d, i) => {
    const score = d.metadata.score === undefined ? '' : ` ${d.metadata.score.toFixed(4)}`;
    console.log(`${String(i + 1).padStart(2)}.${score}  [${d.metadata.id}]  ${d.metadata.title}${d.metadata.section ? ` — ${d.metadata.section}` : ''}`);
  });
  if (!docs.length) console.log('   (no results)');
};

await store.embeddings.embedQuery('warm up'); // model load, so the timings below are search-only

if (mode === 'pipeline') {
  const { CrossEncoderReranker } = await import('../rag/retrieval/reranker.js');
  const { createQueryAnalyzer, AnalysisSchema, AnalysisSchemaNullable } = await import('../rag/retrieval/analysis.js');
  const { createRetrievalPipeline } = await import('../rag/retrieval/pipeline.js');
  const { loadParents } = await import('../rag/retrieval/parents.js');
  const { createFastModels, structuredWithFallback } = await import('../rag/llm/models.js');
  const analyzer = createQueryAnalyzer(structuredWithFallback(createFastModels(), AnalysisSchema, 'query_analysis', AnalysisSchemaNullable));
  const pipeline = createRetrievalPipeline({ store, analyzer, reranker: new CrossEncoderReranker(), parents: loadParents });
  const t = Date.now();
  const out = await pipeline.invoke({ question: query, history: [] });
  console.log(`\nAnalysis: ${JSON.stringify(out.analysis)}`);
  console.log(`Route: ${out.route}${out.lowConfidence ? '  (LOW CONFIDENCE → "I don\'t know")' : ''}${out.relaxedFilters ? '  (filters relaxed: nothing matched exactly)' : ''}`);
  console.log(`Timings (ms): ${JSON.stringify(out.timings)}, total ${Date.now() - t} (first call includes loading the reranker)`);
  out.documents.forEach((d, i) => console.log(`${String(i + 1).padStart(2)}. rerank ${d.metadata.rerankScore?.toFixed(4) ?? '-'}  [${d.metadata.id}]  ${d.metadata.title}`));
  process.exit(0);
}

const modes = mode === 'compare' ? ['dense', 'sparse', 'hybrid'] : [mode];
for (const m of modes) {
  const t = Date.now();
  const docs = m === 'mmr'
    ? await store.maxMarginalRelevanceSearch(query, { k, fetchK: 20, lambda: 0.5, filter })
    : await new HybridRetriever({ store, k, filter, mode: m }).invoke(query);
  show(`${m.toUpperCase()} — "${query}"${filter ? ` filter=${JSON.stringify(filter)}` : ''} (${Date.now() - t} ms)`, docs);
}
process.exit(0);

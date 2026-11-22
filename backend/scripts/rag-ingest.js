// Runs the RAG ingestion pipeline and writes its output for inspection:
//   rag/.out/chunks.jsonl   one chunk per line (what will be embedded)
//   rag/.out/parents.jsonl  full policy sections (what the LLM reads for parent–child retrieval)
//   rag/.out/manifest.json  chunk id → hash, diffed on the next run
//
// Usage (from backend/):
//   node scripts/rag-ingest.js                 menu from the bundled seed, no reviews (offline)
//   node scripts/rag-ingest.js --firestore     live menu + reviews from Firestore (read-only)
//   node scripts/rag-ingest.js --show <id>     print one chunk, e.g. --show "policy:refund-policy:4-refund-timelines#0"

import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { runIngestion, buildManifest, diffManifest } from '../rag/ingestion/pipeline.js';

const OUT_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../rag/.out');
const args = process.argv.slice(2);
const showId = args.includes('--show') ? args[args.indexOf('--show') + 1] : null;

const db = args.includes('--firestore') ? (await import('../firebase.js')).default : null;
const { chunks, parents, stats } = await runIngestion({ db });

if (showId) {
  const hit = chunks.find((c) => c.id === showId) || parents.find((p) => p.id === showId);
  console.log(hit ? JSON.stringify(hit, null, 2) : `No chunk or parent with id "${showId}"`);
  process.exit(hit ? 0 : 1);
}

await fs.mkdir(OUT_DIR, { recursive: true });
const manifestPath = path.join(OUT_DIR, 'manifest.json');
const previous = await fs.readFile(manifestPath, 'utf8').then(JSON.parse, () => null);
const diff = diffManifest(previous, chunks);

const toJsonl = (rows) => rows.map((r) => JSON.stringify(r)).join('\n') + '\n';
await fs.writeFile(path.join(OUT_DIR, 'chunks.jsonl'), toJsonl(chunks));
await fs.writeFile(path.join(OUT_DIR, 'parents.jsonl'), toJsonl(parents));
await fs.writeFile(manifestPath, JSON.stringify(buildManifest(chunks), null, 2));

console.log(`Source: ${db ? 'Firestore (menu + reviews)' : 'bundled seed menu, no reviews'}`);
console.table(
  Object.fromEntries(
    Object.entries(stats.byType).map(([type, s]) => [type, { chunks: s.count, minTokens: s.minTokens, avgTokens: s.avgTokens, maxTokens: s.maxTokens }]),
  ),
);
console.log(`${stats.total} chunks, ${parents.length} parent sections → ${OUT_DIR}`);
console.log(
  `Diff vs last run${diff.fullReindex ? ' (full re-index)' : ''}: ` +
    `${diff.added.length} added, ${diff.changed.length} changed, ${diff.removed.length} removed, ${diff.unchanged.length} unchanged`,
);
process.exit(0);

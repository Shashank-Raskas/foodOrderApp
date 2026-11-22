// Builds or updates the Qdrant index from the ingestion pipeline (phase 2).
//
// Usage (from backend/):
//   npm run rag:ingest                  menu from the bundled seed (offline content)
//   npm run rag:ingest -- --firestore   live menu + reviews from Firestore (read-only)
//
// Only added/changed chunks are embedded; a chunker/model change triggers a blue/green rebuild.
// Also prints memory use, since the server must fit in Render's free 512 MB.

import '../rag/env.js';
import { runIngestion } from '../rag/ingestion/pipeline.js';
import { BgeEmbeddings } from '../rag/embeddings/bgeEmbeddings.js';
import { createQdrantClient } from '../rag/store/client.js';
import { syncIndex } from '../rag/store/indexer.js';

const mb = (bytes) => `${Math.round(bytes / 1024 / 1024)} MB`;
let peakRss = 0;
const sample = () => (peakRss = Math.max(peakRss, process.memoryUsage().rss));
const timer = setInterval(sample, 100);

const args = process.argv.slice(2);
const db = args.includes('--firestore') ? (await import('../firebase.js')).default : null;

const t0 = Date.now();
const rssStart = process.memoryUsage().rss;
const { documents, stats } = await runIngestion({ db });
console.log(`Chunked ${stats.total} documents from ${db ? 'Firestore (menu + reviews)' : 'the bundled seed menu'} in ${Date.now() - t0} ms`);

const embeddings = new BgeEmbeddings();
const t1 = Date.now();
await embeddings.embedQuery('warm up'); // loads the model, so its cost is measured on its own
const rssModel = process.memoryUsage().rss;
console.log(`Model ${embeddings.model} (${embeddings.dtype}) loaded in ${Date.now() - t1} ms`);

const report = await syncIndex({ client: createQdrantClient(), embeddings, documents, log: (m) => console.log(m) });
sample();
clearInterval(timer);

const { diff } = report;
console.log(`\nIndex: ${report.collection}${report.rebuilt ? ' (new)' : ''}`);
console.log(`  ${diff.added.length} added, ${diff.changed.length} changed, ${diff.removed.length} removed, ${diff.unchanged.length} unchanged (write ${report.writeMs} ms)`);
if (report.deletedCollections.length) console.log(`  dropped old collections: ${report.deletedCollections.join(', ')}`);
console.log(`Memory (RSS): start ${mb(rssStart)}, after model load ${mb(rssModel)} (+${mb(rssModel - rssStart)}), peak ${mb(peakRss)}`);
process.exit(0);

// Keeps the Qdrant index in sync with the chunks, embedding only what changed.
//
//   alias "kb" → kb_<signature>_<timestamp>
//
// - Same signature (chunker, embedding model, BM25 version) as the live collection →
//   incremental: read each point's stored hash, embed + upsert only added/changed chunks,
//   delete removed ones. The index itself is the manifest, so this works from any machine.
// - Different signature, or no index yet → blue/green rebuild: fill a new collection, check its
//   point count, atomically move the alias, then drop older collections (keeping one for rollback).

import { INDEX, INDEX_SIGNATURE_PARTS, CHUNKER_VERSION } from '../config.js';
import { sha256 } from '../ingestion/util.js';
import { diffManifest } from '../ingestion/pipeline.js';
import { averageDocLength } from '../sparse/bm25.js';
import { QdrantHybridStore, createCollection, ensurePayloadIndexes } from './qdrantHybridStore.js';

export const indexSignature = () => sha256(INDEX_SIGNATURE_PARTS().join('|')).slice(0, 10);

export async function resolveAlias(client, alias = INDEX.alias) {
  const { aliases } = await client.getAliases();
  return aliases.find((a) => a.alias_name === alias)?.collection_name ?? null;
}

// Reads chunk id → hash (and the BM25 average length used) from every point in the collection
export async function readIndexState(client, collection) {
  const hashes = {};
  let avgDocLength = null;
  let offset;
  do {
    const page = await client.scroll(collection, {
      limit: 256,
      offset,
      with_vector: false,
      with_payload: { include: ['metadata.id', 'metadata.hash', 'bm25AvgDl'] },
    });
    for (const p of page.points) {
      if (p.payload?.metadata?.id) hashes[p.payload.metadata.id] = p.payload.metadata.hash;
      avgDocLength ??= p.payload?.bm25AvgDl ?? null;
    }
    offset = page.next_page_offset ?? undefined;
  } while (offset !== undefined && offset !== null);
  return { hashes, avgDocLength };
}

async function moveAlias(client, alias, collection, hadAlias) {
  const actions = [];
  if (hadAlias) actions.push({ delete_alias: { alias_name: alias } });
  actions.push({ create_alias: { collection_name: collection, alias_name: alias } });
  // One request = one atomic switch; searches never see a missing or half-built index
  await client.updateCollectionAliases({ actions });
}

// Our collections, newest first (the timestamp suffix sorts lexically)
async function ourCollections(client) {
  const { collections } = await client.getCollections();
  return collections.map((c) => c.name).filter((n) => n.startsWith(`${INDEX.collectionPrefix}_`)).sort().reverse();
}

/**
 * documents: LangChain Documents from the ingestion pipeline (metadata.id / metadata.hash set).
 * Returns a report of what was done.
 */
export async function syncIndex({ client, embeddings, documents, now = new Date(), log = () => {} }) {
  const signature = indexSignature();
  const live = await resolveAlias(client);
  const incremental = Boolean(live) && live.startsWith(`${INDEX.collectionPrefix}_${signature}_`);

  let collection = live;
  let previous = null;
  let avgDocLength;
  if (incremental) {
    const state = await readIndexState(client, live);
    previous = { chunkerVersion: CHUNKER_VERSION, chunks: state.hashes };
    avgDocLength = state.avgDocLength ?? averageDocLength(documents.map((d) => d.pageContent));
    await ensurePayloadIndexes(client, live); // picks up indexes added since the collection was built
    log(`Incremental update of ${live}`);
  } else {
    const stamp = now.toISOString().replace(/\D/g, '').slice(0, 14);
    collection = `${INDEX.collectionPrefix}_${signature}_${stamp}`;
    avgDocLength = averageDocLength(documents.map((d) => d.pageContent));
    log(live ? `Index signature changed: rebuilding into ${collection}` : `No index yet: building ${collection}`);
    await createCollection(client, collection);
  }

  const diff = diffManifest(previous, documents.map((d) => ({ id: d.metadata.id, hash: d.metadata.hash })));
  const toWrite = new Set([...diff.added, ...diff.changed]);
  const store = new QdrantHybridStore(embeddings, { client, collectionName: collection, avgDocLength });

  const started = Date.now();
  const pending = documents.filter((d) => toWrite.has(d.metadata.id));
  if (pending.length) {
    log(`Embedding and upserting ${pending.length} chunk(s)…`);
    await store.addDocuments(pending);
  }
  if (diff.removed.length) await store.delete({ ids: diff.removed });
  const writeMs = Date.now() - started;

  const report = { collection, rebuilt: !incremental, previousCollection: incremental ? null : live, diff, writeMs, deletedCollections: [] };

  if (!incremental) {
    const { count } = await client.count(collection, { exact: true });
    if (count !== documents.length) {
      throw new Error(`Rebuild check failed: ${collection} has ${count} points, expected ${documents.length}. Alias not moved.`);
    }
    await moveAlias(client, INDEX.alias, collection, Boolean(live));
    log(`Alias "${INDEX.alias}" → ${collection}`);
    // Keep the new collection plus `keepPrevious` older ones for rollback; delete the rest
    const stale = (await ourCollections(client)).filter((n) => n !== collection).slice(INDEX.keepPrevious);
    for (const name of stale) {
      await client.deleteCollection(name);
      report.deletedCollections.push(name);
    }
  }
  return report;
}

/** A store reading whatever the alias currently points at (what search/chat use). */
export function liveStore({ client, embeddings }) {
  return new QdrantHybridStore(embeddings, { client, collectionName: INDEX.alias });
}

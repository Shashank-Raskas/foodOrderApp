// Parent sections for parent–child retrieval: small policy chunks are what gets matched, and their
// whole section is what the LLM reads. Parents are rebuilt from content/ (in the repo) on first
// use, so there's no second store to keep in sync with Qdrant.

import { loadContentDocs } from '../ingestion/loaders.js';
import { chunkPolicy } from '../ingestion/chunkers.js';

let cache = null;

export async function loadParents(contentDir) {
  if (cache && !contentDir) return cache;
  const parents = new Map();
  for (const doc of await loadContentDocs(contentDir)) {
    if (doc.docType === 'faq') continue;
    const { parents: list } = await chunkPolicy(doc.source, doc.docId);
    for (const p of list) parents.set(p.id, p);
  }
  if (!contentDir) cache = parents;
  return parents;
}

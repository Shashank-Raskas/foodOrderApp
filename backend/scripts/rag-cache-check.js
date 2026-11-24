// Checks the semantic cache's similarity threshold against the golden set: embeds every question
// with the real model and lists the most similar pairs of DIFFERENT questions that pass the
// numbers/filter-words guard. Any such pair above the threshold would be a wrong cache hit.
// Also shows how paraphrases of the same question score, i.e. what the cache can save.
//
// Usage (from backend/): node scripts/rag-cache-check.js

import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { BgeEmbeddings } from '../rag/embeddings/bgeEmbeddings.js';
import { guardKey } from '../rag/cache/semanticCache.js';
import { CACHE } from '../rag/config.js';

const here = path.dirname(fileURLToPath(import.meta.url));
const golden = JSON.parse((await fs.readFile(path.join(here, '../rag/eval/golden.json'), 'utf8')).replace(/^\s+/, '')).questions.filter((q) => !q.history);
const embeddings = new BgeEmbeddings();
const dot = (a, b) => a.reduce((s, v, i) => s + v * b[i], 0);

const questions = golden.map((q) => q.question);
const vectors = await Promise.all(questions.map((q) => embeddings.embedQuery(q)));

const pairs = [];
for (let i = 0; i < questions.length; i++) {
  for (let j = i + 1; j < questions.length; j++) {
    if (guardKey(questions[i]) !== guardKey(questions[j])) continue;
    pairs.push({ a: questions[i], b: questions[j], sim: dot(vectors[i], vectors[j]) });
  }
}
pairs.sort((x, y) => y.sim - x.sim);
console.log(`Threshold ${CACHE.minSimilarity}. Most similar DIFFERENT golden questions that pass the guard:`);
for (const p of pairs.slice(0, 8)) console.log(`  ${p.sim.toFixed(3)} ${p.sim >= CACHE.minSimilarity ? 'WOULD COLLIDE' : 'ok'}  "${p.a}"  ~  "${p.b}"`);

const paraphrases = [
  ['Is delivery free?', 'Do you charge for delivery?'],
  ['Is delivery free?', 'is delivery free'],
  ['How long does a refund take?', 'How long do refunds take?'],
  ['How long does a refund take?', 'how many days for a refund'],
  ['Do you have biryani?', 'do you have biryani'],
  ['Do you have biryani?', 'Do you serve biryani?'],
  ['veg dishes under 300', 'veg dishes under 200'],
  ['veg dishes under 300', 'non-veg dishes under 300'],
];
console.log('\nParaphrases (and near-misses the guard must block):');
for (const [a, b] of paraphrases) {
  const [va, vb] = await Promise.all([embeddings.embedQuery(a), embeddings.embedQuery(b)]);
  const sim = dot(va, vb);
  const sameGuard = guardKey(a) === guardKey(b);
  const verdict = !sameGuard ? 'blocked by guard' : sim >= CACHE.minSimilarity ? 'CACHE HIT' : 'miss';
  console.log(`  ${sim.toFixed(3)} ${verdict.padEnd(16)} "${a}" ~ "${b}"`);
}
process.exit(0);

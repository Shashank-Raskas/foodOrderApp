// Loaders: fetch raw source documents. They take their inputs (directory, db) as arguments, so tests
// can hand in fixtures or the in-memory Firestore and nothing here touches production by default.

import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseFrontMatter } from '../../../content/markdown.js';

const here = path.dirname(fileURLToPath(import.meta.url));
export const CONTENT_DIR = path.resolve(here, '../../../content');
export const SEED_MENU = path.resolve(here, '../../data/available-meals.json');

/** Every Markdown file in content/ as { docId, docType, source }. */
export async function loadContentDocs(dir = CONTENT_DIR) {
  const files = (await fs.readdir(dir)).filter((f) => f.endsWith('.md')).sort();
  return Promise.all(
    files.map(async (file) => {
      const source = await fs.readFile(path.join(dir, file), 'utf8');
      const { meta } = parseFrontMatter(source);
      return { docId: path.basename(file, '.md'), docType: meta.docType || 'policy', source };
    }),
  );
}

/** The menu: from Firestore when a db is given (the live source of truth), else the bundled seed. */
export async function loadMenu(db = null) {
  if (!db) return JSON.parse(await fs.readFile(SEED_MENU, 'utf8'));
  const snapshot = await db.collection('meals').get();
  return snapshot.docs
    .map((doc) => doc.data())
    .sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0))
    .map(({ sortOrder, ...meal }) => meal);
}

/** Reviews grouped by meal. Only rating, comment and date are read — never who wrote it. */
export async function loadReviews(db = null) {
  const byMeal = new Map();
  if (!db) return byMeal;
  const snapshot = await db.collection('reviews').get();
  snapshot.forEach((doc) => {
    const { mealId, rating, comment, createdAt } = doc.data();
    if (!mealId) return;
    if (!byMeal.has(mealId)) byMeal.set(mealId, []);
    byMeal.get(mealId).push({ rating, comment, createdAt });
  });
  return byMeal;
}

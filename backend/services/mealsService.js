// ===================== Menu (Firestore-backed) =====================
// The menu used to live only in data/available-meals.json, and admin edits rewrote that file on
// Render's disk — which is reset on every deploy/restart, so edits silently disappeared.
// Now Firestore's `meals` collection is the source of truth. On first use it is seeded from the JSON
// file, which stays in the repo as the seed and as a read-only fallback if Firestore is unreachable.

import fs from 'node:fs/promises';
import db from '../firebase.js';

const MEALS = 'meals';
const SEED_FILE = './data/available-meals.json';
// Marker doc so an admin deleting every meal doesn't trigger a re-seed
const SEED_MARKER = db.collection('config').doc('menu');
// The menu only changes through this module, so the cache is mostly invalidated explicitly;
// the TTL just picks up edits made directly in the Firebase console.
const CACHE_TTL_MS = 60 * 60 * 1000;

let cache = null; // { meals, loadedAt }
let loading = null;

async function readSeedFile() {
  return JSON.parse(await fs.readFile(SEED_FILE, 'utf8'));
}

// Firestore doesn't keep insertion order, so each doc carries a sortOrder (hidden from API responses)
function stripInternal({ sortOrder, ...meal }) {
  return meal;
}

async function seedIfNeeded() {
  const marker = await SEED_MARKER.get();
  if (marker.exists) return;

  const seed = await readSeedFile();
  const batch = db.batch();
  seed.forEach((meal, index) => {
    batch.set(db.collection(MEALS).doc(meal.id), { ...meal, sortOrder: index });
  });
  batch.set(SEED_MARKER, { seededAt: new Date().toISOString(), count: seed.length });
  await batch.commit();
  console.log(`[Meals] Seeded ${seed.length} meals into Firestore from ${SEED_FILE}`);
}

async function loadFromFirestore() {
  await seedIfNeeded();
  const snapshot = await db.collection(MEALS).get();
  return snapshot.docs
    .map((doc) => doc.data())
    .sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0))
    .map(stripInternal);
}

function invalidate() {
  cache = null;
}

/** All meals, in menu order. Falls back to the bundled JSON if Firestore fails. */
export async function getMeals() {
  if (cache && Date.now() - cache.loadedAt < CACHE_TTL_MS) return cache.meals;

  // Coalesce concurrent loads (e.g. many visitors right after a restart)
  if (!loading) {
    loading = loadFromFirestore()
      .then((meals) => {
        cache = { meals, loadedAt: Date.now() };
        return meals;
      })
      .finally(() => {
        loading = null;
      });
  }

  try {
    return await loading;
  } catch (err) {
    console.error('[Meals] Firestore read failed, serving bundled menu:', err.message);
    return readSeedFile();
  }
}

/** Add a meal (already validated/normalised by the route). */
export async function addMeal(meal) {
  await seedIfNeeded();
  // Date.now() keeps new meals after the seeded ones (0..n) and in creation order
  await db.collection(MEALS).doc(meal.id).set({ ...meal, sortOrder: Date.now() });
  invalidate();
  return meal;
}

/** Merge changes into a meal. Returns the updated meal, or null if it doesn't exist. */
export async function updateMeal(id, changes) {
  await seedIfNeeded();
  const ref = db.collection(MEALS).doc(id);
  const doc = await ref.get();
  if (!doc.exists) return null;

  const { id: _ignoredId, sortOrder: _ignoredOrder, ...safeChanges } = changes || {};
  const existing = doc.data();
  const updated = {
    ...existing,
    ...safeChanges,
    id,
    price: String(safeChanges.price || existing.price),
    sortOrder: existing.sortOrder,
  };
  await ref.set(updated);
  invalidate();
  return stripInternal(updated);
}

/** Delete a meal. Returns false if it doesn't exist. */
export async function deleteMeal(id) {
  await seedIfNeeded();
  const ref = db.collection(MEALS).doc(id);
  const doc = await ref.get();
  if (!doc.exists) return false;
  await ref.delete();
  invalidate();
  return true;
}

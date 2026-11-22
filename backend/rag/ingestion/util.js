import crypto from 'node:crypto';

export const sha256 = (value) => crypto.createHash('sha256').update(value).digest('hex');

// URL/ID-safe slug: "Account & Profile" → "account-profile"
export const slugify = (text) =>
  String(text)
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80);

// A chunk's hash covers everything that ends up in the vector DB (embedded text + payload), so any
// change to either one re-indexes that chunk, and nothing else.
export function hashChunk({ embedText, metadata }) {
  return sha256(JSON.stringify({ embedText, metadata }));
}

// Same as the frontend's src/util/meal.js: veg = no meat, fish or egg.
export function isVegMeal(meal) {
  if (!meal) return false;
  if (meal.protein) return meal.protein === 'vegetarian';
  return (meal.dietary || []).some((d) => d === 'vegetarian' || d === 'vegan');
}

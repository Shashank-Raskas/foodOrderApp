// One chunking strategy per document type. Each returns chunks of the shape:
//   {
//     id,            stable across runs (drives incremental re-indexing; becomes the vector point ID)
//     docId, docType, title, section, url,
//     content,       text shown to the LLM and quoted in citations
//     embedText,     content + a context prefix (what gets embedded and BM25-indexed)
//     parentId,      policy chunks only: the full section handed to the LLM (parent–child retrieval)
//     metadata,      filterable payload (category, veg, price, …)
//     tokens, hash, chunkerVersion
//   }

import { Document } from '@langchain/core/documents';
import { parseMarkdown, parseFaqs, splitSections, blockToText } from '../../../content/markdown.js';
import { CHUNKER_VERSION, REVIEWS, approxTokens } from '../config.js';
import { createPolicySplitter } from './splitter.js';
import { hashChunk, isVegMeal, slugify } from './util.js';

// A chunk as a LangChain Document — the type vector stores, retrievers and chains all accept.
// pageContent is what gets embedded (with its context prefix); everything else rides along as
// metadata, which becomes the Qdrant payload (filters, citations, parent lookup, change detection).
export function toDocument(chunk) {
  const { embedText, metadata, ...rest } = chunk;
  return new Document({ id: chunk.id, pageContent: embedText, metadata: { ...rest, ...metadata } });
}

function finalize(chunk) {
  const full = { ...chunk, tokens: approxTokens(chunk.embedText), chunkerVersion: CHUNKER_VERSION };
  return { ...full, hash: hashChunk(full) };
}

// ---------- Menu: one chunk per meal (a meal is the natural, self-contained unit) ----------

const titleCase = (s) => String(s).replace(/(^|[-\s])(\w)/g, (_, sep, c) => (sep === '-' ? ' ' : sep) + c.toUpperCase());

// Menu category → how a customer would say it, including common synonyms (helps BM25 match "starter")
const CATEGORY_NOUN = {
  entrees: 'main course (entree)',
  sides: 'side dish',
  desserts: 'dessert',
  appetizers: 'appetizer (starter)',
  beverages: 'beverage (drink)',
  soups: 'soup',
};

// Structured fields are templated into a sentence so both the dense model and BM25 can match
// "spicy veg starter under 300" against them; the same fields also go into metadata for exact filters.
export function chunkMeal(meal) {
  const veg = isVegMeal(meal);
  const price = Number(meal.price);
  const noun = CATEGORY_NOUN[meal.category] || `${String(meal.category || 'menu').toLowerCase()} item`;
  const facts = [
    `${meal.name} is a ${veg ? 'vegetarian (veg)' : 'non-vegetarian (non-veg)'} ${noun} priced at ₹${price}.`,
    meal.dietary?.length ? `Dietary: ${meal.dietary.join(', ')}.` : null,
    meal.spiceLevel ? `Spice level: ${meal.spiceLevel}.` : null,
    meal.protein ? `Protein: ${meal.protein}.` : null,
    meal.servingSize ? `Serving size: ${meal.servingSize}.` : null,
    meal.availableTime ? `Available: ${meal.availableTime}.` : null,
    meal.isChefSpecial ? "It is a chef's special." : null,
  ].filter(Boolean);
  const content = `${facts.join(' ')}\n${meal.description || ''}`.trim();

  return finalize({
    id: `menu:${meal.id}`,
    docId: 'menu',
    docType: 'menu',
    title: meal.name,
    section: titleCase(meal.category),
    url: `/meal/${meal.id}`,
    content,
    embedText: `Menu > ${titleCase(meal.category)} > ${meal.name}\n${content}`,
    parentId: null,
    metadata: {
      mealId: meal.id,
      category: meal.category,
      price,
      isVeg: veg,
      dietary: meal.dietary || [],
      spiceLevel: meal.spiceLevel || null,
      protein: meal.protein || null,
      servingSize: meal.servingSize || null,
      availableTime: meal.availableTime || null,
      isChefSpecial: Boolean(meal.isChefSpecial),
    },
  });
}

// ---------- FAQ: one chunk per question–answer pair (never split a Q from its A) ----------

export function chunkFaqs(source) {
  const { meta, categories } = parseFaqs(source);
  return categories.flatMap(({ category, questions }) =>
    questions.map(({ q, a }) => {
      const content = `Q: ${q}\nA: ${a}`;
      return finalize({
        id: `faq:${slugify(category)}:${slugify(q)}`,
        docId: 'faqs',
        docType: 'faq',
        title: q,
        section: category,
        url: meta.url || '/faqs',
        content,
        embedText: `${meta.title || 'FAQ'} > ${category}\n${content}`,
        parentId: null,
        metadata: { category: slugify(category), updated: meta.updated || null },
      });
    }),
  );
}

// ---------- Policies: heading-aware split, then recursive split, with parent–child ----------
// Parent = a whole "##" section (what the LLM reads, so it gets full context).
// Children = pieces of that section ≤ maxTokens (what gets embedded, so matches are precise).
// Small sections yield a single child identical to the parent.

export async function chunkPolicy(source, docId, splitter = createPolicySplitter()) {
  const { meta, blocks } = parseMarkdown(source);
  const sections = splitSections(blocks, 2).filter((s) => s.title);
  const parents = [];
  const chunks = [];

  for (const section of sections) {
    // Blocks are joined with blank lines, so the splitter's first separator keeps each paragraph,
    // list and table whole whenever it fits (tables are rendered one "Header: value" row per line)
    const sectionText = section.blocks.map(blockToText).join('\n\n');
    const sectionSlug = slugify(section.title);
    const parentId = `policy:${docId}:${sectionSlug}`;
    const context = `${meta.title} > ${section.title}`;
    parents.push({ id: parentId, docId, title: meta.title, section: section.title, url: meta.url, content: `${context}\n${sectionText}` });

    const pieces = await splitter.splitText(sectionText);
    pieces.forEach((piece, n) => {
      chunks.push(
        finalize({
          id: `${parentId}#${n}`,
          docId,
          docType: 'policy',
          title: meta.title,
          section: section.title,
          url: meta.url,
          content: piece,
          // Contextual prefix: "Refund Policy > 4. Refund Timelines" — a bare "5–7 business days"
          // chunk would otherwise be ambiguous about what it refers to
          embedText: `${context}\n${piece}`,
          parentId,
          metadata: { policy: docId, updated: meta.updated || null, part: n, parts: pieces.length },
        }),
      );
    });
  }
  return { chunks, parents };
}

// ---------- Reviews: aggregated per meal, sanitized (user-generated content) ----------

const EMAIL = /[\w.+-]+@[\w-]+\.[\w.-]+/g;
const PHONE = /\+?\d[\d\s-]{7,}\d/g;
const URL = /\bhttps?:\/\/\S+|\bwww\.\S+/gi;

// Strips anything that could identify a person or smuggle links/instructions into the index
export function sanitizeComment(comment, maxChars = REVIEWS.maxCommentChars) {
  const clean = String(comment || '')
    .replace(EMAIL, '[email]')
    .replace(URL, '[link]')
    .replace(PHONE, '[phone]')
    .replace(/[<>`]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
  return clean.length > maxChars ? `${clean.slice(0, maxChars - 1).trimEnd()}…` : clean;
}

// reviewsByMeal: Map(mealId → [{ rating, comment, createdAt }]). Reviewer names and IDs are
// deliberately never read: personal data stays out of the vector DB.
export function chunkReviews(meals, reviewsByMeal, opts = REVIEWS) {
  const chunks = [];
  for (const meal of meals) {
    const reviews = reviewsByMeal.get(meal.id) || [];
    if (reviews.length < opts.minReviews) continue;

    const ratings = reviews.map((r) => Number(r.rating) || 0);
    const avg = Math.round((ratings.reduce((a, b) => a + b, 0) / ratings.length) * 10) / 10;
    const comments = [...reviews]
      .sort((a, b) => new Date(b.createdAt || 0) - new Date(a.createdAt || 0))
      .map((r) => sanitizeComment(r.comment, opts.maxCommentChars))
      .filter(Boolean)
      .slice(0, opts.maxComments);

    const content = [
      `${meal.name} is rated ${avg} out of 5 from ${reviews.length} customer review${reviews.length === 1 ? '' : 's'}.`,
      ...comments.map((c) => `- "${c}"`),
    ].join('\n');

    chunks.push(
      finalize({
        id: `reviews:${meal.id}`,
        docId: 'reviews',
        docType: 'reviews',
        title: `Reviews of ${meal.name}`,
        section: titleCase(meal.category),
        url: `/meal/${meal.id}`,
        content,
        embedText: `Customer reviews > ${meal.name}\n${content}`,
        parentId: null,
        // trust: lets the prompt fence user-written text so it is quoted, never obeyed
        metadata: { mealId: meal.id, avgRating: avg, reviewCount: reviews.length, trust: 'user-generated' },
      }),
    );
  }
  return chunks;
}

// RAG ingestion: the shared Markdown parser, the recursive splitter, each chunker, the pipeline
// over the real content/ + seed menu, and the manifest diff that drives incremental re-indexing.
import { describe, it, expect } from '@jest/globals';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import db from './support/fakeFirestore.js';
import { parseMarkdown, parseInline, parseFaqs, splitSections, blockToText, parseFrontMatter } from '../../content/markdown.js';
import { Document } from '@langchain/core/documents';
import { createPolicySplitter } from '../rag/ingestion/splitter.js';
import { chunkMeal, chunkFaqs, chunkPolicy, chunkReviews, sanitizeComment, toDocument } from '../rag/ingestion/chunkers.js';
import { buildChunks, runIngestion, buildManifest, diffManifest } from '../rag/ingestion/pipeline.js';
import { loadContentDocs, loadMenu, loadReviews } from '../rag/ingestion/loaders.js';
import { CHUNKER_VERSION, POLICY_CHUNK, approxTokens } from '../rag/config.js';

describe('content/markdown.js', () => {
  it('reads front matter and normalises Windows line endings', () => {
    const { meta, body } = parseFrontMatter('---\r\ntitle: Refund Policy\r\nurl: /refund-policy\r\n---\r\n## A\r\n');
    expect(meta).toEqual({ title: 'Refund Policy', url: '/refund-policy' });
    expect(body).toBe('## A\n');
  });

  it('returns empty meta when there is no front matter', () => {
    expect(parseFrontMatter('# Hi')).toEqual({ meta: {}, body: '# Hi' });
  });

  it('parses bold and links, including bold inside a link label', () => {
    expect(parseInline('Go to **My Orders** or [the **refund** page](/refund-policy).')).toEqual([
      { type: 'text', value: 'Go to ' },
      { type: 'strong', children: [{ type: 'text', value: 'My Orders' }] },
      { type: 'text', value: ' or ' },
      { type: 'link', href: '/refund-policy', children: [
        { type: 'text', value: 'the ' },
        { type: 'strong', children: [{ type: 'text', value: 'refund' }] },
        { type: 'text', value: ' page' },
      ] },
      { type: 'text', value: '.' },
    ]);
  });

  it('parses headings, paragraphs (soft and hard breaks), both list kinds and tables', () => {
    const { blocks } = parseMarkdown(
      ['## Title', '', 'line one', 'still one\\', 'line two', '', '- a', '- b', '', '1. x', '2. y', '', '| H1 | H2 |', '| --- | --- |', '| a | b |'].join('\n'),
    );
    expect(blocks.map((b) => b.type)).toEqual(['heading', 'paragraph', 'list', 'list', 'table']);
    expect(blocks[1].inlines).toEqual([
      { type: 'text', value: 'line one' },
      { type: 'text', value: ' ' },
      { type: 'text', value: 'still one' },
      { type: 'break' },
      { type: 'text', value: 'line two' },
    ]);
    expect(blocks[2].ordered).toBe(false);
    expect(blocks[3].ordered).toBe(true);
    expect(blockToText(blocks[3])).toBe('1. x\n2. y');
    expect(blockToText(blocks[4])).toBe('H1: a; H2: b');
  });

  it('a pipe line without a divider row is just a paragraph', () => {
    expect(parseMarkdown('| not a table |').blocks[0].type).toBe('paragraph');
  });

  it('groups blocks into sections by heading level', () => {
    const { blocks } = parseMarkdown('intro\n\n## A\n\none\n\n## B\n\ntwo');
    const sections = splitSections(blocks, 2);
    expect(sections.map((s) => s.title)).toEqual([null, 'A', 'B']);
    expect(sections[1].blocks).toHaveLength(1);
  });

  it('parses the real FAQ file into the 5 categories the page shows', async () => {
    const { meta, categories } = parseFaqs(await fs.readFile(new URL('../../content/faqs.md', import.meta.url), 'utf8'));
    expect(meta.title).toBe('Frequently Asked Questions');
    expect(categories.map((c) => c.category)).toEqual(['Ordering', 'Delivery', 'Payments', 'Account & Profile', 'Refunds & Complaints']);
    expect(categories.flatMap((c) => c.questions)).toHaveLength(16);
    expect(categories[0].questions[0].q).toBe('How do I place an order?');
  });
});

describe('policy splitter (LangChain RecursiveCharacterTextSplitter, sized in tokens)', () => {
  const words = (n, prefix = 'w') => Array.from({ length: n }, (_, i) => `${prefix}${i}`).join(' ');
  const split = (text, opts) => createPolicySplitter({ ...POLICY_CHUNK, ...opts }).splitText(text);

  it('returns short text untouched', async () => {
    expect(await split('short text', { maxTokens: 100 })).toEqual(['short text']);
  });

  it('rejects an overlap as large as the chunk size (LangChain validates this)', () => {
    expect(() => createPolicySplitter({ ...POLICY_CHUNK, maxTokens: 50, overlapTokens: 50 })).toThrow();
  });

  it('prefers paragraph boundaries over cutting inside a paragraph', async () => {
    const a = words(60, 'a'); // ~59 tokens each, so both together exceed the limit
    const b = words(60, 'b');
    expect(await split(`${a}\n\n${b}`, { maxTokens: 70, overlapTokens: 0 })).toEqual([a, b]);
  });

  it('keeps every chunk within maxTokens and loses no words', async () => {
    const text = Array.from({ length: 12 }, (_, p) => `${words(25, `p${p}-`)}.`).join('\n\n');
    const chunks = await split(text, { maxTokens: 120, overlapTokens: 20 });
    expect(chunks.length).toBeGreaterThan(1);
    for (const c of chunks) expect(approxTokens(c)).toBeLessThanOrEqual(120);
    const seen = new Set(chunks.join(' ').split(/\s+/));
    for (const w of text.split(/\s+/)) expect(seen.has(w)).toBe(true);
  });

  it('overlaps consecutive chunks: each chunk starts with text the previous one ended with', async () => {
    const text = Array.from({ length: 40 }, (_, i) => `Sentence number ${i} is here.`).join(' ');
    const chunks = await split(text, { maxTokens: 60, overlapTokens: 15, separators: ['. ', ' '] });
    expect(chunks.length).toBeGreaterThan(2);
    for (let i = 1; i < chunks.length; i++) {
      const opening = chunks[i].replace(/^\.\s*/, '').split(' ').slice(0, 3).join(' ');
      expect(chunks[i - 1]).toContain(opening);
    }
  });

  it('hard-cuts a single token longer than maxTokens (the final "" separator)', async () => {
    const chunks = await split('x'.repeat(100), { maxTokens: 10, overlapTokens: 0, separators: [' ', ''] });
    expect(chunks.every((c) => approxTokens(c) <= 10)).toBe(true);
    expect(chunks.join('')).toBe('x'.repeat(100));
  });
});

describe('chunkMeal', () => {
  const meal = {
    id: 'm9', name: 'Paneer Tikka', price: '280', description: 'Char-grilled cottage cheese.', category: 'appetizers',
    dietary: ['vegetarian', 'gluten-free'], spiceLevel: 'medium', protein: 'vegetarian', servingSize: 'sharing',
    isChefSpecial: true, availableTime: 'dinner-only', image: 'images/x.jpg',
  };

  it('templates the structured fields into searchable text with a context prefix', () => {
    const chunk = chunkMeal(meal);
    expect(chunk.id).toBe('menu:m9');
    expect(chunk.url).toBe('/meal/m9');
    expect(chunk.content).toMatch(/^Paneer Tikka is a vegetarian \(veg\) appetizer \(starter\) priced at ₹280\./);
    expect(chunk.content).toContain("chef's special");
    expect(chunk.content).toContain('Char-grilled cottage cheese.');
    expect(chunk.embedText.startsWith('Menu > Appetizers > Paneer Tikka\n')).toBe(true);
  });

  it('puts filterable fields in metadata, with price as a number', () => {
    expect(chunkMeal(meal).metadata).toEqual({
      mealId: 'm9', category: 'appetizers', price: 280, isVeg: true, dietary: ['vegetarian', 'gluten-free'],
      spiceLevel: 'medium', protein: 'vegetarian', servingSize: 'sharing', availableTime: 'dinner-only', isChefSpecial: true,
    });
  });

  it('marks meat dishes non-veg even when other dietary tags exist', () => {
    const chunk = chunkMeal({ ...meal, protein: 'chicken', dietary: ['gluten-free'] });
    expect(chunk.metadata.isVeg).toBe(false);
    expect(chunk.content).toContain('non-vegetarian (non-veg)');
  });

  it('hash changes when content or metadata changes, and only then', () => {
    const base = chunkMeal(meal).hash;
    expect(chunkMeal({ ...meal }).hash).toBe(base);
    expect(chunkMeal({ ...meal, image: 'images/other.jpg' }).hash).toBe(base); // image isn't indexed
    expect(chunkMeal({ ...meal, price: '300' }).hash).not.toBe(base);
    expect(chunkMeal({ ...meal, description: 'New.' }).hash).not.toBe(base);
  });
});

describe('chunkFaqs', () => {
  const src = '---\ntitle: FAQ\nurl: /faqs\n---\n## Delivery & Fees\n\n### Do you deliver?\n\nYes.\n\nEverywhere.\n\n### Is it free?\n\nAbove ₹299.\n';

  it('makes one chunk per question with its full answer', () => {
    const chunks = chunkFaqs(src);
    expect(chunks.map((c) => c.id)).toEqual(['faq:delivery-fees:do-you-deliver', 'faq:delivery-fees:is-it-free']);
    expect(chunks[0].content).toBe('Q: Do you deliver?\nA: Yes.\n\nEverywhere.');
    expect(chunks[0].embedText.startsWith('FAQ > Delivery & Fees\n')).toBe(true);
    expect(chunks[0].metadata.category).toBe('delivery-fees');
    expect(chunks[0].url).toBe('/faqs');
  });
});

describe('chunkPolicy', () => {
  it('one parent per section; a small section is a single child that points at it', async () => {
    const { chunks, parents } = await chunkPolicy('---\ntitle: Refund Policy\nurl: /refund-policy\n---\n## 1. Overview\n\nShort.\n\n## 2. More\n\n- a\n- b\n', 'refund-policy');
    expect(parents.map((p) => p.id)).toEqual(['policy:refund-policy:1-overview', 'policy:refund-policy:2-more']);
    expect(chunks.map((c) => c.id)).toEqual(['policy:refund-policy:1-overview#0', 'policy:refund-policy:2-more#0']);
    expect(chunks[1].parentId).toBe('policy:refund-policy:2-more');
    expect(chunks[1].content).toBe('- a\n- b');
    expect(chunks[1].embedText).toBe('Refund Policy > 2. More\n- a\n- b');
    expect(parents[1].content).toBe('Refund Policy > 2. More\n- a\n- b');
  });

  it('splits a long section into several children that all share its parent', async () => {
    const para = (n) => `Paragraph ${n}: ${'lorem ipsum dolor sit amet '.repeat(12).trim()}.`;
    const long = Array.from({ length: 10 }, (_, n) => para(n)).join('\n\n');
    const { chunks, parents } = await chunkPolicy(`---\ntitle: T\n---\n## Big\n\n${long}\n`, 't');
    expect(parents).toHaveLength(1);
    expect(chunks.length).toBeGreaterThan(1);
    expect(chunks.every((c) => c.parentId === 'policy:t:big')).toBe(true);
    expect(chunks.every((c) => approxTokens(c.content) <= POLICY_CHUNK.maxTokens)).toBe(true);
    expect(chunks.map((c) => c.metadata.part)).toEqual(chunks.map((_, i) => i));
  });

  it('keeps a table whole, one "Header: value" line per row', async () => {
    const src = await fs.readFile(new URL('../../content/refund-policy.md', import.meta.url), 'utf8');
    const table = (await chunkPolicy(src, 'refund-policy')).chunks.find((c) => c.section === '4. Refund Timelines');
    expect(table.content.split('\n')).toEqual([
      'Refund Method: Original Payment Method (Razorpay / PhonePe / Cashfree); Processing Time: 5–7 business days',
      'Refund Method: Platform Credits (Wallet); Processing Time: Instant — within 2 hours',
      'Refund Method: Bank Transfer; Processing Time: 7–10 business days',
    ]);
  });
});

describe('chunkReviews', () => {
  const meals = [{ id: 'm1', name: 'Mac & Cheese', category: 'entrees' }, { id: 'm2', name: 'Soup', category: 'soups' }];

  it('aggregates per meal: average, count and newest comments first; skips meals without reviews', () => {
    const reviews = new Map([['m1', [
      { rating: 5, comment: 'Old one', createdAt: '2025-01-01' },
      { rating: 4, comment: 'New one', createdAt: '2025-06-01' },
      { rating: 4, comment: '', createdAt: '2025-03-01' },
    ]]]);
    const chunks = chunkReviews(meals, reviews);
    expect(chunks).toHaveLength(1);
    expect(chunks[0].id).toBe('reviews:m1');
    expect(chunks[0].content).toBe('Mac & Cheese is rated 4.3 out of 5 from 3 customer reviews.\n- "New one"\n- "Old one"');
    expect(chunks[0].metadata).toEqual({ mealId: 'm1', avgRating: 4.3, reviewCount: 3, trust: 'user-generated' });
  });

  it('caps the number of comments kept', () => {
    const many = Array.from({ length: 9 }, (_, i) => ({ rating: 3, comment: `c${i}`, createdAt: `2025-01-0${i + 1}` }));
    const [chunk] = chunkReviews(meals, new Map([['m1', many]]), { maxComments: 2, maxCommentChars: 50, minReviews: 1 });
    expect(chunk.content.split('\n').slice(1)).toEqual(['- "c8"', '- "c7"']);
  });

  it('sanitizes comments: no emails, phone numbers, links or markup; long text truncated', () => {
    expect(sanitizeComment('Mail me at a.b+c@x.co or call +91 98765 43210, see https://evil.test/x <b>now</b>'))
      .toBe('Mail me at [email] or call [phone], see [link] bnow/b');
    expect(sanitizeComment('a'.repeat(300), 20)).toBe(`${'a'.repeat(19)}…`);
  });
});

describe('loaders', () => {
  it('loads every Markdown file in content/ with its type', async () => {
    const docs = await loadContentDocs();
    expect(docs.map((d) => `${d.docId}:${d.docType}`)).toEqual([
      'faqs:faq', 'privacy-policy:policy', 'refund-policy:policy', 'terms-and-conditions:policy',
    ]);
  });

  it('menu comes from the seed file offline, and from Firestore in menu order when a db is given', async () => {
    expect((await loadMenu()).length).toBe(150);
    await db.collection('meals').doc('b').set({ id: 'b', name: 'B', sortOrder: 2 });
    await db.collection('meals').doc('a').set({ id: 'a', name: 'A', sortOrder: 1 });
    expect(await loadMenu(db)).toEqual([{ id: 'a', name: 'A' }, { id: 'b', name: 'B' }]);
  });

  it('reviews are grouped by meal and never carry who wrote them', async () => {
    await db.collection('reviews').add({ mealId: 'm1', userId: 'u1', userName: 'Asha', rating: 5, comment: 'Great', createdAt: '2025-01-01' });
    await db.collection('reviews').add({ mealId: 'm1', userId: 'u2', userName: 'Ravi', rating: 3, comment: 'Ok', createdAt: '2025-01-02' });
    await db.collection('reviews').add({ rating: 1, comment: 'orphan' });
    const byMeal = await loadReviews(db);
    expect([...byMeal.keys()]).toEqual(['m1']);
    expect(byMeal.get('m1')).toEqual([
      { rating: 5, comment: 'Great', createdAt: '2025-01-01' },
      { rating: 3, comment: 'Ok', createdAt: '2025-01-02' },
    ]);
    expect(await loadReviews()).toEqual(new Map());
  });
});

describe('pipeline', () => {
  it('chunks the real content and seed menu with unique ids and sane sizes', async () => {
    const { chunks, parents, stats } = await runIngestion();
    expect(stats.byType.faq.count).toBe(16);
    expect(stats.byType.menu.count).toBe(150);
    expect(stats.byType.policy.count).toBe(parents.length);
    expect(stats.byType.reviews).toBeUndefined(); // offline: no reviews
    expect(new Set(chunks.map((c) => c.id)).size).toBe(chunks.length);
    for (const c of chunks) {
      expect(c.tokens).toBeGreaterThan(0);
      expect(c.tokens).toBeLessThanOrEqual(512); // the embedding model's input limit
      expect(c.chunkerVersion).toBe(CHUNKER_VERSION);
      expect(c.embedText).toContain(c.content);
      if (c.parentId) expect(parents.some((p) => p.id === c.parentId)).toBe(true);
    }
  });

  it('includes review chunks when Firestore has reviews', async () => {
    await db.collection('meals').doc('m1').set({ id: 'm1', name: 'Mac & Cheese', price: '350', category: 'entrees', sortOrder: 0 });
    await db.collection('reviews').add({ mealId: 'm1', rating: 4, comment: 'Nice', createdAt: '2025-01-01' });
    const { stats } = await runIngestion({ db });
    expect(stats.byType.menu.count).toBe(1);
    expect(stats.byType.reviews.count).toBe(1);
  });

  it('rejects duplicate chunk ids (two meals with the same id would overwrite each other)', async () => {
    const meal = { id: 'm1', name: 'X', price: '1', category: 'sides' };
    await expect(buildChunks({ docs: [], meals: [meal, meal] })).rejects.toThrow(/Duplicate chunk id: menu:m1/);
  });

  it('also returns every chunk as a LangChain Document (embedded text + payload metadata)', async () => {
    const { chunks, documents } = await runIngestion();
    expect(documents).toHaveLength(chunks.length);
    const doc = documents.find((d) => d.id === 'menu:m1');
    expect(doc).toBeInstanceOf(Document);
    expect(doc.pageContent).toBe(chunks.find((c) => c.id === 'menu:m1').embedText);
    expect(doc.metadata).toMatchObject({ id: 'menu:m1', docType: 'menu', url: '/meal/m1', isVeg: true, price: 350, chunkerVersion: CHUNKER_VERSION });
    expect(doc.metadata.content).toContain('Mac & Cheese');
    expect(toDocument(chunks[0]).metadata.embedText).toBeUndefined(); // not duplicated into the payload
  });
});

describe('manifest diff (incremental re-indexing)', () => {
  const chunk = (id, hash) => ({ id, hash });

  it('first run: everything is added', () => {
    const diff = diffManifest(null, [chunk('a', '1'), chunk('b', '2')]);
    expect(diff).toEqual({ added: ['a', 'b'], changed: [], unchanged: [], removed: [], fullReindex: true });
  });

  it('later runs: classifies added, changed, unchanged and removed', () => {
    const previous = buildManifest([chunk('a', '1'), chunk('b', '2'), chunk('gone', '3')], 'then');
    const diff = diffManifest(previous, [chunk('a', '1'), chunk('b', 'CHANGED'), chunk('new', '4')]);
    expect(diff).toEqual({ added: ['new'], changed: ['b'], unchanged: ['a'], removed: ['gone'], fullReindex: false });
  });

  it('a new chunker version re-indexes everything', () => {
    const previous = { ...buildManifest([chunk('a', '1'), chunk('gone', '2')]), chunkerVersion: CHUNKER_VERSION - 1 };
    const diff = diffManifest(previous, [chunk('a', '1'), chunk('new', '3')]);
    expect(diff).toEqual({ added: ['new'], changed: ['a'], unchanged: [], removed: ['gone'], fullReindex: true });
  });

  it('a content edit changes exactly the affected chunk', async () => {
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'rag-'));
    const contentDir = new URL('../../content/', import.meta.url);
    for (const f of await fs.readdir(contentDir)) {
      if (f.endsWith('.md')) await fs.copyFile(new URL(f, contentDir), path.join(dir, f));
    }
    const before = await runIngestion({ contentDir: dir });
    const refund = path.join(dir, 'refund-policy.md');
    await fs.writeFile(refund, (await fs.readFile(refund, 'utf8')).replace('5–7 business days', '3–5 business days'));
    const after = await runIngestion({ contentDir: dir });
    await fs.rm(dir, { recursive: true, force: true });

    const diff = diffManifest(buildManifest(before.chunks), after.chunks);
    expect(diff.changed).toEqual(['policy:refund-policy:4-refund-timelines#0']);
    expect(diff.added).toEqual([]);
    expect(diff.removed).toEqual([]);
  });
});

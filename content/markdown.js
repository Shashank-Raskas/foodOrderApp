// A small Markdown parser shared by the React pages (which render it) and the RAG ingestion
// pipeline (which chunks it). Keeping one source of truth means the chatbot answers from exactly
// the text a customer sees on the site.
//
// Supported, deliberately small subset:
//   front matter (--- key: value ---), #/##/### headings, paragraphs, "- " bullet lists,
//   "1. " numbered lists, GFM pipe tables, **bold**, [text](url), and a trailing "\" for a line break.
// Anything else is treated as paragraph text.
//
// Output: { meta, blocks }, where blocks are
//   { type: 'heading', level, text }
//   { type: 'paragraph', inlines }
//   { type: 'list', ordered, items: [inlines] }
//   { type: 'table', header: [inlines], rows: [[inlines]] }
// and inlines are { type: 'text', value } | { type: 'strong', children } |
//   { type: 'link', href, children } | { type: 'break' }.

const HEADING = /^(#{1,6})\s+(.*)$/;
const BULLET = /^[-*]\s+(.*)$/;
const NUMBERED = /^\d+\.\s+(.*)$/;
const TABLE_ROW = /^\|.*\|$/;
const TABLE_DIVIDER = /^\|(\s*:?-{3,}:?\s*\|)+$/;

export function parseFrontMatter(source) {
  const text = source.replace(/\r\n?/g, '\n');
  const match = /^---\n([\s\S]*?)\n---\n?/.exec(text);
  if (!match) return { meta: {}, body: text };
  const meta = {};
  for (const line of match[1].split('\n')) {
    const i = line.indexOf(':');
    if (i > 0) meta[line.slice(0, i).trim()] = line.slice(i + 1).trim();
  }
  return { meta, body: text.slice(match[0].length) };
}

// Inline syntax: **bold** and [label](href); bold may contain links and vice versa is not needed.
export function parseInline(text) {
  const out = [];
  const pattern = /\*\*(.+?)\*\*|\[([^\]]+)\]\(([^)\s]+)\)/g;
  let last = 0;
  let m;
  while ((m = pattern.exec(text))) {
    if (m.index > last) out.push({ type: 'text', value: text.slice(last, m.index) });
    if (m[1] !== undefined) out.push({ type: 'strong', children: parseInline(m[1]) });
    else out.push({ type: 'link', href: m[3], children: parseInline(m[2]) });
    last = pattern.lastIndex;
  }
  if (last < text.length) out.push({ type: 'text', value: text.slice(last) });
  return out;
}

// Joins the source lines of one paragraph: a trailing backslash is a hard line break, otherwise a space.
function paragraphInlines(lines) {
  const out = [];
  lines.forEach((line, i) => {
    const hardBreak = line.endsWith('\\');
    const content = hardBreak ? line.slice(0, -1) : line;
    out.push(...parseInline(content));
    if (i < lines.length - 1) out.push(hardBreak ? { type: 'break' } : { type: 'text', value: ' ' });
  });
  return out;
}

const splitRow = (line) => line.slice(1, -1).split('|').map((cell) => parseInline(cell.trim()));

export function parseMarkdown(source) {
  const { meta, body } = parseFrontMatter(source);
  const lines = body.split('\n');
  const blocks = [];
  let i = 0;

  while (i < lines.length) {
    const line = lines[i].trim();
    if (!line) { i++; continue; }

    const heading = HEADING.exec(line);
    if (heading) {
      blocks.push({ type: 'heading', level: heading[1].length, text: heading[2].trim() });
      i++;
      continue;
    }

    if (TABLE_ROW.test(line) && TABLE_DIVIDER.test((lines[i + 1] || '').trim())) {
      const header = splitRow(line);
      const rows = [];
      i += 2;
      while (i < lines.length && TABLE_ROW.test(lines[i].trim())) rows.push(splitRow(lines[i++].trim()));
      blocks.push({ type: 'table', header, rows });
      continue;
    }

    const listKind = BULLET.test(line) ? BULLET : NUMBERED.test(line) ? NUMBERED : null;
    if (listKind) {
      const items = [];
      while (i < lines.length && listKind.test(lines[i].trim())) {
        items.push(parseInline(listKind.exec(lines[i].trim())[1]));
        i++;
      }
      blocks.push({ type: 'list', ordered: listKind === NUMBERED, items });
      continue;
    }

    // Paragraph: this line plus following ones until a blank line or the start of another block.
    // The first line is always consumed (e.g. a lone "| … |" line that isn't a table), so the
    // loop can never stall on a line no other rule claims.
    const para = [line];
    i++;
    while (i < lines.length) {
      const l = lines[i].trim();
      if (!l || HEADING.test(l) || BULLET.test(l) || NUMBERED.test(l) || TABLE_ROW.test(l)) break;
      para.push(l);
      i++;
    }
    blocks.push({ type: 'paragraph', inlines: paragraphInlines(para) });
  }

  return { meta, blocks };
}

// ---- Plain-text helpers (used by RAG chunking and anywhere text without markup is needed) ----

export function inlinesToText(inlines) {
  return inlines
    .map((n) => (n.type === 'text' ? n.value : n.type === 'break' ? '\n' : inlinesToText(n.children)))
    .join('');
}

export function blockToText(block) {
  switch (block.type) {
    case 'heading':
      return block.text;
    case 'paragraph':
      return inlinesToText(block.inlines);
    case 'list':
      return block.items.map((item, n) => `${block.ordered ? `${n + 1}.` : '-'} ${inlinesToText(item)}`).join('\n');
    case 'table': {
      // Tables become one "Header: value" line per row, so each row reads as a standalone fact
      const header = block.header.map(inlinesToText);
      return block.rows
        .map((row) => row.map((cell, c) => `${header[c] ?? `Column ${c + 1}`}: ${inlinesToText(cell)}`).join('; '))
        .join('\n');
    }
    default:
      return '';
  }
}

// Groups blocks under their nearest heading of `level` (e.g. 2 → one section per "##").
// Blocks before the first such heading go into a section with a null title.
export function splitSections(blocks, level = 2) {
  const sections = [];
  let current = { title: null, blocks: [] };
  for (const block of blocks) {
    if (block.type === 'heading' && block.level === level) {
      if (current.title !== null || current.blocks.length) sections.push(current);
      current = { title: block.text, blocks: [] };
    } else {
      current.blocks.push(block);
    }
  }
  if (current.title !== null || current.blocks.length) sections.push(current);
  return sections;
}

// FAQ documents: "## Category" then "### Question" followed by answer paragraphs.
export function parseFaqs(source) {
  const { meta, blocks } = parseMarkdown(source);
  const categories = splitSections(blocks, 2)
    .filter((s) => s.title)
    .map((section) => ({
      category: section.title,
      questions: splitSections(section.blocks, 3)
        .filter((q) => q.title)
        .map((q) => ({ q: q.title, a: q.blocks.map(blockToText).join('\n\n') })),
    }));
  return { meta, categories };
}

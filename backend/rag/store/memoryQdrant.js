// In-memory stand-in for the parts of the Qdrant JS client the RAG code uses. Used by the unit tests
// and by the offline retrieval eval (which runs without any keys or network, e.g. in CI).
// Dense search is brute-force dot product (the vectors are normalized, so this is cosine);
// sparse search is a dot product over shared terms, with Qdrant's BM25 IDF applied when the
// collection's sparse vector has modifier "idf"; fusion is RRF over the prefetch rankings.

const dot = (a, b) => a.reduce((s, v, i) => s + v * (b[i] || 0), 0);
const sparseDot = (q, d, idf) => {
  if (!d) return 0;
  const weights = new Map(d.indices.map((idx, i) => [idx, d.values[i]]));
  return q.indices.reduce((s, idx, i) => s + q.values[i] * (weights.get(idx) || 0) * (idf ? idf(idx) : 1), 0);
};

// IDF the way Qdrant computes it for modifier "idf": ln(1 + (N − df + 0.5) / (df + 0.5))
function idfFor(points, using) {
  const df = new Map();
  for (const p of points) for (const idx of p.vector[using]?.indices ?? []) df.set(idx, (df.get(idx) || 0) + 1);
  const n = points.length;
  return (idx) => Math.log(1 + (n - (df.get(idx) || 0) + 0.5) / ((df.get(idx) || 0) + 0.5));
}
const get = (obj, path) => path.split('.').reduce((o, k) => (o == null ? undefined : o[k]), obj);

function matches(payload, filter) {
  if (!filter?.must) return true;
  return filter.must.every(({ key, match, range }) => {
    const value = get(payload, key);
    if (match?.any) return match.any.includes(value);
    if (match) return value === match.value;
    if (range) return (range.lte === undefined || value <= range.lte) && (range.gte === undefined || value >= range.gte);
    return true;
  });
}

export function createMemoryQdrant() {
  const collections = new Map(); // name → { config, points: Map(id → point), indexes: {} }
  const aliases = new Map(); // alias → collection
  const calls = [];

  const resolve = (name) => {
    const real = aliases.get(name) ?? name;
    const c = collections.get(real);
    if (!c) throw new Error(`Not found: collection ${name}`);
    return c;
  };

  function rank(c, { query, using, filter, limit }) {
    const all = [...c.points.values()];
    const candidates = all.filter((p) => matches(p.payload, filter));
    // IDF is computed over the whole collection (as Qdrant does), not just the filtered points
    const idf = !Array.isArray(query) && c.config?.sparse_vectors?.[using]?.modifier === 'idf' ? idfFor(all, using) : null;
    const score = (p) => (Array.isArray(query) ? dot(query, p.vector[using]) : sparseDot(query, p.vector[using], idf));
    return candidates
      .map((p) => ({ p, score: score(p) }))
      .filter((r) => Array.isArray(query) || r.score > 0)
      .sort((a, b) => b.score - a.score)
      .slice(0, limit);
  }

  const client = {
    calls,
    collections,
    aliases,
    async getAliases() {
      return { aliases: [...aliases].map(([alias_name, collection_name]) => ({ alias_name, collection_name })) };
    },
    async getCollections() {
      return { collections: [...collections.keys()].map((name) => ({ name })) };
    },
    async createCollection(name, config) {
      calls.push(['createCollection', name, config]);
      collections.set(name, { config, points: new Map(), indexes: {} });
    },
    async createPayloadIndex(name, { field_name, field_schema }) {
      resolve(name).indexes[field_name] = field_schema;
    },
    async deleteCollection(name) {
      calls.push(['deleteCollection', name]);
      collections.delete(name);
    },
    async updateCollectionAliases({ actions }) {
      calls.push(['updateCollectionAliases', actions]);
      for (const a of actions) {
        if (a.delete_alias) {
          if (!aliases.has(a.delete_alias.alias_name)) throw new Error('alias does not exist');
          aliases.delete(a.delete_alias.alias_name);
        }
        if (a.create_alias) aliases.set(a.create_alias.alias_name, a.create_alias.collection_name);
      }
    },
    async upsert(name, { points }) {
      calls.push(['upsert', name, points.length]);
      const c = resolve(name);
      for (const p of points) c.points.set(p.id, structuredClone(p));
    },
    async delete(name, { points }) {
      calls.push(['delete', name, points]);
      const c = resolve(name);
      for (const id of points) c.points.delete(id);
    },
    async count(name) {
      return { count: resolve(name).points.size };
    },
    async scroll(name, { limit, offset = 0 }) {
      const all = [...resolve(name).points.values()];
      const page = all.slice(offset, offset + limit);
      return { points: page.map((p) => ({ id: p.id, payload: p.payload })), next_page_offset: offset + limit < all.length ? offset + limit : null };
    },
    async query(name, req) {
      calls.push(['query', name, req]);
      const c = resolve(name);
      const out = (rows) => ({
        points: rows.map(({ p, score }) => ({ id: p.id, score, payload: p.payload, ...(req.with_vector ? { vector: p.vector } : {}) })),
      });
      if (req.prefetch) {
        const fused = new Map();
        for (const pre of req.prefetch) {
          rank(c, pre).forEach(({ p }, i) => {
            const entry = fused.get(p.id) || { p, score: 0 };
            entry.score += 1 / (60 + i + 1);
            fused.set(p.id, entry);
          });
        }
        return out([...fused.values()].sort((a, b) => b.score - a.score).slice(0, req.limit));
      }
      return out(rank(c, req));
    },
  };
  return client;
}

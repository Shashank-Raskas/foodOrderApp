// In-memory stand-in for the parts of the Firestore Admin SDK the backend uses
// (collection/doc/where/limit/get/add/set/update/delete, batches and transactions).
// Tests and the e2e server swap it in for ../../firebase.js so nothing touches the real database.
import crypto from 'node:crypto';

const clone = (value) => (value === undefined ? undefined : structuredClone(value));

function createFakeFirestore() {
  const store = new Map(); // collection name -> Map(docId -> data)
  const coll = (name) => {
    if (!store.has(name)) store.set(name, new Map());
    return store.get(name);
  };

  class DocSnapshot {
    constructor(ref, data) {
      this.ref = ref;
      this.id = ref.id;
      this.exists = data !== undefined;
      this._data = data;
    }
    data() { return clone(this._data); }
  }

  class QuerySnapshot {
    constructor(docs) {
      this.docs = docs;
      this.empty = docs.length === 0;
      this.size = docs.length;
    }
    forEach(fn) { this.docs.forEach(fn); }
  }

  class DocRef {
    constructor(collection, id) {
      this.collection = collection;
      this.id = id;
    }
    async get() { return new DocSnapshot(this, clone(coll(this.collection).get(this.id))); }
    async set(data) { coll(this.collection).set(this.id, clone(data)); }
    async update(data) {
      const docs = coll(this.collection);
      if (!docs.has(this.id)) throw new Error(`5 NOT_FOUND: No document to update: ${this.collection}/${this.id}`);
      docs.set(this.id, { ...docs.get(this.id), ...clone(data) });
    }
    async delete() { coll(this.collection).delete(this.id); }
  }

  class Query {
    constructor(collection, filters = [], max = null) {
      this.collection = collection;
      this.filters = filters;
      this.max = max;
    }
    where(field, op, value) {
      if (op !== '==') throw new Error(`fakeFirestore only supports '==' (got '${op}')`);
      return new Query(this.collection, [...this.filters, [field, value]], this.max);
    }
    limit(n) { return new Query(this.collection, this.filters, n); }
    async get() {
      let docs = [...coll(this.collection).entries()]
        .filter(([, data]) => this.filters.every(([field, value]) => data[field] === value))
        .map(([id, data]) => new DocSnapshot(new DocRef(this.collection, id), clone(data)));
      if (this.max != null) docs = docs.slice(0, this.max);
      return new QuerySnapshot(docs);
    }
  }

  class CollectionRef extends Query {
    doc(id) {
      if (id !== undefined && (typeof id !== 'string' || id === '' || id.includes('/'))) {
        throw new Error(`Invalid document id: ${id}`);
      }
      return new DocRef(this.collection, id ?? crypto.randomBytes(10).toString('hex'));
    }
    async add(data) {
      const ref = this.doc();
      await ref.set(data);
      return ref;
    }
  }

  class WriteBatch {
    ops = [];
    set(ref, data) { this.ops.push(() => ref.set(data)); return this; }
    update(ref, data) { this.ops.push(() => ref.update(data)); return this; }
    delete(ref) { this.ops.push(() => ref.delete()); return this; }
    async commit() { for (const op of this.ops) await op(); }
  }

  // Transactions run one at a time and apply their writes only if the callback succeeds,
  // and (like Firestore) they reject reads after the first write.
  let queue = Promise.resolve();
  function runTransaction(fn) {
    const run = queue.then(async () => {
      const writes = new WriteBatch();
      let hasWritten = false;
      const t = {
        get(refOrQuery) {
          if (hasWritten) throw new Error('Firestore transactions require all reads to be executed before all writes.');
          return refOrQuery.get();
        },
        set(ref, data) { hasWritten = true; writes.set(ref, data); return t; },
        update(ref, data) { hasWritten = true; writes.update(ref, data); return t; },
        delete(ref) { hasWritten = true; writes.delete(ref); return t; },
      };
      const result = await fn(t);
      await writes.commit();
      return result;
    });
    queue = run.catch(() => {});
    return run;
  }

  return {
    collection: (name) => new CollectionRef(name),
    batch: () => new WriteBatch(),
    runTransaction,

    // ── Test helpers (not part of the Firestore API) ──
    /** Remove all data. */
    reset() { store.clear(); },
    /** All docs in a collection as { id: data }. */
    dump(collection) { return Object.fromEntries([...coll(collection)].map(([id, d]) => [id, clone(d)])); },
    /** Write (or with data === null, delete) a doc directly. */
    put(collection, id, data) {
      if (data === null) coll(collection).delete(id);
      else coll(collection).set(id, clone(data));
    },
  };
}

// One shared instance per process, so every import (and re-import after jest.resetModules) sees the same data
globalThis.__fakeFirestore ??= createFakeFirestore();
const db = globalThis.__fakeFirestore;
export default db;

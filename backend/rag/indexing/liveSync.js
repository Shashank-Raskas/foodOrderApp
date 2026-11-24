// Keeps the chatbot's index in step with the live data: when an admin edits the menu or a customer
// posts a review, re-index in the background and clear the semantic cache.
//
// - Debounced: an admin editing five dishes in a row triggers one sync, a few seconds after the last edit.
// - Incremental only: syncIndex re-embeds just the changed chunks (usually one dish). If the index's
//   signature changed (new chunking or embedding model after a deploy), it does NOT rebuild here —
//   a full rebuild belongs to `npm run rag:ingest`, not to the small production server.
// - Isolated: a failed sync is logged and retried on the next change; it never affects the request
//   that triggered it (the change notification doesn't wait for it).

import { runIngestion } from '../ingestion/pipeline.js';
import { syncIndex, indexSignature, resolveAlias } from '../store/indexer.js';
import { INDEX } from '../config.js';

export function createLiveSync({ client, embeddings, db, cache = null, debounceMs = 5000, log = console }) {
  let timer = null;
  let running = null;
  let pending = false;
  const status = { lastRunAt: null, lastResult: null, lastError: null, runs: 0 };

  async function run() {
    if (running) {
      pending = true; // another change arrived mid-sync: run once more afterwards
      return running;
    }
    running = (async () => {
      const started = Date.now();
      try {
        const live = await resolveAlias(client);
        if (!live || !live.startsWith(`${INDEX.collectionPrefix}_${indexSignature()}_`)) {
          status.lastResult = 'skipped: the index needs a full rebuild (run npm run rag:ingest -- --firestore)';
          log.warn?.(`[Chat] Live re-index skipped: index ${live ?? '(none)'} doesn't match this version's signature`);
          return;
        }
        const { documents } = await runIngestion({ db });
        const report = await syncIndex({ client, embeddings, documents });
        cache?.clear(); // answers may mention changed prices or dishes
        const { added, changed, removed } = report.diff;
        status.lastResult = `${added.length} added, ${changed.length} changed, ${removed.length} removed in ${Date.now() - started} ms`;
        status.lastError = null;
        log.log?.(`[Chat] Live re-index: ${status.lastResult}`);
      } catch (err) {
        status.lastError = err.message;
        log.warn?.('[Chat] Live re-index failed (will retry on the next change):', err.message);
      } finally {
        status.lastRunAt = new Date().toISOString();
        status.runs++;
        running = null;
        if (pending) {
          pending = false;
          schedule('pending');
        }
      }
    })();
    return running;
  }

  function schedule(reason = 'change') {
    clearTimeout(timer);
    timer = setTimeout(() => {
      timer = null;
      run();
    }, debounceMs);
    timer.unref?.();
    return reason;
  }

  return {
    schedule,
    /** Runs immediately (tests, scripts); resolves when the sync finishes. */
    runNow: run,
    status: () => ({ ...status, scheduled: Boolean(timer), running: Boolean(running) }),
    stop: () => clearTimeout(timer),
  };
}

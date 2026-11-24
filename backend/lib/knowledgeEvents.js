// A tiny in-process signal: "content the chatbot knows about has changed" (menu edits, new reviews).
// The menu and review code only announce changes here; the chatbot subscribes and re-indexes in the
// background. Keeping it one-way means the core order/menu code never imports or waits on the RAG code.

import { EventEmitter } from 'node:events';

const events = new EventEmitter();

/** Announce a change, e.g. notifyKnowledgeChange('menu'). Never throws, never waits. */
export function notifyKnowledgeChange(source) {
  try {
    events.emit('change', source);
  } catch (err) {
    console.warn('[Knowledge] Listener failed:', err.message);
  }
}

/** Subscribe; returns an unsubscribe function. */
export function onKnowledgeChange(listener) {
  events.on('change', listener);
  return () => events.off('change', listener);
}

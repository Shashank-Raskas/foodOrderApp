import { useCallback, useEffect, useRef, useState } from 'react';
import authFetch from '../../config/authFetch';
import { API_ENDPOINTS } from '../../config/api';
import { readSse } from './sse';

// The conversation survives page navigation and reloads within this tab, but not across tabs/devices
const STORAGE_KEY = 'chat:v1';
// A random id per conversation, so its messages are grouped as one session in the server's traces
const SESSION_KEY = 'chat:session';

function newSessionId() {
  const id = globalThis.crypto?.randomUUID?.() ?? `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 12)}`;
  try {
    sessionStorage.setItem(SESSION_KEY, id);
  } catch {
    /* storage unavailable: a fresh id per page load is fine */
  }
  return id;
}

function loadSessionId() {
  try {
    return sessionStorage.getItem(SESSION_KEY) || newSessionId();
  } catch {
    return newSessionId();
  }
}
const HISTORY_SENT = 6; // the server keeps the last 6 anyway
export const MAX_MESSAGE_CHARS = 500;

function loadMessages() {
  try {
    const saved = JSON.parse(sessionStorage.getItem(STORAGE_KEY));
    return Array.isArray(saved) ? saved.filter((m) => m.role === 'user' || m.status === 'done') : [];
  } catch {
    return [];
  }
}

let nextId = 0;
const newId = () => `${Date.now()}-${nextId++}`;

/**
 * Chat state + streaming. Messages:
 *   { id, role: 'user', text }
 *   { id, role: 'assistant', text, status: 'streaming' | 'done' | 'stopped' | 'error',
 *     citations, mealIds, signInRequired, error }
 */
export default function useChat() {
  const [messages, setMessages] = useState(loadMessages);
  const [isStreaming, setIsStreaming] = useState(false);
  const controllerRef = useRef(null);
  const sessionRef = useRef(null);
  sessionRef.current ??= loadSessionId();

  useEffect(() => {
    try {
      sessionStorage.setItem(STORAGE_KEY, JSON.stringify(messages.filter((m) => m.status === 'done' || m.role === 'user')));
    } catch {
      /* private mode or storage full: the chat still works, it just isn't kept */
    }
  }, [messages]);

  // Stop any answer in flight when the chat is unmounted
  useEffect(() => () => controllerRef.current?.abort(), []);

  const update = (id, patch) => setMessages((all) => all.map((m) => (m.id === id ? { ...m, ...(typeof patch === 'function' ? patch(m) : patch) } : m)));

  const send = useCallback(
    async (rawText) => {
      const text = rawText.trim().slice(0, MAX_MESSAGE_CHARS);
      if (!text || controllerRef.current) return;

      // Only finished turns go to the server as history
      const history = messages
        .filter((m) => m.role === 'user' || m.status === 'done')
        .slice(-HISTORY_SENT)
        .map((m) => ({ role: m.role, content: m.text }));

      const answerId = newId();
      setMessages((all) => [
        ...all,
        { id: newId(), role: 'user', text },
        { id: answerId, role: 'assistant', text: '', status: 'streaming', citations: [], mealIds: [] },
      ]);
      setIsStreaming(true);
      const controller = new AbortController();
      controllerRef.current = controller;

      try {
        // authFetch adds the token when signed in, and refreshes it if it has expired
        const res = await authFetch(API_ENDPOINTS.CHAT, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ message: text, history, sessionId: sessionRef.current }),
          signal: controller.signal,
        });
        if (!res.ok || !res.body) {
          let message = 'Sorry, the assistant is not available right now. Please try again later.';
          try {
            message = (await res.json()).message || message;
          } catch {
            /* not JSON */
          }
          update(answerId, { status: 'error', error: message });
          return;
        }

        let finished = false;
        for await (const { event, data } of readSse(res.body)) {
          if (event === 'token') {
            update(answerId, (m) => ({ text: m.text + data.text }));
          } else if (event === 'done') {
            finished = true;
            update(answerId, {
              text: data.answer,
              status: 'done',
              citations: data.citations || [],
              mealIds: data.mealIds || [],
              signInRequired: Boolean(data.signInRequired),
              traceId: data.traceId, // present when the server records traces; enables 👍/👎
            });
          } else if (event === 'error') {
            finished = true;
            update(answerId, { status: 'error', error: data.message });
          }
        }
        if (!finished) update(answerId, { status: 'error', error: 'The answer was interrupted. Please try again.' });
      } catch (err) {
        if (err.name === 'AbortError') update(answerId, { status: 'stopped' });
        else update(answerId, { status: 'error', error: 'Could not reach the assistant. Check your connection and try again.' });
      } finally {
        controllerRef.current = null;
        setIsStreaming(false);
      }
    },
    [messages],
  );

  const stop = useCallback(() => controllerRef.current?.abort(), []);

  /** 👍 / 👎 on an answer. Best-effort: the button shows "thanks" even if the request fails. */
  const sendFeedback = useCallback((message, helpful) => {
    if (message.feedback || !message.traceId) return;
    setMessages((all) => all.map((m) => (m.id === message.id ? { ...m, feedback: helpful ? 'up' : 'down' } : m)));
    fetch(API_ENDPOINTS.CHAT_FEEDBACK, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ traceId: message.traceId, helpful }),
    }).catch(() => {});
  }, []);

  const clear = useCallback(() => {
    controllerRef.current?.abort();
    setMessages([]);
    sessionRef.current = newSessionId(); // a new chat is a new session
  }, []);

  return { messages, isStreaming, send, stop, clear, sendFeedback };
}

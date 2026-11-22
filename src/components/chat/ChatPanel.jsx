import { useEffect, useRef, useState } from 'react';
import useHttp from '../../hooks/useHttp';
import { API_ENDPOINTS } from '../../config/api';
import useChat, { MAX_MESSAGE_CHARS } from './useChat';
import ChatMessage from './ChatMessage';

// Same request as the menu page, so the cached menu is reused for the meal cards
const menuRequest = {};

const SUGGESTIONS = ['Something spicy and veg under ₹300?', 'How long do refunds take?', 'Where is my order?', 'Do you deliver to Gachibowli?'];

export default function ChatPanel({ onClose }) {
  const { messages, isStreaming, send, stop, clear } = useChat();
  const { data: menu } = useHttp(API_ENDPOINTS.MEALS, menuRequest, []);
  const [draft, setDraft] = useState('');
  const inputRef = useRef(null);
  const listRef = useRef(null);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  // Keep the newest text in view while it streams in
  useEffect(() => {
    const list = listRef.current;
    if (list) list.scrollTop = list.scrollHeight;
  }, [messages]);

  function submit(event) {
    event.preventDefault();
    if (!draft.trim() || isStreaming) return;
    send(draft);
    setDraft('');
  }

  function handleKeyDown(event) {
    // Enter sends; Shift+Enter adds a new line
    if (event.key === 'Enter' && !event.shiftKey) submit(event);
  }

  // Following a link inside the chat: on phones the panel covers the page, so close it
  const onNavigate = () => {
    if (window.matchMedia?.('(max-width: 600px)').matches) onClose();
  };

  return (
    <section className="chat-panel" role="dialog" aria-label="Chat with the Flavor Alchemist assistant">
      <header className="chat-header">
        <div>
          <h2>Ask the Flavor Alchemist</h2>
          <p>Menu, delivery, refunds and your orders</p>
        </div>
        <div className="chat-header-actions">
          {messages.length > 0 && (
            <button type="button" className="chat-icon-btn" onClick={clear} title="Start a new chat" aria-label="Start a new chat">
              <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 12a8 8 0 1 0 2.3-5.6M4 4v4.5h4.5" /></svg>
            </button>
          )}
          <button type="button" className="chat-icon-btn" onClick={onClose} title="Close chat" aria-label="Close chat">
            <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18" /></svg>
          </button>
        </div>
      </header>

      <div className="chat-messages" ref={listRef} aria-live="polite">
        {messages.length === 0 ? (
          <div className="chat-welcome">
            <p>Hi! I can help you pick a dish, answer questions about delivery, payments and refunds, or check your orders and points when you&apos;re signed in.</p>
            <ul className="chat-suggestions">
              {SUGGESTIONS.map((s) => (
                <li key={s}>
                  <button type="button" onClick={() => send(s)}>{s}</button>
                </li>
              ))}
            </ul>
          </div>
        ) : (
          messages.map((m) => <ChatMessage key={m.id} message={m} menu={menu || []} onNavigate={onNavigate} />)
        )}
      </div>

      <form className="chat-input" onSubmit={submit}>
        <textarea
          ref={inputRef}
          rows={1}
          value={draft}
          maxLength={MAX_MESSAGE_CHARS}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="Ask about the menu, delivery, refunds…"
          aria-label="Your message"
        />
        {isStreaming ? (
          <button type="button" className="chat-send is-stop" onClick={stop} aria-label="Stop the answer">
            <svg viewBox="0 0 24 24" aria-hidden="true"><rect x="7" y="7" width="10" height="10" rx="1.5" /></svg>
          </button>
        ) : (
          <button type="submit" className="chat-send" disabled={!draft.trim()} aria-label="Send">
            <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 12l16-8-6 16-2.5-6.5L4 12z" /></svg>
          </button>
        )}
      </form>
      <p className="chat-disclaimer">Answers come from our menu and policies and may occasionally be wrong.</p>
    </section>
  );
}

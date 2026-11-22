import { lazy, Suspense, useEffect, useState } from 'react';
import './ChatWidget.css';

// The panel (and the markdown/stream code it uses) is only downloaded when the chat is first opened
const ChatPanel = lazy(() => import('./ChatPanel'));

/** The floating "Ask us" button and the chat panel it opens, on every page. */
export default function ChatWidget() {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (!open) return undefined;
    const onKey = (e) => {
      // Escape closes the chat, unless a modal (e.g. the login dialog) is open on top of it
      if (e.key === 'Escape' && !document.querySelector('dialog[open]')) setOpen(false);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open]);

  return (
    <div className={`chat-widget${open ? ' is-open' : ''}`}>
      {open && (
        <Suspense fallback={<div className="chat-panel chat-panel-loading" aria-busy="true" />}>
          <ChatPanel onClose={() => setOpen(false)} />
        </Suspense>
      )}
      <button
        type="button"
        className="chat-launcher"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        aria-label={open ? 'Close chat' : 'Chat with us'}
      >
        {open ? (
          <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18" /></svg>
        ) : (
          <>
            <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 5h16v11H9l-5 4V5z" /></svg>
            <span>Ask us</span>
          </>
        )}
      </button>
    </div>
  );
}

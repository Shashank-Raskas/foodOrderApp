import { lazy, Suspense, useEffect, useState } from 'react';
import { useLocation } from 'react-router-dom';
import BotIcon from './BotIcon';
import './ChatWidget.css';

// The panel (and the markdown/stream code it uses) is only downloaded when the chat is first opened
const ChatPanel = lazy(() => import('./ChatPanel'));

const GREETED_KEY = 'chat:greeted';
const GREETING_DELAY_MS = 2500;
const GREETING_SHOW_MS = 9000;

const wasGreeted = () => {
  try {
    return localStorage.getItem(GREETED_KEY) === '1';
  } catch {
    return true; // storage blocked: don't risk showing it on every page
  }
};
const markGreeted = () => {
  try {
    localStorage.setItem(GREETED_KEY, '1');
  } catch {
    /* ignore */
  }
};

/** The floating assistant button and the chat panel it opens, on every page. */
export default function ChatWidget() {
  const [open, setOpen] = useState(false);
  const [greeting, setGreeting] = useState(false);
  const { pathname } = useLocation();

  // A one-time "hi" bubble for new visitors, on the home page only (never over the menu's dishes)
  useEffect(() => {
    if (pathname !== '/' || open || wasGreeted()) return undefined;
    const show = setTimeout(() => setGreeting(true), GREETING_DELAY_MS);
    const hide = setTimeout(() => setGreeting(false), GREETING_DELAY_MS + GREETING_SHOW_MS);
    return () => {
      clearTimeout(show);
      clearTimeout(hide);
    };
  }, [pathname, open]);

  useEffect(() => {
    if (pathname !== '/') setGreeting(false);
  }, [pathname]);

  useEffect(() => {
    if (!open) return undefined;
    const onKey = (e) => {
      // Escape closes the chat, unless a modal (e.g. the login dialog) is open on top of it
      if (e.key === 'Escape' && !document.querySelector('dialog[open]')) setOpen(false);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open]);

  function toggle() {
    setOpen((o) => !o);
    setGreeting(false);
    markGreeted();
  }

  function dismissGreeting() {
    setGreeting(false);
    markGreeted();
  }

  return (
    <div className={`chat-widget${open ? ' is-open' : ''}`}>
      {open && (
        <Suspense fallback={<div className="chat-panel chat-panel-loading" aria-busy="true" />}>
          <ChatPanel onClose={() => setOpen(false)} />
        </Suspense>
      )}

      {greeting && !open && (
        <div className="chat-greeting" role="status">
          <button type="button" className="chat-greeting-body" onClick={toggle}>
            <strong>👋 Hi! I&apos;m your food assistant.</strong>
            <span>Ask me what to eat, about delivery, refunds or your order.</span>
          </button>
          <button type="button" className="chat-greeting-close" onClick={dismissGreeting} aria-label="Dismiss">
            <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18" /></svg>
          </button>
        </div>
      )}

      <button
        type="button"
        className={`chat-launcher${greeting ? ' is-calling' : ''}`}
        onClick={toggle}
        aria-expanded={open}
        aria-label={open ? 'Close chat' : 'Chat with us'}
        title={open ? 'Close chat' : 'Chat with our AI assistant'}
      >
        {open ? (
          <svg className="chat-launcher-close" viewBox="0 0 24 24" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18" /></svg>
        ) : (
          <>
            <BotIcon className="chat-launcher-bot" />
            <span className="chat-launcher-online" aria-hidden="true" />
          </>
        )}
      </button>
    </div>
  );
}

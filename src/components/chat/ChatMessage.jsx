import { Fragment, useContext, useState } from 'react';
import { Link } from 'react-router-dom';
import { parseMarkdown } from '../../../content/markdown.js';
import CartContext from '../store/CartContext';
import AuthContext from '../store/AuthContext';
import UserProgressContext from '../store/UserProgressContext';
import { API_URL } from '../../config/api';
import { currencyFormatter } from '../../util/formatting';
import { isVegMeal } from '../../util/meal';

// Links from the model are only followed when they stay on this site (or are mailto:/tel:).
// Anything else — e.g. a URL smuggled in through a customer review — is shown as plain text.
const isSafeHref = (href) => /^\/(?!\/)/.test(href) || /^(mailto|tel):/i.test(href);

const CITATION = /\[(\d+(?:\s*,\s*\d+)*)\]/g;

// Text with [1] / [1, 2] markers → text with small links to the cited pages
function TextWithCitations({ text, citations, onNavigate }) {
  const byNumber = new Map(citations.map((c) => [c.n, c]));
  const parts = [];
  let last = 0;
  for (const match of text.matchAll(CITATION)) {
    if (match.index > last) parts.push(text.slice(last, match.index));
    const nums = match[1].split(/\s*,\s*/).map(Number);
    parts.push(
      <sup key={match.index} className="chat-cite-group">
        {nums.map((n) => {
          const c = byNumber.get(n);
          return c ? (
            <Link key={n} to={c.url} className="chat-cite" title={[c.title, c.section].filter(Boolean).join(' — ')} onClick={onNavigate}>
              {n}
            </Link>
          ) : (
            <span key={n} className="chat-cite chat-cite-pending">{n}</span>
          );
        })}
      </sup>,
    );
    last = match.index + match[0].length;
  }
  if (last < text.length) parts.push(text.slice(last));
  return parts;
}

function Inlines({ nodes, citations, onNavigate }) {
  return nodes.map((node, i) => {
    if (node.type === 'strong') return <strong key={i}><Inlines nodes={node.children} citations={citations} onNavigate={onNavigate} /></strong>;
    if (node.type === 'break') return <br key={i} />;
    if (node.type === 'link') {
      const label = <Inlines nodes={node.children} citations={citations} onNavigate={onNavigate} />;
      if (!isSafeHref(node.href)) return <Fragment key={i}>{label}</Fragment>;
      return node.href.startsWith('/') ? (
        <Link key={i} to={node.href} onClick={onNavigate}>{label}</Link>
      ) : (
        <a key={i} href={node.href}>{label}</a>
      );
    }
    return <TextWithCitations key={i} text={node.value} citations={citations} onNavigate={onNavigate} />;
  });
}

/** The answer text: the same small Markdown subset as the site's pages (paragraphs, lists, bold). */
export function AnswerText({ text, citations = [], onNavigate }) {
  const { blocks } = parseMarkdown(text);
  return blocks.map((block, i) => {
    const inl = (nodes) => <Inlines nodes={nodes} citations={citations} onNavigate={onNavigate} />;
    if (block.type === 'list') {
      const List = block.ordered ? 'ol' : 'ul';
      return <List key={i}>{block.items.map((item, j) => <li key={j}>{inl(item)}</li>)}</List>;
    }
    if (block.type === 'heading') return <p key={i}><strong>{block.text}</strong></p>;
    if (block.type === 'paragraph') return <p key={i}>{inl(block.inlines)}</p>;
    return null; // tables etc. aren't expected in chat answers
  });
}

function MealCard({ meal, onNavigate }) {
  const cartCtx = useContext(CartContext);
  const authCtx = useContext(AuthContext);
  const userProgressCtx = useContext(UserProgressContext);
  const [added, setAdded] = useState(false);
  const veg = isVegMeal(meal);

  function handleAdd() {
    // Same rule as the menu: the cart belongs to an account
    if (!authCtx.isLoggedIn) {
      userProgressCtx.showAuth('login');
      return;
    }
    cartCtx.addItem(meal);
    setAdded(true);
    setTimeout(() => setAdded(false), 1500);
  }

  return (
    <li className="chat-meal">
      <img src={`${API_URL}/${meal.image}`} alt="" loading="lazy" />
      <div className="chat-meal-info">
        <Link to={`/meal/${meal.id}`} className="chat-meal-name" onClick={onNavigate}>
          <span className={`chat-veg-dot ${veg ? 'is-veg' : 'is-nonveg'}`} aria-label={veg ? 'Veg' : 'Non-veg'} role="img" />
          <span className="chat-meal-name-text">{meal.name}</span>
        </Link>
        <span className="chat-meal-price">{currencyFormatter.format(Number(meal.price))}</span>
      </div>
      <button type="button" className="chat-meal-add" onClick={handleAdd} aria-label={`Add ${meal.name} to cart`}>
        {added ? 'Added ✓' : 'Add'}
      </button>
    </li>
  );
}

function Feedback({ message, onFeedback }) {
  if (message.feedback) return <p className="chat-note chat-feedback-thanks">Thanks for the feedback!</p>;
  return (
    <div className="chat-feedback" role="group" aria-label="Was this answer helpful?">
      <span>Helpful?</span>
      <button type="button" onClick={() => onFeedback(message, true)} aria-label="Yes, this answer was helpful">
        <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M7 11v9H4v-9h3zm3 9h7.2a2 2 0 0 0 2-1.6l1.2-6A2 2 0 0 0 18.4 10H14l.7-3.5A1.7 1.7 0 0 0 11.6 5L8 11v9h2z" /></svg>
      </button>
      <button type="button" onClick={() => onFeedback(message, false)} aria-label="No, this answer was not helpful">
        <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M17 13V4h3v9h-3zm-3-9H6.8a2 2 0 0 0-2 1.6l-1.2 6A2 2 0 0 0 5.6 14H10l-.7 3.5a1.7 1.7 0 0 0 3.1 1.5L16 13V4h-2z" /></svg>
      </button>
    </div>
  );
}

export default function ChatMessage({ message, menu, onNavigate, onFeedback }) {
  const userProgressCtx = useContext(UserProgressContext);

  if (message.role === 'user') {
    return <div className="chat-msg chat-msg-user"><p>{message.text}</p></div>;
  }

  const meals = (message.mealIds || []).map((id) => menu.find((m) => m.id === id)).filter(Boolean);
  const sources = (message.citations || []).filter((c) => c.docType !== 'menu' || !message.mealIds?.length);
  const streaming = message.status === 'streaming';

  return (
    <div className={`chat-msg chat-msg-bot${streaming ? ' is-streaming' : ''}`}>
      {message.text ? (
        <div className="chat-answer"><AnswerText text={message.text} citations={message.citations} onNavigate={onNavigate} /></div>
      ) : streaming ? (
        <p className="chat-typing" aria-label="The assistant is typing"><span /><span /><span /></p>
      ) : null}

      {message.status === 'error' && <p className="chat-error" role="alert">{message.error}</p>}
      {message.status === 'stopped' && <p className="chat-note">Stopped.</p>}

      {message.signInRequired && (
        <button type="button" className="chat-signin" onClick={() => userProgressCtx.showAuth('login')}>
          Sign in
        </button>
      )}

      {meals.length > 0 && <ul className="chat-meals" aria-label="Suggested dishes">{meals.map((meal) => <MealCard key={meal.id} meal={meal} onNavigate={onNavigate} />)}</ul>}

      {sources.length > 0 && (
        <div className="chat-sources">
          <span>Sources:</span>
          {sources.map((c) => (
            <Link key={c.n} to={c.url} onClick={onNavigate} className="chat-source">
              {c.title}
              {c.section ? ` — ${c.section.replace(/^\d+\.\s*/, '')}` : ''}
            </Link>
          ))}
        </div>
      )}

      {message.status === 'done' && message.traceId && onFeedback && <Feedback message={message} onFeedback={onFeedback} />}
    </div>
  );
}

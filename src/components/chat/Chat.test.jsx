// The chat widget: SSE parsing, streaming answers, citations, meal cards, sign-in, errors, safety.
import { useContext } from 'react';
import { render, screen, within, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import ChatWidget from './ChatWidget';
import { AnswerText } from './ChatMessage';
import { readSse } from './sse';
import UserProgressContext from '../store/UserProgressContext';
import CartContext from '../store/CartContext';
import { renderWithProviders, sampleMeals, loginAs, jsonResponse, callsTo } from '../../test/utils';
import { stubGlobal } from '../../test/stubs';

// A fetch body that delivers `text` in small pieces, like a real network stream
function streamOf(text, chunkSize = 7) {
  const bytes = new TextEncoder().encode(text);
  return new ReadableStream({
    start(controller) {
      for (let i = 0; i < bytes.length; i += chunkSize) controller.enqueue(bytes.slice(i, i + chunkSize));
      controller.close();
    },
  });
}
const sse = (events) => events.map(([event, data]) => `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`).join('');
const sseResponse = (events) => ({ ok: true, status: 200, body: streamOf(sse(events)), json: async () => ({}), clone() { return this; } });

const BIRYANI = [
  ['meta', { type: 'meta', route: 'retrieve' }],
  ['token', { type: 'token', text: 'We have:\n\n* **Mac & Cheese**: ₹350 [1]\n' }],
  ['token', { type: 'token', text: '* Pizza [2]' }],
  ['done', {
    type: 'done',
    answer: 'We have:\n\n* **Mac & Cheese**: ₹350 [1]\n* Pizza [2]',
    citations: [
      { n: 1, id: 'menu:m1', title: 'Mac & Cheese', section: 'Entrees', url: '/meal/m1', docType: 'menu' },
      { n: 2, id: 'faq:x', title: 'Do you charge for delivery?', section: 'Delivery', url: '/faqs', docType: 'faq' },
    ],
    mealIds: ['m1'],
    route: 'retrieve',
  }],
];

/** fetch: the menu as JSON, and /api/chat answered by `chat(body, options)` */
function mockApi(chat) {
  const fn = jest.fn(async (url, options = {}) => {
    if (String(url).includes('/api/chat')) return chat(JSON.parse(options.body), options);
    if (String(url).includes('/meals')) return jsonResponse(sampleMeals);
    return jsonResponse({ message: 'not mocked' }, 404);
  });
  stubGlobal('fetch', fn);
  return fn;
}

function Probe() {
  const progress = useContext(UserProgressContext);
  const cart = useContext(CartContext);
  return <output data-testid="probe">{`auth:${progress.authView ?? 'none'} cart:${cart.items.map((i) => `${i.id}x${i.quantity}`).join(',')}`}</output>;
}

async function openChat(user) {
  await user.click(screen.getByRole('button', { name: 'Chat with us' }));
  return screen.findByRole('dialog', { name: /chat with the flavor alchemist/i });
}

describe('readSse', () => {
  it('reassembles events split across chunks, including multi-byte characters and CRLF', async () => {
    const text = 'event: token\r\ndata: {"text":"₹299 — veg"}\r\n\r\nevent: done\ndata: {"answer":"ok"}\n\n';
    const events = [];
    for await (const e of readSse(streamOf(text, 3))) events.push(e);
    expect(events).toEqual([{ event: 'token', data: { text: '₹299 — veg' } }, { event: 'done', data: { answer: 'ok' } }]);
  });

  it('skips malformed events and reads a final event without a trailing blank line', async () => {
    const events = [];
    for await (const e of readSse(streamOf('event: token\ndata: {broken\n\nevent: done\ndata: {"a":1}'))) events.push(e);
    expect(events).toEqual([{ event: 'done', data: { a: 1 } }]);
  });
});

describe('ChatWidget', () => {
  it('opens from the launcher, shows suggestions, and closes with Escape', async () => {
    mockApi(() => sseResponse(BIRYANI));
    const user = userEvent.setup();
    renderWithProviders(<ChatWidget />);
    const panel = await openChat(user);
    expect(within(panel).getByRole('button', { name: 'How long do refunds take?' })).toBeInTheDocument();
    expect(within(panel).getByLabelText('Your message')).toHaveFocus();
    await user.keyboard('{Escape}');
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Chat with us' })).toHaveAttribute('aria-expanded', 'false');
  });

  it('streams an answer with citation links, sources and a meal card; guests are asked to sign in to add', async () => {
    const api = mockApi(() => sseResponse(BIRYANI));
    const user = userEvent.setup();
    renderWithProviders(<><ChatWidget /><Probe /></>);
    const panel = await openChat(user);
    await user.type(within(panel).getByLabelText('Your message'), 'Do you have biryani?{Enter}');

    expect(await within(panel).findByText('Mac & Cheese', { selector: 'strong' })).toBeInTheDocument();
    expect(within(panel).getByText('Do you have biryani?')).toBeInTheDocument();
    expect(callsTo(api, 'POST', '/api/chat')[0].body).toEqual({ message: 'Do you have biryani?', history: [] });
    expect(callsTo(api, 'POST', '/api/chat')[0].headers.Authorization).toBeUndefined();

    // [1] → the meal page, [2] → the FAQ page
    await waitFor(() => expect(within(panel).getByRole('link', { name: '1' })).toHaveAttribute('href', '/meal/m1'));
    expect(within(panel).getByRole('link', { name: '2' })).toHaveAttribute('href', '/faqs');
    // Menu citations become cards; other sources are listed as links
    expect(within(panel).getByRole('link', { name: 'Do you charge for delivery? — Delivery' })).toHaveAttribute('href', '/faqs');
    const card = within(within(panel).getByRole('list', { name: 'Suggested dishes' })).getByRole('listitem');
    expect(card).toHaveTextContent('Mac & Cheese');
    expect(card).toHaveTextContent('₹350.00');

    await user.click(within(card).getByRole('button', { name: 'Add Mac & Cheese to cart' }));
    expect(screen.getByTestId('probe')).toHaveTextContent('auth:login cart:');
  });

  it('signed in: sends the token, and Add puts the dish in the cart', async () => {
    loginAs();
    const api = mockApi(() => sseResponse(BIRYANI));
    const user = userEvent.setup();
    renderWithProviders(<><ChatWidget /><Probe /></>);
    const panel = await openChat(user);
    await user.click(within(panel).getByRole('button', { name: 'Something spicy and veg under ₹300?' }));
    const add = await within(panel).findByRole('button', { name: 'Add Mac & Cheese to cart' });
    expect(callsTo(api, 'POST', '/api/chat')[0].headers.Authorization).toBe('Bearer access-1');
    await user.click(add);
    expect(screen.getByTestId('probe')).toHaveTextContent('cart:m1x1');
    expect(add).toHaveTextContent('Added ✓');
  });

  it('sends the earlier turns as history with the next question', async () => {
    const api = mockApi(() => sseResponse(BIRYANI));
    const user = userEvent.setup();
    renderWithProviders(<ChatWidget />);
    const panel = await openChat(user);
    const input = within(panel).getByLabelText('Your message');
    await user.type(input, 'Do you have biryani?{Enter}');
    await within(panel).findByRole('link', { name: '1' });
    await user.type(input, 'is it spicy?{Enter}');
    await waitFor(() => expect(callsTo(api, 'POST', '/api/chat')).toHaveLength(2));
    expect(callsTo(api, 'POST', '/api/chat')[1].body).toEqual({
      message: 'is it spicy?',
      history: [
        { role: 'user', content: 'Do you have biryani?' },
        { role: 'assistant', content: BIRYANI[3][1].answer },
      ],
    });
  });

  it('shows the server message when a request is refused (e.g. rate limited)', async () => {
    mockApi(() => jsonResponse({ message: 'You are sending messages too quickly. Please wait a moment.' }, 429));
    const user = userEvent.setup();
    renderWithProviders(<ChatWidget />);
    const panel = await openChat(user);
    await user.type(within(panel).getByLabelText('Your message'), 'hi{Enter}');
    expect(await within(panel).findByRole('alert')).toHaveTextContent('too quickly');
  });

  it('shows an error event from the stream, and a cut-off stream', async () => {
    let call = 0;
    mockApi(() => (++call === 1
      ? sseResponse([['meta', { route: 'retrieve' }], ['error', { type: 'error', message: 'That took too long. Please try again.' }]])
      : sseResponse([['meta', { route: 'retrieve' }], ['token', { text: 'Half an ans' }]])));
    const user = userEvent.setup();
    renderWithProviders(<ChatWidget />);
    const panel = await openChat(user);
    const input = within(panel).getByLabelText('Your message');
    await user.type(input, 'one{Enter}');
    expect(await within(panel).findByRole('alert')).toHaveTextContent('That took too long');
    await user.type(input, 'two{Enter}');
    await waitFor(() => expect(within(panel).getAllByRole('alert')).toHaveLength(2));
    expect(within(panel).getAllByRole('alert')[1]).toHaveTextContent('interrupted');
  });

  it('offers a Sign in button when an account question needs it', async () => {
    mockApi(() => sseResponse([['done', { answer: 'Please sign in so I can look up your orders.', citations: [], mealIds: [], signInRequired: true }]]));
    const user = userEvent.setup();
    renderWithProviders(<><ChatWidget /><Probe /></>);
    const panel = await openChat(user);
    await user.click(within(panel).getByRole('button', { name: 'Where is my order?' }));
    await user.click(await within(panel).findByRole('button', { name: 'Sign in' }));
    expect(screen.getByTestId('probe')).toHaveTextContent('auth:login');
  });

  it('keeps the conversation when the chat is closed and reopened', async () => {
    mockApi(() => sseResponse(BIRYANI));
    const user = userEvent.setup();
    renderWithProviders(<ChatWidget />);
    let panel = await openChat(user);
    await user.type(within(panel).getByLabelText('Your message'), 'Do you have biryani?{Enter}');
    await within(panel).findByRole('link', { name: '1' });
    await user.click(within(panel).getByRole('button', { name: 'Close chat' }));
    panel = await openChat(user);
    expect(within(panel).getByText('Do you have biryani?')).toBeInTheDocument();
    await user.click(within(panel).getByRole('button', { name: 'Start a new chat' }));
    expect(within(panel).queryByText('Do you have biryani?')).not.toBeInTheDocument();
  });
});

describe('AnswerText', () => {
  const renderText = (text, citations = []) => render(<MemoryRouter><AnswerText text={text} citations={citations} /></MemoryRouter>);

  it('only follows on-site, mailto and tel links; anything else stays plain text', () => {
    renderText('See [our menu](/menu), [email](mailto:a@b.co), [this](https://evil.example/login) and [that](//evil.example).');
    expect(screen.getByRole('link', { name: 'our menu' })).toHaveAttribute('href', '/menu');
    expect(screen.getByRole('link', { name: 'email' })).toHaveAttribute('href', 'mailto:a@b.co');
    expect(screen.queryByRole('link', { name: 'this' })).not.toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'that' })).not.toBeInTheDocument();
    expect(screen.getByText(/this/)).toBeInTheDocument();
  });

  it('renders grouped citations and leaves unknown ones unlinked', () => {
    renderText('Fact [1, 3].', [{ n: 1, id: 'a', title: 'A', url: '/faqs', docType: 'faq' }]);
    expect(screen.getByRole('link', { name: '1' })).toHaveAttribute('href', '/faqs');
    expect(screen.queryByRole('link', { name: '3' })).not.toBeInTheDocument();
    expect(screen.getByText('3')).toBeInTheDocument();
  });

  it('renders lists and bold from the model', () => {
    const { container } = renderText('Options:\n\n* **Samosa** ₹149\n* Pav Bhaji');
    expect(container.querySelectorAll('li')).toHaveLength(2);
    expect(container.querySelector('strong')).toHaveTextContent('Samosa');
  });
});

// Shared helpers for frontend tests
import { render } from '@testing-library/react';
import { stubGlobal } from './stubs';
import { MemoryRouter } from 'react-router-dom';
import { AuthContextProvider } from '../components/store/AuthContext';
import { UserProgressContextProvider } from '../components/store/UserProgressContext';
import { CartContextProvider } from '../components/store/CartContext';
import { FavoritesContextProvider } from '../components/store/FavoritesContext';
import { SearchContextProvider } from '../components/store/SearchContext';

export const sampleMeals = [
  { id: 'm1', name: 'Mac & Cheese', price: '350', description: 'Cheesy', image: 'images/mac-and-cheese.jpg', category: 'entrees', dietary: ['vegetarian'], spiceLevel: 'non-spicy', protein: 'vegetarian', servingSize: 'individual', isChefSpecial: false, availableTime: 'all-day' },
  { id: 'm2', name: 'Margherita Pizza', price: '499', description: 'Classic', image: 'images/margherita-pizza.jpg', category: 'entrees', dietary: ['vegetarian'], spiceLevel: 'mild', protein: 'vegetarian', servingSize: 'individual', isChefSpecial: true, availableTime: 'all-day' },
];

/** Put a logged-in user (and optionally a cart) in localStorage, the way the app stores them. */
export function loginAs(user = {}, cart = null) {
  const stored = { userId: 'u1', email: 'alice@test.com', phone: null, name: 'Alice', role: 'user', createdAt: '2025-01-01T00:00:00.000Z', ...user };
  localStorage.setItem('user', JSON.stringify(stored));
  localStorage.setItem('authTokens', JSON.stringify({ accessToken: 'access-1', refreshToken: 'refresh-1' }));
  if (cart) localStorage.setItem(`cart_${stored.userId}`, JSON.stringify(cart));
  return stored;
}

/**
 * Replace global fetch with a router: routes is a list of [method, urlSubstring, handler] where
 * handler(body, url) returns { status, body } (or just the body). Unmatched requests return 404.
 * Returns the mock so tests can inspect calls.
 */
export function mockFetch(routes) {
  const fn = jest.fn(async (url, options = {}) => {
    const method = (options.method || 'GET').toUpperCase();
    // Most specific match wins, so '/api/admin/meals' beats '/meals'
    const route = routes
      .filter(([m, part]) => m === method && String(url).includes(part))
      .sort((a, b) => b[1].length - a[1].length)[0];
    if (!route) return jsonResponse({ message: `No mock for ${method} ${url}` }, 404);
    const body = options.body ? JSON.parse(options.body) : undefined;
    const result = await route[2](body, String(url), options);
    const isWrapped = result && typeof result === 'object' && 'status' in result && 'body' in result;
    return jsonResponse(isWrapped ? result.body : result, isWrapped ? result.status : 200);
  });
  stubGlobal('fetch', fn);
  return fn;
}

/** A minimal fetch Response (jsdom has none): status, ok, json(), text() and clone(). */
export function jsonResponse(body, status = 200) {
  const text = JSON.stringify(body ?? {});
  const response = {
    status,
    ok: status >= 200 && status < 300,
    headers: { get: (name) => (name.toLowerCase() === 'content-type' ? 'application/json' : null) },
    json: async () => JSON.parse(text),
    text: async () => text,
    clone: () => jsonResponse(body, status),
  };
  return response;
}

/** Calls made to fetch for a method + URL fragment, with parsed JSON bodies. */
export function callsTo(fetchMock, method, part) {
  return fetchMock.mock.calls
    .filter(([url, options = {}]) => (options.method || 'GET').toUpperCase() === method && String(url).includes(part))
    .map(([url, options = {}]) => ({ url, headers: options.headers || {}, body: options.body ? JSON.parse(options.body) : undefined }));
}

/** Render inside all the app's providers and a router. */
export function renderWithProviders(ui, { route = '/' } = {}) {
  return render(
    <MemoryRouter initialEntries={[route]}>
      <AuthContextProvider>
        <UserProgressContextProvider>
          <CartContextProvider>
            <FavoritesContextProvider>
              <SearchContextProvider>{ui}</SearchContextProvider>
            </FavoritesContextProvider>
          </CartContextProvider>
        </UserProgressContextProvider>
      </AuthContextProvider>
    </MemoryRouter>
  );
}

import { stubGlobal } from '../test/stubs';
import authFetch, { registerLogoutCallback, getTokens } from './authFetch';
import { jsonResponse } from '../test/utils';

beforeEach(() => {
  localStorage.setItem('authTokens', JSON.stringify({ accessToken: 'old-access', refreshToken: 'old-refresh' }));
});

const expired = () => jsonResponse({ message: 'Token expired. Please refresh.', code: 'TOKEN_EXPIRED' }, 401);

describe('authFetch', () => {
  it('sends the access token and keeps other headers', async () => {
    const fetchMock = jest.fn(async () => jsonResponse({ ok: true }));
    stubGlobal('fetch', fetchMock);

    await authFetch('/api/user/orders', { headers: { 'Content-Type': 'application/json' } });
    expect(fetchMock).toHaveBeenCalledWith('/api/user/orders', {
      headers: { 'Content-Type': 'application/json', Authorization: 'Bearer old-access' },
    });
  });

  it('refreshes an expired token once and retries the request', async () => {
    const fetchMock = jest.fn(async (url, options) => {
      if (url.includes('/api/auth/refresh')) {
        expect(JSON.parse(options.body)).toEqual({ refreshToken: 'old-refresh' });
        return jsonResponse({ accessToken: 'new-access', refreshToken: 'new-refresh', role: 'user' });
      }
      return options.headers.Authorization === 'Bearer new-access' ? jsonResponse({ orders: [] }) : expired();
    });
    stubGlobal('fetch', fetchMock);

    const res = await authFetch('/api/user/orders');
    expect(res.status).toBe(200);
    expect(getTokens()).toEqual({ accessToken: 'new-access', refreshToken: 'new-refresh' });
    expect(fetchMock).toHaveBeenCalledTimes(3); // original, refresh, retry
  });

  it('shares one refresh between requests that expire at the same time', async () => {
    let refreshCalls = 0;
    stubGlobal('fetch', jest.fn(async (url, options) => {
      if (url.includes('/api/auth/refresh')) {
        refreshCalls++;
        await new Promise((r) => setTimeout(r, 10));
        return jsonResponse({ accessToken: 'new-access', refreshToken: 'new-refresh' });
      }
      return options.headers.Authorization === 'Bearer new-access' ? jsonResponse({}) : expired();
    }));

    const results = await Promise.all([authFetch('/a'), authFetch('/b'), authFetch('/c')]);
    expect(results.map((r) => r.status)).toEqual([200, 200, 200]);
    expect(refreshCalls).toBe(1);
  });

  it('logs the user out when the refresh token is also rejected', async () => {
    const onLogout = jest.fn();
    registerLogoutCallback(onLogout);
    stubGlobal('fetch', jest.fn(async (url) =>
      url.includes('/api/auth/refresh') ? jsonResponse({ message: 'Invalid refresh token.' }, 401) : expired()
    ));

    const res = await authFetch('/api/user/orders');
    expect(res.status).toBe(401);
    expect(onLogout).toHaveBeenCalledTimes(1);
    expect(getTokens()).toBeNull();
  });

  it('does not try to refresh for other 401s (e.g. a wrong password)', async () => {
    const fetchMock = jest.fn(async () => jsonResponse({ message: 'Current password is incorrect.' }, 401));
    stubGlobal('fetch', fetchMock);
    const res = await authFetch('/api/user/change-password', { method: 'PUT' });
    expect(res.status).toBe(401);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});

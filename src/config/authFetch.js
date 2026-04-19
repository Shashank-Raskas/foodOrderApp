import { API_ENDPOINTS } from './api.js';

/**
 * authFetch — drop-in replacement for fetch() that:
 * 1. Attaches the Authorization: Bearer <accessToken> header
 * 2. Auto-refreshes expired tokens using the refresh token
 * 3. Clears auth state on permanent failure (refresh also expired)
 *
 * Usage: const res = await authFetch(url, options);
 */

let _logoutCallback = null;

/** Called once by AuthContext to register the logout handler */
export function registerLogoutCallback(fn) {
  _logoutCallback = fn;
}

/** Read tokens from localStorage */
function getTokens() {
  try {
    const stored = localStorage.getItem('authTokens');
    return stored ? JSON.parse(stored) : null;
  } catch {
    return null;
  }
}

/** Write tokens to localStorage */
function setTokens(tokens) {
  localStorage.setItem('authTokens', JSON.stringify(tokens));
}

/** Clear tokens */
function clearTokens() {
  localStorage.removeItem('authTokens');
}

/** Flag to avoid parallel refresh calls */
let isRefreshing = false;
let refreshPromise = null;

/**
 * Attempt to refresh access token using the stored refresh token.
 * Returns new tokens on success, null on failure.
 */
async function refreshAccessToken() {
  const tokens = getTokens();
  if (!tokens?.refreshToken) return null;

  // Coalesce concurrent refresh calls
  if (isRefreshing) return refreshPromise;

  isRefreshing = true;
  refreshPromise = (async () => {
    try {
      const res = await fetch(API_ENDPOINTS.AUTH_REFRESH, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ refreshToken: tokens.refreshToken }),
      });

      if (!res.ok) {
        clearTokens();
        if (_logoutCallback) _logoutCallback();
        return null;
      }

      const data = await res.json();
      const newTokens = {
        accessToken: data.accessToken,
        refreshToken: data.refreshToken,
      };
      setTokens(newTokens);

      // Update role in stored user if changed
      if (data.role) {
        try {
          const storedUser = JSON.parse(localStorage.getItem('user'));
          if (storedUser && storedUser.role !== data.role) {
            storedUser.role = data.role;
            localStorage.setItem('user', JSON.stringify(storedUser));
          }
        } catch { /* ignore */ }
      }

      return newTokens;
    } catch {
      clearTokens();
      if (_logoutCallback) _logoutCallback();
      return null;
    } finally {
      isRefreshing = false;
      refreshPromise = null;
    }
  })();

  return refreshPromise;
}

/**
 * Authenticated fetch. Works like regular fetch() but with JWT.
 */
export default async function authFetch(url, options = {}) {
  const tokens = getTokens();

  // Build headers
  const headers = { ...(options.headers || {}) };
  if (tokens?.accessToken) {
    headers['Authorization'] = `Bearer ${tokens.accessToken}`;
  }

  // First attempt
  let response = await fetch(url, { ...options, headers });

  // If 401 with TOKEN_EXPIRED, try to refresh
  if (response.status === 401) {
    let body;
    try {
      body = await response.clone().json();
    } catch { body = {}; }

    if (body.code === 'TOKEN_EXPIRED' || body.message?.includes('expired')) {
      const newTokens = await refreshAccessToken();
      if (newTokens) {
        // Retry the original request with new token
        headers['Authorization'] = `Bearer ${newTokens.accessToken}`;
        response = await fetch(url, { ...options, headers });
      } else {
        // Refresh failed — user must log in again
        return response;
      }
    }
  }

  return response;
}

// Also export helpers for AuthContext to use directly
export { getTokens, setTokens, clearTokens };

import { createContext, useContext, useEffect, useState, useCallback, useMemo } from 'react';
import { apiGet, getStoredToken, setStoredToken, clearStoredToken } from '../api/client';

const AuthContext = createContext(null);

/**
 * Holds {user, token}. Persists the token to localStorage (see api/client.js); on mount, if a
 * token already exists (page refresh, new tab), calls GET /api/auth/me to rehydrate the user
 * rather than trusting a decoded JWT payload — the backend's live DB re-check is the only
 * source of truth for whether a session is still valid (an admin suspension or password reset
 * can invalidate a token server-side with no client-side signal otherwise).
 *
 * `logout()` deliberately only clears state — it does not navigate. Keeping AuthContext free of
 * react-router keeps the two concerns separate; callers (e.g. the layout's logout button) do
 * `logout(); navigate('/login')` themselves.
 */
function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [token, setToken] = useState(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const existingToken = getStoredToken();

    if (!existingToken) {
      setIsLoading(false);
      return;
    }

    setToken(existingToken);

    apiGet('/api/auth/me')
      .then(({ user: me }) => setUser(me))
      .catch(() => {
        // Invalid/expired token. api/client.js already cleared storage and redirected on a 401;
        // this also covers non-401 failures (e.g. the API being unreachable) by logging out
        // locally rather than leaving the app in a half-authenticated state.
        clearStoredToken();
        setUser(null);
        setToken(null);
      })
      .finally(() => setIsLoading(false));
  }, []);

  const login = useCallback((newToken, newUser) => {
    setStoredToken(newToken);
    setToken(newToken);
    setUser(newUser);
  }, []);

  const logout = useCallback(() => {
    clearStoredToken();
    setToken(null);
    setUser(null);
  }, []);

  const value = useMemo(
    () => ({
      user,
      token,
      isAuthenticated: Boolean(user),
      role: user?.role ?? null,
      isLoading,
      login,
      logout,
    }),
    [user, token, isLoading, login, logout]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within an AuthProvider');
  return ctx;
}

export { AuthProvider, useAuth };

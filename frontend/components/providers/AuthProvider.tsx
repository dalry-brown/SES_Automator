'use client';

import { createContext, useContext, useEffect, useState, useCallback, type ReactNode } from 'react';
import { useRouter } from 'next/navigation';
import { storeToken, getStoredToken, clearToken, decodeToken, getMsalInstance, exchangeMsToken } from '@/lib/auth';
import type { User, AuthState, Role, ViewMode } from '@/types';

interface AuthContextValue extends AuthState {
  login: (token: string) => void;
  logout: () => void;
  viewMode: ViewMode;
  setViewMode: (mode: ViewMode) => void;
  effectiveRole: Role;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const router = useRouter();
  const [token, setToken]         = useState<string | null>(null);
  const [user, setUser]           = useState<User | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [viewMode, setViewMode]   = useState<ViewMode>('editor');

  useEffect(() => {
    const init = async () => {
      // Fast path: valid JWT already in localStorage.
      const stored = getStoredToken();
      if (stored) {
        const decoded = decodeToken(stored);
        if (decoded) {
          setToken(stored);
          setUser(decoded);
          if (decoded.role === 'user') setViewMode('contract-holder');
          setIsLoading(false);
          return;
        }
        clearToken();
      }

      // No valid JWT — attempt to complete a pending Microsoft redirect.
      // The app's redirectUri is the site root, so after MS auth the browser
      // lands here (root or login page) with #code= in the hash. MSAL's
      // handleRedirectPromise processes the hash; if we're not on the page
      // where loginRedirect was called, MSAL caches the hash and does a
      // window.location.replace to the originating page (login). That causes
      // a full reload, and this init() runs again on the login page where
      // MSAL finally returns the AuthenticationResult.
      if (process.env.NEXT_PUBLIC_MSAL_CLIENT_ID) {
        try {
          const msal = await getMsalInstance();
          const result = await msal.handleRedirectPromise();
          if (result?.accessToken) {
            const { token: newToken } = await exchangeMsToken(result.accessToken);
            const decoded = decodeToken(newToken);
            if (decoded) {
              storeToken(newToken);
              setToken(newToken);
              setUser(decoded);
              if (decoded.role === 'user') setViewMode('contract-holder');
              setIsLoading(false);
              router.replace('/home');
              return;
            }
          }
        } catch (err) {
          console.error('[Auth] handleRedirectPromise failed:', err);
        }
      }

      setIsLoading(false);
    };

    init();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const login = useCallback((newToken: string) => {
    storeToken(newToken);
    const decoded = decodeToken(newToken);
    setToken(newToken);
    setUser(decoded);
    if (decoded?.role === 'user') setViewMode('contract-holder');
  }, []);

  const logout = useCallback(() => {
    clearToken();
    setToken(null);
    setUser(null);
    setViewMode('editor');
    window.location.href = '/login';
  }, []);

  // effectiveRole: when editor toggles to contract-holder view, behave as 'user' for nav
  const effectiveRole: Role = viewMode === 'contract-holder' && user?.role !== 'user'
    ? 'user'
    : (user?.role ?? 'user');

  return (
    <AuthContext.Provider value={{
      token,
      user,
      isAuthenticated: !!user,
      isLoading,
      login,
      logout,
      viewMode,
      setViewMode,
      effectiveRole,
    }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used inside AuthProvider');
  return ctx;
}

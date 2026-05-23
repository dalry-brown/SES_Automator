'use client';

import { PublicClientApplication } from '@azure/msal-browser';
import type { User } from '@/types';

const TOKEN_KEY = 'tullow_ce_token';
const API = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000';

// ── JWT storage ───────────────────────────────────────────────────────────────
export function storeToken(token: string) {
  if (typeof window !== 'undefined') localStorage.setItem(TOKEN_KEY, token);
}

export function getStoredToken(): string | null {
  if (typeof window === 'undefined') return null;
  return localStorage.getItem(TOKEN_KEY);
}

export function clearToken() {
  if (typeof window !== 'undefined') localStorage.removeItem(TOKEN_KEY);
}

export function decodeToken(token: string): User | null {
  try {
    const payload = token.split('.')[1];
    const decoded = JSON.parse(atob(payload.replace(/-/g, '+').replace(/_/g, '/')));
    if (decoded.exp * 1000 < Date.now()) return null;
    return {
      userId:     decoded.userId,
      email:      decoded.email,
      name:       decoded.name,
      role:       decoded.role,
      msObjectId: decoded.msObjectId,
    };
  } catch {
    return null;
  }
}

export function isTokenValid(): boolean {
  const token = getStoredToken();
  return token ? decodeToken(token) !== null : false;
}

// ── Exchange MS access token for app JWT ──────────────────────────────────────
export async function exchangeMsToken(msAccessToken: string): Promise<{ token: string; user: User }> {
  const res = await fetch(`${API}/api/auth/login`, {
    method:  'POST',
    headers: { 'Content-Type': 'application/json' },
    body:    JSON.stringify({ msAccessToken }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err?.error?.message || 'Login failed');
  }
  return res.json();
}

// ── MSAL configuration ────────────────────────────────────────────────────────
// MSAL v5 uses slightly different config shape — authority goes inside auth
export function getMsalConfig() {
  return {
    auth: {
      clientId:    process.env.NEXT_PUBLIC_MSAL_CLIENT_ID || '',
      authority:   process.env.NEXT_PUBLIC_MSAL_AUTHORITY || 'https://login.microsoftonline.com/consumers',
      redirectUri: process.env.NEXT_PUBLIC_MSAL_REDIRECT_URI || (typeof window !== 'undefined' ? window.location.origin + '/auth/callback' : ''),
    },
    cache: {
      cacheLocation:      'sessionStorage' as const,
      storeAuthStateInCookie: false,
    },
  };
}

export const MS_SCOPES = ['User.Read', 'Mail.Read', 'Mail.Send'];

// ── MSAL singleton ────────────────────────────────────────────────────────────
let _msalInstance: PublicClientApplication | null = null;
let _msalReady = false;

export async function getMsalInstance(): Promise<PublicClientApplication> {
  if (!_msalInstance) _msalInstance = new PublicClientApplication(getMsalConfig());
  if (!_msalReady) {
    await _msalInstance.initialize();
    _msalReady = true;
  }
  return _msalInstance;
}

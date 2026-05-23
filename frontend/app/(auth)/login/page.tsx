'use client';

import { useState } from 'react';
import { getMsalInstance, MS_SCOPES } from '@/lib/auth';
import { Button } from '@/components/ui/Button';
import { useToast } from '@/components/ui/Toast';

export default function LoginPage() {
  const [loading, setLoading] = useState(false);
  const { error: toastError } = useToast();

  const handleMsLogin = async () => {
    setLoading(true);
    // Clear any stale interaction-in-progress flag so a retry always works.
    Object.keys(sessionStorage)
      .filter((k) => k.includes('interaction.status') || k.includes('interaction_status'))
      .forEach((k) => sessionStorage.removeItem(k));
    try {
      const msal = await getMsalInstance();
      // loginRedirect navigates the full page to MS — no popup, no cross-window messaging
      await msal.loginRedirect({
        scopes: MS_SCOPES.map((s) => `https://graph.microsoft.com/${s}`),
      });
      // Execution never reaches here — browser navigates away
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Sign-in failed';
      toastError(message);
      setLoading(false);
    }
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-gradient-to-br from-brand-navy to-brand-blue px-4">
      <div className="w-full max-w-sm">
        {/* Card */}
        <div className="rounded-2xl bg-white p-8 shadow-xl">
          {/* Logo */}
          <div className="mb-8 text-center">
            <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-xl bg-brand-navy text-xl font-bold text-white shadow-md">
              TC
            </div>
            <h1 className="text-xl font-bold text-slate-900">Tullow CE</h1>
            <p className="mt-1 text-sm text-slate-500">SES Invoice Review System</p>
          </div>

          <Button onClick={handleMsLogin} loading={loading} className="w-full gap-3" size="lg">
            <svg viewBox="0 0 21 21" className="h-4 w-4 flex-shrink-0">
              <rect x="1" y="1" width="9" height="9" fill="#f25022" />
              <rect x="11" y="1" width="9" height="9" fill="#00a4ef" />
              <rect x="1" y="11" width="9" height="9" fill="#7fba00" />
              <rect x="11" y="11" width="9" height="9" fill="#ffb900" />
            </svg>
            Sign in with Microsoft
          </Button>

          <p className="mt-6 text-center text-xs text-slate-400">
            Use your Tullow Microsoft account to sign in. Access is restricted to authorised staff.
          </p>
        </div>

        <p className="mt-6 text-center text-xs text-white/40">
          © {new Date().getFullYear()} Tullow Ghana — Cost Engineering
        </p>
      </div>
    </div>
  );
}

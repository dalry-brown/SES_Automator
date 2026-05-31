'use client';

import { useEffect } from 'react';
import { AlertTriangle } from 'lucide-react';

export default function Error({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => { console.error('[Error boundary]', error); }, [error]);

  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-4 bg-slate-50 p-8 text-center">
      <div className="flex h-14 w-14 items-center justify-center rounded-full bg-amber-50 border border-amber-200">
        <AlertTriangle className="h-7 w-7 text-amber-500" />
      </div>
      <p className="text-lg font-semibold text-slate-700">Something went wrong</p>
      <p className="text-sm text-slate-400 max-w-sm leading-relaxed">
        {error.message || 'An unexpected error occurred. Refreshing the page usually fixes this.'}
      </p>
      <div className="flex gap-3 mt-1">
        <button
          onClick={reset}
          className="rounded-lg bg-[#1b3a6b] px-5 py-2.5 text-sm font-medium text-white hover:bg-[#162d56] transition-colors"
        >
          Try again
        </button>
        <a
          href="/home"
          className="rounded-lg border border-slate-200 bg-white px-5 py-2.5 text-sm font-medium text-slate-600 hover:bg-slate-50 transition-colors"
        >
          Back to home
        </a>
      </div>
    </div>
  );
}

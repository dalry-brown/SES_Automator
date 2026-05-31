'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { AlertTriangle } from 'lucide-react';

export default function AppError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  const router = useRouter();
  useEffect(() => { console.error('[App error boundary]', error); }, [error]);

  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-4 p-8 text-center">
      <div className="flex h-14 w-14 items-center justify-center rounded-full bg-amber-50 border border-amber-200">
        <AlertTriangle className="h-7 w-7 text-amber-500" />
      </div>
      <p className="text-[15px] font-semibold text-slate-700">Something went wrong</p>
      <p className="text-[13px] text-slate-400 max-w-sm leading-relaxed">
        {error.message || 'An unexpected error occurred. Try refreshing or go back to the previous page.'}
      </p>
      <div className="flex gap-3 mt-1">
        <button
          onClick={reset}
          className="rounded-lg bg-[#1b3a6b] px-4 py-2 text-[13px] font-medium text-white hover:bg-[#162d56] transition-colors"
        >
          Try again
        </button>
        <button
          onClick={() => router.push('/home')}
          className="rounded-lg border border-slate-200 bg-white px-4 py-2 text-[13px] font-medium text-slate-600 hover:bg-slate-50 transition-colors"
        >
          Back to home
        </button>
      </div>
    </div>
  );
}

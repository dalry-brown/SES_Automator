'use client';

import { useState } from 'react';
import { ChevronDown, LogOut, UserCog, Eye } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useAuth } from '@/components/providers/AuthProvider';
import type { ViewMode } from '@/types';

interface TopbarProps {
  title: string;
}

export function Topbar({ title }: TopbarProps) {
  const { user, logout, viewMode, setViewMode, effectiveRole } = useAuth();
  const [menuOpen, setMenuOpen] = useState(false);

  const canToggleView = user?.role === 'editor' || user?.role === 'admin';

  const toggleView = () => {
    setViewMode(viewMode === 'editor' ? 'contract-holder' : 'editor');
    setMenuOpen(false);
  };

  return (
    <header className="flex h-14 items-center justify-between border-b border-slate-200 bg-white px-6 shadow-sm">
      <h1 className="text-sm font-semibold text-slate-800">{title}</h1>

      <div className="flex items-center gap-3">
        {/* View mode indicator */}
        {canToggleView && viewMode === 'contract-holder' && (
          <span className="rounded-full bg-amber-100 px-2.5 py-0.5 text-xs font-medium text-amber-700 ring-1 ring-amber-200">
            Contract Holder View
          </span>
        )}

        {/* User menu */}
        <div className="relative">
          <button
            onClick={() => setMenuOpen((o) => !o)}
            className="flex items-center gap-2 rounded-lg px-3 py-2 text-sm text-slate-700 hover:bg-slate-100 transition-colors"
          >
            <div className="flex h-7 w-7 items-center justify-center rounded-full bg-brand-blue text-xs font-bold text-white">
              {user?.name?.charAt(0)?.toUpperCase() ?? 'U'}
            </div>
            <span className="hidden md:block max-w-[120px] truncate font-medium">{user?.name}</span>
            <ChevronDown className="h-3.5 w-3.5 text-slate-400" />
          </button>

          {menuOpen && (
            <>
              <div className="fixed inset-0 z-40" onClick={() => setMenuOpen(false)} />
              <div className="absolute right-0 top-full z-50 mt-1 w-56 rounded-lg border border-slate-200 bg-white py-1 shadow-panel animate-fade-in">
                <div className="border-b border-slate-100 px-4 py-2.5">
                  <p className="text-xs font-semibold text-slate-900 truncate">{user?.name}</p>
                  <p className="text-xs text-slate-400 truncate">{user?.email}</p>
                  <span className="mt-1 inline-block rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide text-slate-500">
                    {user?.role}
                  </span>
                </div>

                {canToggleView && (
                  <button
                    onClick={toggleView}
                    className="flex w-full items-center gap-2.5 px-4 py-2 text-sm text-slate-700 hover:bg-slate-50 transition-colors"
                  >
                    {viewMode === 'editor' ? (
                      <><Eye className="h-4 w-4 text-slate-400" /> Switch to Contract Holder view</>
                    ) : (
                      <><UserCog className="h-4 w-4 text-slate-400" /> Switch to Editor view</>
                    )}
                  </button>
                )}

                <button
                  onClick={() => { setMenuOpen(false); logout(); }}
                  className="flex w-full items-center gap-2.5 px-4 py-2 text-sm text-red-600 hover:bg-red-50 transition-colors"
                >
                  <LogOut className="h-4 w-4" /> Sign out
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    </header>
  );
}

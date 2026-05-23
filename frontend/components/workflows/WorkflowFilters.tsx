'use client';

import { useRouter, useSearchParams } from 'next/navigation';
import { Search, X } from 'lucide-react';
import { useState } from 'react';
import { cn } from '@/lib/utils';
import type { WorkflowStatus } from '@/types';

const TABS: { label: string; value: WorkflowStatus | '' }[] = [
  { label: 'All',              value: '' },
  { label: 'Received',         value: 'received' },
  { label: 'In Progress',      value: 'in_progress' },
  { label: 'Pending Approval', value: 'pending_approval' },
  { label: 'Approved',         value: 'approved' },
  { label: 'Queried',          value: 'queried' },
  { label: 'Returned',         value: 'returned' },
];

interface WorkflowFiltersProps {
  onSearch: (q: string) => void;
  searchValue: string;
}

export function WorkflowFilters({ onSearch, searchValue }: WorkflowFiltersProps) {
  const router      = useRouter();
  const searchParams = useSearchParams();
  const activeStatus = searchParams.get('status') ?? '';

  const setStatus = (value: string) => {
    const params = new URLSearchParams(searchParams.toString());
    if (value) params.set('status', value);
    else params.delete('status');
    router.replace(`/workflows?${params.toString()}`);
  };

  return (
    <div className="flex flex-col gap-3 border-b border-slate-200 bg-white px-6 pb-0 pt-3">
      {/* Status tabs */}
      <div className="flex items-center gap-0 overflow-x-auto no-scrollbar">
        {TABS.map((tab) => (
          <button
            key={tab.value}
            onClick={() => setStatus(tab.value)}
            className={cn(
              'flex-shrink-0 whitespace-nowrap border-b-2 px-4 py-2.5 text-sm font-medium transition-colors',
              activeStatus === tab.value
                ? 'border-brand-sky text-brand-sky'
                : 'border-transparent text-slate-500 hover:text-slate-700'
            )}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Search bar */}
      <div className="pb-3">
        <div className="relative max-w-xs">
          <Search className="absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-400" />
          <input
            type="text"
            placeholder="Search supplier or invoice…"
            value={searchValue}
            onChange={(e) => onSearch(e.target.value)}
            className="w-full rounded-lg border border-slate-300 bg-white py-1.5 pl-8 pr-8 text-sm text-slate-800 placeholder-slate-400 focus:border-brand-sky focus:outline-none focus:ring-1 focus:ring-brand-sky"
          />
          {searchValue && (
            <button onClick={() => onSearch('')} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600">
              <X className="h-3.5 w-3.5" />
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

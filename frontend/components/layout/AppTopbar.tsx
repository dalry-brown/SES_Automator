'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useState } from 'react';
import { Bell, Eye, UserCog, LogOut } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useAuth } from '@/components/providers/AuthProvider';
import { useWorkflows } from '@/lib/hooks/useWorkflows';
import { useQuery } from '@tanstack/react-query';
import { emailsApi, othersApi } from '@/lib/api';

export function AppTopbar() {
  const pathname = usePathname();
  const router   = useRouter();
  const { user, logout, viewMode, setViewMode, effectiveRole } = useAuth();
  const [menuOpen, setMenuOpen] = useState(false);

  // Data for badge counts — react-query caches so no extra fetches
  const { data: wfData }    = useWorkflows();
  const { data: emailsData } = useQuery({ queryKey: ['emails'], queryFn: () => emailsApi.list(), refetchInterval: 60_000 });
  const { data: othersData } = useQuery({ queryKey: ['others'], queryFn: () => othersApi.list() });

  const wfs    = wfData ?? [];
  const emails = emailsData?.emails ?? [];
  const others = othersData?.items ?? [];

  const reviewCount   = emails.filter((e) => e.status === 'received').length;
  const approvalCount = wfs.filter((w) => w.status === 'pending_approval').length;
  const approvedCount = wfs.filter((w) => w.status === 'approved').length;
  const othersOpen    = others.filter((o) => o.status === 'open').length;

  const initials    = user?.name ? user.name.split(' ').filter(Boolean).slice(0, 2).map((n) => n[0]).join('') : 'U';
  const displayName = user?.name?.split(' ').slice(0, 3).join(' ') ?? '';

  const canToggle = user?.role === 'editor' || user?.role === 'admin';

  // Tab definitions — contract holders see a simplified set
  const tabs = effectiveRole === 'user' ? [
    { label: 'Pending Approval', href: '/pending-approval', badge: approvalCount, badgeDim: false },
    { label: 'Approved',         href: '/approved',         badge: approvedCount, badgeDim: false },
    { label: 'Sent & Closed',    href: '/archive',          badge: null,         badgeDim: false },
  ] : [
    { label: 'Home',             href: '/home',             badge: null,         badgeDim: false },
    { label: 'Pending Review',   href: '/inbox',            badge: reviewCount,   badgeDim: false },
    { label: 'Pending Approval', href: '/pending-approval', badge: approvalCount, badgeDim: false },
    { label: 'Approved',         href: '/approved',         badge: approvedCount, badgeDim: false },
    { label: 'Sent & Closed',    href: '/archive',          badge: null,         badgeDim: false },
    { label: 'Others',           href: '/others',           badge: othersOpen,   badgeDim: true  },
    { label: 'Tracker',          href: '/tracker',          badge: null,         badgeDim: false },
    ...(effectiveRole === 'admin' ? [{ label: 'Admin', href: '/admin', badge: null, badgeDim: false }] : []),
  ];

  const isActive = (href: string) =>
    href === '/home' ? pathname === '/home' : pathname.startsWith(href);

  return (
    <header className="bg-ce-navy h-[54px] flex items-center flex-shrink-0 sticky top-0 z-50 px-6">
      {/* Brand */}
      <div className="text-white text-[16px] font-bold mr-8 whitespace-nowrap tracking-tight">
        Tullow <span className="text-ce-amber">CE</span>
      </div>

      {/* Tabs */}
      <nav className="flex h-[54px] flex-1 overflow-x-auto no-scrollbar">
        {tabs.map((tab) => {
          const active = isActive(tab.href);
          const showBadge = tab.badge != null && tab.badge > 0;
          return (
            <Link
              key={tab.href}
              href={tab.href}
              className={cn(
                'h-[54px] px-4 flex items-center gap-1.5 text-[13px] whitespace-nowrap border-b-[3px] transition-all duration-150',
                active
                  ? 'text-white border-ce-amber'
                  : 'text-white/60 border-transparent hover:text-white/88 hover:bg-white/5',
              )}
            >
              {tab.label}
              {showBadge && (
                tab.badgeDim
                  ? <span className="bg-white/15 text-white/75 text-[10px] font-bold px-1.5 py-px rounded-full min-w-[18px] text-center">{tab.badge}</span>
                  : <span className="bg-ce-amber text-ce-navy3 text-[10px] font-bold px-1.5 py-px rounded-full min-w-[18px] text-center">{tab.badge}</span>
              )}
            </Link>
          );
        })}
      </nav>

      {/* Contract-holder view banner */}
      {effectiveRole === 'user' && user?.role !== 'user' && (
        <div className="flex items-center gap-1.5 rounded-lg bg-amber-400/20 border border-amber-400/40 px-2.5 py-1 text-[11px] font-semibold text-amber-300 flex-shrink-0 mr-2">
          Contract Holder View
        </div>
      )}

      {/* Right side */}
      <div className="flex items-center gap-2.5 flex-shrink-0 ml-4">
        <button className="text-white/65 p-1.5 rounded-md hover:bg-white/10 hover:text-white transition-all">
          <Bell size={18} />
        </button>

        <div className="relative">
          <button
            onClick={() => setMenuOpen((o) => !o)}
            className="flex items-center gap-2 cursor-pointer px-3 py-1 rounded-full border border-white/15 hover:bg-white/8 transition-all"
          >
            <div className="w-7 h-7 rounded-full bg-ce-amber text-ce-navy3 text-[11px] font-bold flex items-center justify-center flex-shrink-0">
              {initials}
            </div>
            <span className="text-white/80 text-[12.5px] font-medium max-w-[140px] truncate">{displayName}</span>
          </button>

          {menuOpen && (
            <>
              <div className="fixed inset-0 z-40" onClick={() => setMenuOpen(false)} />
              <div className="absolute right-0 top-full mt-1 z-50 bg-white rounded-xl border border-ce-border shadow-lg min-w-[200px] py-1 animate-fade-in">
                <div className="px-4 py-2.5 border-b border-ce-border">
                  <p className="text-[13px] font-semibold text-ce-text truncate">{user?.name}</p>
                  <p className="text-[12px] text-ce-muted truncate">{user?.email}</p>
                  <span className="mt-1 inline-block bg-ce-bg px-2 py-0.5 rounded-full text-[10px] font-medium uppercase tracking-wide text-ce-muted">
                    {user?.role}
                  </span>
                </div>

                {canToggle && (
                  <button
                    onClick={() => {
                      const next = viewMode === 'editor' ? 'contract-holder' : 'editor';
                      setViewMode(next);
                      router.push(next === 'contract-holder' ? '/pending-approval' : '/home');
                      setMenuOpen(false);
                    }}
                    className="flex w-full items-center gap-2.5 px-4 py-2 text-[13px] text-ce-text hover:bg-ce-bg transition-colors"
                  >
                    {viewMode === 'editor'
                      ? <><Eye size={14} className="text-ce-muted" /> Switch to Contract Holder view</>
                      : <><UserCog size={14} className="text-ce-muted" /> Switch to Editor view</>}
                  </button>
                )}

                {viewMode === 'contract-holder' && (
                  <div className="mx-3 my-1 rounded-lg bg-amber-50 border border-amber-200 px-3 py-1.5 text-[11px] text-amber-700 font-medium">
                    Contract Holder View active
                  </div>
                )}

                <button
                  onClick={() => { setMenuOpen(false); logout(); }}
                  className="flex w-full items-center gap-2.5 px-4 py-2 text-[13px] text-red-600 hover:bg-red-50 transition-colors"
                >
                  <LogOut size={14} /> Sign out
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    </header>
  );
}

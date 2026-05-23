'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
  Home, Inbox, FileText, BarChart2, FolderOpen, Users,
  ChevronLeft, ChevronRight, Circle, Clock, CheckCircle,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { useAuth } from '@/components/providers/AuthProvider';
import { useWorkflows } from '@/lib/hooks/useWorkflows';
import { useQuery } from '@tanstack/react-query';
import { emailsApi } from '@/lib/api';

interface NavItem {
  label: string;
  href: string;
  icon: React.ElementType;
  editorOnly?: boolean;
  adminOnly?: boolean;
  countKey?: 'pendingReview' | 'pendingApproval' | 'approved';
}

const NAV: NavItem[] = [
  { label: 'Home',             href: '/home',             icon: Home },
  { label: 'Inbox',            href: '/inbox',            icon: Inbox,        editorOnly: true },
  { label: 'Pending Review',   href: '/inbox',            icon: Clock,        editorOnly: true, countKey: 'pendingReview' },
  { label: 'Pending Approval', href: '/pending-approval', icon: FileText,     countKey: 'pendingApproval' },
  { label: 'Approved',         href: '/approved',         icon: CheckCircle,  editorOnly: true, countKey: 'approved' },
  { label: 'Tracker',          href: '/tracker',          icon: BarChart2,    editorOnly: true },
  { label: 'Others',           href: '/others',           icon: FolderOpen,   editorOnly: true },
  { label: 'Admin',            href: '/admin',            icon: Users,        adminOnly: true },
];

interface SidebarProps {
  collapsed: boolean;
  onToggle: () => void;
}

export function Sidebar({ collapsed, onToggle }: SidebarProps) {
  const pathname    = usePathname();
  const { effectiveRole } = useAuth();

  const { data: wfData }     = useWorkflows();
  const { data: emailsData } = useQuery({
    queryKey: ['emails'],
    queryFn:  () => emailsApi.list(),
    refetchInterval: 60_000,
    staleTime: 30_000,
  });

  const wfs    = wfData ?? [];
  const emails = emailsData?.emails ?? [];

  const counts: Record<string, number> = {
    pendingReview:   emails.filter((e) => e.status === 'received').length,
    pendingApproval: wfs.filter((w) => w.status === 'pending_approval' || w.status === 'queried').length,
    approved:        wfs.filter((w) => w.status === 'approved').length,
  };

  const visibleItems = NAV.filter((item) => {
    if (item.adminOnly) return effectiveRole === 'admin';
    if (item.editorOnly) return effectiveRole === 'editor' || effectiveRole === 'admin';
    return true;
  }).filter((item, index, arr) => {
    // Hide Inbox nav when Pending Review is present (avoid duplicate)
    if (item.href === '/inbox' && !item.countKey) {
      return !arr.some((a) => a.href === '/inbox' && a.countKey);
    }
    return true;
  });

  return (
    <aside className={cn('flex h-full flex-col bg-brand-navy transition-all duration-200', collapsed ? 'w-16' : 'w-60')}>
      {/* Logo */}
      <div className="flex h-14 items-center border-b border-white/10 px-4">
        {!collapsed && (
          <div className="min-w-0">
            <p className="truncate text-sm font-bold tracking-wide text-white">Tullow CE</p>
            <p className="truncate text-[10px] text-white/50">Cost Engineering</p>
          </div>
        )}
        {collapsed && <div className="h-7 w-7 rounded bg-brand-gold flex items-center justify-center text-xs font-bold text-white mx-auto">TC</div>}
      </div>

      {/* Nav */}
      <nav className="flex-1 overflow-y-auto py-3">
        {visibleItems.map((item) => {
          const Icon   = item.icon;
          const href   = item.href;
          const active = pathname === href;
          const count  = item.countKey ? counts[item.countKey] : 0;

          return (
            <Link
              key={`${item.href}-${item.label}`}
              href={href}
              className={cn(
                'flex items-center gap-3 px-4 py-2.5 text-sm transition-colors',
                active
                  ? 'bg-white/10 text-white font-medium'
                  : 'text-white/60 hover:bg-white/5 hover:text-white/90',
                collapsed && 'justify-center px-0'
              )}
              title={collapsed ? item.label : undefined}
            >
              <Icon className="h-4 w-4 flex-shrink-0" />
              {!collapsed && (
                <>
                  <span className="truncate flex-1">{item.label}</span>
                  {count > 0 && (
                    <span className="flex-shrink-0 bg-white/15 text-white text-[11px] font-bold px-1.5 py-0.5 rounded-full min-w-[20px] text-center">
                      {count}
                    </span>
                  )}
                </>
              )}
              {collapsed && count > 0 && (
                <span className="absolute right-1 top-1 bg-ce-amber text-ce-navy text-[10px] font-bold w-4 h-4 rounded-full flex items-center justify-center">
                  {count > 9 ? '9+' : count}
                </span>
              )}
            </Link>
          );
        })}
      </nav>

      {/* Collapse toggle */}
      <button
        onClick={onToggle}
        className="flex h-10 items-center justify-center border-t border-white/10 text-white/40 hover:text-white/80 transition-colors"
        title={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
      >
        {collapsed ? <ChevronRight className="h-4 w-4" /> : <ChevronLeft className="h-4 w-4" />}
      </button>
    </aside>
  );
}

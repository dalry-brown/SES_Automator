'use client';

import { useState, useRef, useEffect } from 'react';
import { Bell, X, CheckCheck, ArrowRight } from 'lucide-react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useRouter } from 'next/navigation';
import { notificationsApi } from '@/lib/api';
import { cn } from '@/lib/utils';
import type { AppNotification } from '@/types';

function timeAgo(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60_000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  return days === 1 ? 'yesterday' : `${days}d ago`;
}

function accentBar(title: string): string {
  if (/approv/i.test(title))  return 'bg-emerald-500';
  if (/return/i.test(title))  return 'bg-amber-500';
  if (/quer/i.test(title))    return 'bg-orange-500';
  if (/reroute/i.test(title)) return 'bg-purple-500';
  if (/sent/i.test(title))    return 'bg-blue-500';
  return 'bg-slate-400';
}

interface NotifCardProps {
  n: AppNotification;
  onClick: () => void;
  onDismiss: () => void;
  compact?: boolean;
}

export function NotifCard({ n, onClick, onDismiss, compact = false }: NotifCardProps) {
  return (
    <div
      className={cn(
        'flex gap-0 relative group transition-colors',
        n.isRead ? 'bg-white hover:bg-slate-50/80' : 'bg-blue-50/50 hover:bg-blue-50/80',
      )}
    >
      {/* Left accent bar */}
      <div className={cn('w-1 flex-shrink-0 self-stretch rounded-l', accentBar(n.title))} />

      {/* Body */}
      <button
        className={cn('flex-1 text-left min-w-0', compact ? 'px-3 py-2.5' : 'px-4 py-3.5')}
        onClick={onClick}
      >
        <div className="flex items-start gap-2">
          {!n.isRead && (
            <span className="mt-1.5 w-1.5 h-1.5 rounded-full bg-blue-500 flex-shrink-0" />
          )}
          <div className="min-w-0 flex-1">
            <p className={cn(
              'text-[12.5px] leading-snug mb-0.5',
              n.isRead ? 'font-medium text-slate-700' : 'font-semibold text-[#1b3a6b]',
            )}>
              {n.title}
            </p>
            <p className="text-[11.5px] text-slate-500 line-clamp-2 leading-relaxed">
              {n.body}
            </p>
            <p className="text-[10.5px] text-slate-400 mt-1">{timeAgo(n.createdAt)}</p>
          </div>
        </div>
      </button>

      {/* Dismiss */}
      <button
        onClick={(e) => { e.stopPropagation(); onDismiss(); }}
        title="Dismiss"
        className="flex-shrink-0 self-start mt-2.5 mr-2.5 opacity-0 group-hover:opacity-100 transition-opacity p-1 rounded text-slate-400 hover:text-slate-600 hover:bg-slate-100"
      >
        <X size={12} />
      </button>
    </div>
  );
}

export function NotificationBell() {
  const qc     = useQueryClient();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const panelRef = useRef<HTMLDivElement>(null);

  const { data } = useQuery({
    queryKey: ['notifications'],
    queryFn:  notificationsApi.list,
    refetchInterval: 30_000,
    staleTime:       20_000,
  });

  const notifications: AppNotification[] = data?.notifications ?? [];
  const unreadCount = notifications.filter((n) => !n.isRead).length;
  const preview     = notifications.slice(0, 5);
  const hasMore     = notifications.length > 5;

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (panelRef.current && !panelRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  const markRead = useMutation({
    mutationFn: notificationsApi.markRead,
    onSuccess:  () => qc.invalidateQueries({ queryKey: ['notifications'] }),
  });
  const markAllRead = useMutation({
    mutationFn: notificationsApi.markAllRead,
    onSuccess:  () => qc.invalidateQueries({ queryKey: ['notifications'] }),
  });
  const dismiss = useMutation({
    mutationFn: notificationsApi.dismiss,
    onSuccess:  () => qc.invalidateQueries({ queryKey: ['notifications'] }),
  });

  const handleClick = (n: AppNotification) => {
    if (!n.isRead) markRead.mutate(n.id);
    if (n.link)   router.push(n.link);
    setOpen(false);
  };

  return (
    <div ref={panelRef} className="relative">
      {/* Bell button */}
      <button
        onClick={() => setOpen((o) => !o)}
        aria-label="Notifications"
        className={cn(
          'relative p-1.5 rounded-md transition-all',
          open
            ? 'bg-white/15 text-white'
            : 'text-white/65 hover:bg-white/10 hover:text-white',
        )}
      >
        <Bell size={18} />
        {unreadCount > 0 && (
          <span className="absolute -top-0.5 -right-0.5 min-w-[16px] h-4 rounded-full bg-blue-500 border-2 border-[#1b3a6b] text-[9px] font-bold text-white flex items-center justify-center px-0.5 leading-none">
            {unreadCount > 9 ? '9+' : unreadCount}
          </span>
        )}
      </button>

      {/* Dropdown panel */}
      {open && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} />
          <div className="absolute right-0 top-full mt-2 z-50 w-[360px] bg-white rounded-xl border border-slate-200 shadow-2xl overflow-hidden">
            {/* Header */}
            <div className="flex items-center justify-between px-4 py-3 border-b border-slate-100">
              <div className="flex items-center gap-2">
                <span className="text-[13px] font-semibold text-[#1b3a6b]">Notifications</span>
                {unreadCount > 0 && (
                  <span className="bg-blue-100 text-blue-700 text-[10px] font-bold px-1.5 py-0.5 rounded-full">
                    {unreadCount} new
                  </span>
                )}
              </div>
              {unreadCount > 0 && (
                <button
                  onClick={() => markAllRead.mutate()}
                  className="flex items-center gap-1 text-[11px] text-slate-400 hover:text-[#1b3a6b] transition-colors"
                >
                  <CheckCheck size={12} /> Mark all read
                </button>
              )}
            </div>

            {/* List */}
            {preview.length === 0 ? (
              <div className="py-12 flex flex-col items-center gap-3 text-slate-400">
                <div className="w-10 h-10 rounded-full bg-slate-100 flex items-center justify-center">
                  <Bell size={18} className="opacity-50" />
                </div>
                <p className="text-[12px] font-medium">All caught up!</p>
                <p className="text-[11px] text-slate-400">No notifications yet</p>
              </div>
            ) : (
              <div className="divide-y divide-slate-100 max-h-[380px] overflow-y-auto">
                {preview.map((n) => (
                  <NotifCard
                    key={n.id}
                    n={n}
                    compact
                    onClick={() => handleClick(n)}
                    onDismiss={() => dismiss.mutate(n.id)}
                  />
                ))}
              </div>
            )}

            {/* Footer */}
            {(hasMore || notifications.length > 0) && (
              <div className="border-t border-slate-100">
                <button
                  onClick={() => { setOpen(false); router.push('/notifications'); }}
                  className="w-full flex items-center justify-center gap-1.5 py-2.5 text-[12px] font-medium text-[#1b3a6b] hover:bg-slate-50 transition-colors"
                >
                  View all notifications <ArrowRight size={12} />
                </button>
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}

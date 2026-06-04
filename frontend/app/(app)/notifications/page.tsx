'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Bell, CheckCheck, Trash2 } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { notificationsApi } from '@/lib/api';
import { NotifCard } from '@/components/ui/NotificationBell';
import { PageSpinner } from '@/components/ui/Spinner';
import type { AppNotification } from '@/types';

export default function NotificationsPage() {
  const qc     = useQueryClient();
  const router = useRouter();

  const { data, isLoading } = useQuery({
    queryKey: ['notifications'],
    queryFn:  notificationsApi.list,
    staleTime: 0,
  });

  const notifications: AppNotification[] = data?.notifications ?? [];
  const unreadCount = notifications.filter((n) => !n.isRead).length;

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
  const dismissAll = useMutation({
    mutationFn: async () => {
      for (const n of notifications) await notificationsApi.dismiss(n.id);
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['notifications'] }),
  });

  const handleClick = (n: AppNotification) => {
    if (!n.isRead) markRead.mutate(n.id);
    if (n.link)   router.push(n.link);
  };

  if (isLoading) return <PageSpinner />;

  return (
    <div className="flex flex-col flex-1 overflow-hidden bg-slate-50">
      {/* Page header */}
      <div className="bg-white border-b border-slate-200 px-6 py-4 flex items-center justify-between flex-shrink-0">
        <div>
          <h1 className="text-[17px] font-semibold text-[#1b3a6b]">Notifications</h1>
          <p className="text-[12px] text-slate-400 mt-0.5">
            {notifications.length === 0
              ? 'Nothing here yet'
              : `${notifications.length} notification${notifications.length !== 1 ? 's' : ''}${unreadCount > 0 ? ` · ${unreadCount} unread` : ''}`}
          </p>
        </div>
        <div className="flex items-center gap-2">
          {unreadCount > 0 && (
            <button
              onClick={() => markAllRead.mutate()}
              className="flex items-center gap-1.5 text-[12.5px] font-medium text-[#1b3a6b] border border-[#1b3a6b]/25 bg-[#1b3a6b]/5 hover:bg-[#1b3a6b]/10 rounded-lg px-3 py-1.5 transition-colors"
            >
              <CheckCheck size={13} /> Mark all read
            </button>
          )}
          {notifications.length > 0 && (
            <button
              onClick={() => dismissAll.mutate()}
              disabled={dismissAll.isPending}
              className="flex items-center gap-1.5 text-[12.5px] font-medium text-red-600 border border-red-200 bg-red-50 hover:bg-red-100 rounded-lg px-3 py-1.5 transition-colors disabled:opacity-50"
            >
              <Trash2 size={13} /> Clear all
            </button>
          )}
        </div>
      </div>

      {/* List */}
      <div className="flex-1 overflow-y-auto px-6 py-4">
        {notifications.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-24 gap-4 text-slate-400">
            <div className="w-14 h-14 rounded-full bg-slate-100 flex items-center justify-center">
              <Bell size={24} className="opacity-40" />
            </div>
            <p className="text-[14px] font-medium text-slate-500">All caught up!</p>
            <p className="text-[12px]">Approval alerts and workflow updates will appear here.</p>
          </div>
        ) : (
          <div className="max-w-2xl mx-auto bg-white rounded-xl border border-slate-200 overflow-hidden shadow-sm divide-y divide-slate-100">
            {notifications.map((n) => (
              <NotifCard
                key={n.id}
                n={n}
                onClick={() => handleClick(n)}
                onDismiss={() => dismiss.mutate(n.id)}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

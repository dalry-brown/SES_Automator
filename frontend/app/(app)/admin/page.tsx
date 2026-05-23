'use client';

import { useState } from 'react';
import { UserCog, Trash2, Shield } from 'lucide-react';
import { PageShell } from '@/components/layout/PageShell';
import { PageSpinner } from '@/components/ui/Spinner';
import { Badge } from '@/components/ui/Badge';
import { ConfirmModal } from '@/components/ui/Modal';
import { useToast } from '@/components/ui/Toast';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { adminApi } from '@/lib/api';
import { formatDate } from '@/lib/utils';
import type { AdminUser, Role } from '@/types';
import { useAuth } from '@/components/providers/AuthProvider';

const ROLES: Role[] = ['user', 'editor', 'admin'];
const ROLE_LABELS: Record<Role, string> = { user: 'User', editor: 'Editor', admin: 'Admin' };
const ROLE_COLORS: Record<Role, 'slate' | 'blue' | 'amber'> = { user: 'slate', editor: 'blue', admin: 'amber' };

export default function AdminPage() {
  const { user: me } = useAuth();
  const { success, error: toastError } = useToast();
  const qc = useQueryClient();
  const [search, setSearch] = useState('');
  const [deleteTarget, setDeleteTarget] = useState<AdminUser | null>(null);

  const { data, isLoading } = useQuery({
    queryKey: ['admin', 'users'],
    queryFn: () => adminApi.listUsers(),
  });

  const assignRole = useMutation({
    mutationFn: ({ id, role }: { id: string; role: Role }) => adminApi.assignRole(id, role),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['admin', 'users'] });
      success('Role updated.');
    },
    onError: (err: unknown) => toastError(err instanceof Error ? err.message : 'Failed to update role'),
  });

  const deleteUser = useMutation({
    mutationFn: (id: string) => adminApi.deleteUser(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['admin', 'users'] });
      success('User removed.');
      setDeleteTarget(null);
    },
    onError: (err: unknown) => toastError(err instanceof Error ? err.message : 'Failed to delete user'),
  });

  if (isLoading) return <PageSpinner />;

  const allUsers = (data?.users ?? []) as AdminUser[];
  const filtered = allUsers.filter((u) => {
    if (!search.trim()) return true;
    const q = search.toLowerCase();
    return u.email?.toLowerCase().includes(q) || u.name?.toLowerCase().includes(q);
  });

  return (
    <PageShell
      title="User Management"
      actions={<Badge variant="slate">{filtered.length} user{filtered.length !== 1 ? 's' : ''}</Badge>}
      noPadding
    >
      {/* Search */}
      <div className="border-b border-slate-200 bg-white px-6 py-3">
        <input
          type="text"
          placeholder="Search by name or email…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="w-full max-w-sm rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-sm text-slate-800 placeholder-slate-400 focus:border-brand-sky focus:outline-none focus:ring-1 focus:ring-brand-sky"
        />
      </div>

      <div className="p-6">
        {filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center gap-3 rounded-xl border border-slate-200 bg-white py-20">
            <UserCog className="h-10 w-10 text-slate-300" />
            <p className="text-sm text-slate-500">No users found</p>
          </div>
        ) : (
          <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-card">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-100 bg-slate-50 text-left text-xs font-semibold uppercase tracking-wide text-slate-400">
                  <th className="px-4 py-3">Name</th>
                  <th className="px-4 py-3">Email</th>
                  <th className="px-4 py-3">Role</th>
                  <th className="px-4 py-3">Joined</th>
                  <th className="px-4 py-3 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filtered.map((u) => {
                  const isMe = u.id === me?.userId;
                  return (
                    <tr key={u.id} className="hover:bg-slate-50">
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2.5">
                          <div className="flex h-7 w-7 items-center justify-center rounded-full bg-brand-navy text-xs font-bold text-white">
                            {(u.name ?? u.email ?? '?')[0].toUpperCase()}
                          </div>
                          <span className="font-medium text-slate-800">
                            {u.name ?? '—'}
                            {isMe && (
                              <span className="ml-1.5 text-xs font-normal text-slate-400">(you)</span>
                            )}
                          </span>
                        </div>
                      </td>
                      <td className="px-4 py-3 text-slate-600">{u.email}</td>
                      <td className="px-4 py-3">
                        {isMe ? (
                          <span className="inline-flex items-center gap-1 rounded-full bg-amber-50 px-2 py-0.5 text-xs font-medium text-amber-700 ring-1 ring-amber-200">
                            <Shield className="h-3 w-3" />
                            {ROLE_LABELS[u.role as Role] ?? u.role}
                          </span>
                        ) : (
                          <select
                            value={u.role}
                            onChange={(e) => assignRole.mutate({ id: u.id, role: e.target.value as Role })}
                            className="rounded-md border border-slate-300 bg-white px-2 py-1 text-xs focus:border-brand-sky focus:outline-none focus:ring-1 focus:ring-brand-sky"
                          >
                            {ROLES.map((r) => (
                              <option key={r} value={r}>{ROLE_LABELS[r]}</option>
                            ))}
                          </select>
                        )}
                      </td>
                      <td className="px-4 py-3 text-slate-500">{formatDate(u.createdAt)}</td>
                      <td className="px-4 py-3 text-right">
                        {!isMe && (
                          <button
                            onClick={() => setDeleteTarget(u)}
                            className="rounded p-1.5 text-slate-400 hover:bg-red-50 hover:text-red-600"
                            title="Remove user"
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </button>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <ConfirmModal
        open={!!deleteTarget}
        onClose={() => setDeleteTarget(null)}
        onConfirm={() => deleteTarget && deleteUser.mutate(deleteTarget.id)}
        title="Remove User?"
        message={`${deleteTarget?.name ?? deleteTarget?.email} will be removed from the system. They can re-join by logging in again.`}
        confirmLabel="Remove"
        danger
      />
    </PageShell>
  );
}

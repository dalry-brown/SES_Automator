'use client';

import { useCallback, useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { AlertCircle, CheckCircle, Clock, RotateCcw, XCircle, Lock as LockIcon } from 'lucide-react';
import { useWorkflow, useWorkflowMutations } from '@/lib/hooks/useWorkflows';
import { useSesFormByWorkflow } from '@/lib/hooks/useSES';
import { sesApi, emailsApi, attachmentsApi } from '@/lib/api';
import { SesFormPanel } from '@/components/ses/SesFormPanel';
import { PageSpinner } from '@/components/ui/Spinner';
import { useToast } from '@/components/ui/Toast';
import { useAuth } from '@/components/providers/AuthProvider';
import { cn } from '@/lib/utils';
import type { WorkflowStatus } from '@/types';

// ── Statuses where the form must be read-only ─────────────────────────────────
const READ_ONLY_STATUSES: WorkflowStatus[] = [
  'pending_approval', 'queried', 'approved', 'sent', 'closed', 'cancelled',
];

// ── Status banners shown above the form when it cannot be edited ───────────────
const STATUS_BANNER: Partial<Record<WorkflowStatus, {
  icon: React.ElementType;
  bg: string; border: string; text: string; sub: string;
  actionLabel?: string; actionHref?: (id: string) => string;
}>> = {
  pending_approval: {
    icon: Clock,
    bg: 'bg-blue-50', border: 'border-blue-200', text: 'text-blue-800', sub: 'text-blue-600',
    actionLabel: 'Go to approval page →',
    actionHref: (id) => `/workflows/${id}/approval`,
  },
  queried: {
    icon: AlertCircle,
    bg: 'bg-amber-50', border: 'border-amber-200', text: 'text-amber-800', sub: 'text-amber-600',
    actionLabel: 'View query details →',
    actionHref: (id) => `/workflows/${id}/approval`,
  },
  returned: {
    icon: RotateCcw,
    bg: 'bg-orange-50', border: 'border-orange-200', text: 'text-orange-800', sub: 'text-orange-600',
    actionLabel: 'View reason →',
    actionHref: (id) => `/workflows/${id}/approval`,
  },
  approved: {
    icon: CheckCircle,
    bg: 'bg-emerald-50', border: 'border-emerald-200', text: 'text-emerald-800', sub: 'text-emerald-600',
    actionLabel: 'View signed document →',
    actionHref: (id) => `/workflows/${id}/approval`,
  },
  sent: {
    icon: CheckCircle,
    bg: 'bg-emerald-50', border: 'border-emerald-200', text: 'text-emerald-800', sub: 'text-emerald-600',
    actionLabel: 'View signed document →',
    actionHref: (id) => `/workflows/${id}/approval`,
  },
  closed: {
    icon: XCircle,
    bg: 'bg-slate-50', border: 'border-slate-200', text: 'text-slate-600', sub: 'text-slate-400',
  },
  cancelled: {
    icon: XCircle,
    bg: 'bg-slate-50', border: 'border-slate-200', text: 'text-slate-600', sub: 'text-slate-400',
  },
};

const STATUS_MESSAGES: Partial<Record<WorkflowStatus, { title: string; subtitle: string }>> = {
  pending_approval: {
    title:    'Awaiting approval',
    subtitle: 'This form has been submitted and is read-only while the contract holder reviews it.',
  },
  queried: {
    title:    'Query raised by contract holder',
    subtitle: 'The contract holder has raised a query. The form is read-only until they approve or return it.',
  },
  returned: {
    title:    'Returned for corrections',
    subtitle: 'The contract holder has returned this form. You can edit it below, then resubmit for approval.',
  },
  approved: {
    title:    'Approved',
    subtitle: 'This workflow has been digitally approved and is now read-only.',
  },
  sent: {
    title:    'Approved & sent to vendor',
    subtitle: 'The signed document has been sent to the vendor. This workflow is read-only.',
  },
  closed: {
    title:    'Workflow closed',
    subtitle: 'This workflow has been closed.',
  },
  cancelled: {
    title:    'Workflow cancelled',
    subtitle: 'This workflow has been cancelled.',
  },
};

function StatusBanner({ status, workflowId }: { status: WorkflowStatus; workflowId: string }) {
  const router  = useRouter();
  const cfg     = STATUS_BANNER[status];
  const msg     = STATUS_MESSAGES[status];
  if (!cfg || !msg) return null;

  const Icon = cfg.icon;

  return (
    <div className={cn('flex items-start gap-3 px-5 py-3 border-b', cfg.bg, cfg.border)}>
      <Icon size={16} className={cn('flex-shrink-0 mt-0.5', cfg.text)} />
      <div className="flex-1 min-w-0">
        <p className={cn('text-[13px] font-semibold', cfg.text)}>{msg.title}</p>
        <p className={cn('text-[12px] mt-0.5', cfg.sub)}>{msg.subtitle}</p>
      </div>
      {cfg.actionLabel && cfg.actionHref && (
        <button
          onClick={() => router.push(cfg.actionHref!(workflowId))}
          className={cn('flex-shrink-0 text-[12px] font-medium underline underline-offset-2', cfg.text)}
        >
          {cfg.actionLabel}
        </button>
      )}
    </div>
  );
}

// ── Page ───────────────────────────────────────────────────────────────────────
export default function SesFormPage() {
  const { id } = useParams<{ id: string }>();
  const { user } = useAuth();
  const { error: toastError, success } = useToast();
  const router = useRouter();
  const qc = useQueryClient();
  const [creating, setCreating] = useState(false);

  const { data: workflow, isLoading: wfLoading } = useWorkflow(id);
  const { data: sesForm, isLoading: formLoading, refetch: refetchForm } = useSesFormByWorkflow(id);
  const { acquireLock, releaseLock } = useWorkflowMutations();

  const { data: emailsData } = useQuery({
    queryKey: ['emails', 'workflow', id],
    queryFn:  () => emailsApi.list({ workflowId: id }),
    enabled:  !!id,
  });

  const { data: attachmentsData } = useQuery({
    queryKey: ['attachments', 'workflow', id],
    queryFn:  () => attachmentsApi.byWorkflow(id),
    enabled:  !!id,
  });

  // Acquire lock on mount, release on unmount — only when form is editable
  const status = workflow?.status as WorkflowStatus | undefined;
  const isEditableStatus = status && !READ_ONLY_STATUSES.includes(status);

  useEffect(() => {
    if (!id || !isEditableStatus) return;
    acquireLock.mutate(id, {
      onError: (err: unknown) => {
        toastError(err instanceof Error ? err.message : 'Could not acquire lock');
      },
    });
    return () => { releaseLock.mutate(id); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id, isEditableStatus]);

  const handleCreateForm = useCallback(async (count: number = 1) => {
    setCreating(true);
    try {
      const initialForms = Array.from({ length: count }, () => ({}));
      await sesApi.create(id, { forms: initialForms, formCount: count });
      await refetchForm();
      qc.invalidateQueries({ queryKey: ['workflows', id] });
      success(count > 1 ? `${count} SES forms created.` : 'SES form created.');
    } catch (err: unknown) {
      toastError(err instanceof Error ? err.message : 'Failed to create form');
    } finally {
      setCreating(false);
    }
  }, [id, refetchForm, qc, success, toastError]);

  if (wfLoading || formLoading) return <PageSpinner />;
  if (!workflow) return (
    <div className="flex h-64 items-center justify-center text-[13px] text-ce-muted">
      Workflow not found.
    </div>
  );

  // ── Read-only logic ──────────────────────────────────────────────────────────
  const lockedByOther = workflow.lockedBy && workflow.lockedBy !== user?.userId;
  const lockExpired   = workflow.lockedAt
    ? (Date.now() - new Date(workflow.lockedAt).getTime()) / 60000 > 15
    : true;
  const lockedByName  = lockedByOther && !lockExpired
    ? (workflow.lockedByName ?? workflow.lockedByEmail ?? undefined)
    : undefined;

  // Form is read-only when workflow status is in the read-only set, OR another
  // user holds an unexpired lock on it.
  const statusReadOnly = READ_ONLY_STATUSES.includes(workflow.status as WorkflowStatus);
  const lockReadOnly   = !!lockedByOther && !lockExpired;
  const isReadOnly     = statusReadOnly || lockReadOnly;

  // CH role: redirect straight to approval page for pending/approved workflows
  if (user?.role === 'user' && ['pending_approval', 'queried', 'approved', 'sent'].includes(workflow.status)) {
    router.replace(`/workflows/${id}/approval`);
    return <PageSpinner />;
  }

  return (
    <div className="flex flex-col flex-1 overflow-hidden">
      {/* Status banner (only when status-driven read-only) */}
      {statusReadOnly && (
        <StatusBanner status={workflow.status as WorkflowStatus} workflowId={id} />
      )}

      {/* Lock banner (someone else is editing) */}
      {lockReadOnly && (
        <div className="flex items-center gap-3 px-5 py-3 border-b bg-red-50 border-red-200">
          <LockIcon size={15} className="text-red-500 flex-shrink-0" />
          <p className="text-[13px] text-red-700">
            <strong>{lockedByName}</strong> is currently editing this form. It is read-only until
            they finish or the lock expires.
          </p>
        </div>
      )}

      <SesFormPanel
        workflowId={id}
        workflow={workflow}
        sesForm={sesForm ?? null}
        emailThread={emailsData?.emails?.[0] ?? null}
        attachments={attachmentsData?.attachments ?? []}
        isReadOnly={isReadOnly}
        lockedByName={lockedByName}
        creating={creating}
        onCreateForm={handleCreateForm}
        onSubmitted={() => {
          qc.invalidateQueries({ queryKey: ['workflows'] });
          router.replace(`/workflows/${id}`);
        }}
        onBack={() => router.push('/pending-approval')}
      />
    </div>
  );
}

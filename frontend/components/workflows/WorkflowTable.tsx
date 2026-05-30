'use client';

import { useRouter } from 'next/navigation';
import { AlertCircle, BookOpen } from 'lucide-react';
import { Table } from '@/components/ui/Table';
import { StatusBadge } from '@/components/ui/Badge';
import { EmptyState } from '@/components/ui/EmptyState';
import { formatCurrency, formatDate, daysSince } from '@/lib/utils';
import type { Workflow } from '@/types';

function formatDraftEditor(name: string | null): string {
  if (!name) return '';
  const parts = name.trim().split(/\s+/);
  if (parts.length === 1) return parts[0];
  return `${parts[0]}.${parts[parts.length - 1]}`;
}

interface WorkflowTableProps {
  workflows: Workflow[];
  emptyTitle?: string;
  emptyDescription?: string;
  showContractHolder?: boolean;
}

function LockDot({ workflow }: { workflow: Workflow }) {
  if (!workflow.lockedBy) return null;
  const ageMin = workflow.lockedAt
    ? (Date.now() - new Date(workflow.lockedAt).getTime()) / 60000
    : 999;
  if (ageMin > 15) return null;
  return (
    <span
      title={`Being edited by ${workflow.lockedByName ?? workflow.lockedByEmail}`}
      className="ml-1.5 inline-block h-2 w-2 rounded-full bg-red-500 ring-2 ring-red-100"
    />
  );
}

function DraftBadge({ workflow }: { workflow: Workflow }) {
  if (!workflow.hasDraft || workflow.status !== 'received') return null;
  const editor = formatDraftEditor(workflow.draftEditorName);
  return (
    <span
      title={`Draft saved by ${workflow.draftEditorName ?? 'a cost engineer'}`}
      className="ml-2 inline-flex items-center gap-1 bg-sky-50 text-sky-600 border border-sky-200 text-[10.5px] font-semibold px-1.5 py-0.5 rounded-full"
    >
      <BookOpen size={9} />
      Draft{editor ? ` · ${editor}` : ''}
    </span>
  );
}

function DaysWaiting({ workflow }: { workflow: Workflow }) {
  const ref = workflow.submittedAt ?? workflow.createdAt;
  const days = daysSince(ref);
  if (days === null) return <span className="text-slate-400">—</span>;
  const overdue = days > 7 && workflow.status === 'pending_approval';
  return (
    <span className={overdue ? 'font-semibold text-red-600' : 'text-slate-600'}>
      {days}d{overdue && ' ⚠'}
    </span>
  );
}

export function WorkflowTable({ workflows, emptyTitle, emptyDescription, showContractHolder }: WorkflowTableProps) {
  const router = useRouter();

  if (workflows.length === 0) {
    return (
      <EmptyState
        icon={<AlertCircle className="h-7 w-7" />}
        title={emptyTitle ?? 'No workflows found'}
        description={emptyDescription}
      />
    );
  }

  const columns = [
    {
      key: 'id',
      header: 'Ref',
      render: (w: Workflow) => (
        <span className="flex items-center font-mono text-xs font-semibold text-brand-sky">
          {w.id}
          <LockDot workflow={w} />
          <DraftBadge workflow={w} />
        </span>
      ),
    },
    {
      key: 'supplier',
      header: 'Supplier',
      render: (w: Workflow) => (
        <span className="max-w-[180px] truncate block text-slate-800">{w.supplierName ?? '—'}</span>
      ),
    },
    {
      key: 'invoice',
      header: 'Invoice #',
      render: (w: Workflow) => <span className="text-slate-600">{w.invoiceNumber ?? '—'}</span>,
    },
    {
      key: 'amount',
      header: 'Amount',
      headerClassName: 'text-right',
      className: 'text-right tabular-nums',
      render: (w: Workflow) => (
        <span className="font-medium text-slate-800">{formatCurrency(w.amount, w.currency)}</span>
      ),
    },
    ...(showContractHolder
      ? [{
          key: 'holder',
          header: 'Contract Holder',
          render: (w: Workflow) => (
            <span className="text-slate-600 text-xs">{w.contractHolderName ?? w.contractHolderEmail ?? '—'}</span>
          ),
        }]
      : []),
    {
      key: 'received',
      header: 'Received',
      render: (w: Workflow) => <span className="text-slate-500 text-xs">{formatDate(w.createdAt)}</span>,
    },
    {
      key: 'status',
      header: 'Status',
      render: (w: Workflow) => <StatusBadge status={w.status} label={w.statusLabel} />,
    },
    {
      key: 'days',
      header: 'Days',
      headerClassName: 'text-right',
      className: 'text-right',
      render: (w: Workflow) => <DaysWaiting workflow={w} />,
    },
  ];

  return (
    <Table
      columns={columns}
      rows={workflows}
      rowKey={(w) => w.id}
      onRowClick={(w) => {
        if (w.status === 'pending_approval' || w.status === 'approved' || w.status === 'queried') {
          router.push(`/workflows/${w.id}/approval`);
        } else {
          router.push(`/workflows/${w.id}`);
        }
      }}
      stickyHeader
    />
  );
}

'use client';

import { useMemo, useState, useEffect } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import { PageShell } from '@/components/layout/PageShell';
import { WorkflowTable } from '@/components/workflows/WorkflowTable';
import { WorkflowFilters } from '@/components/workflows/WorkflowFilters';
import { PageSpinner } from '@/components/ui/Spinner';
import { Badge } from '@/components/ui/Badge';
import { useWorkflows } from '@/lib/hooks/useWorkflows';
import { useAuth } from '@/components/providers/AuthProvider';
import type { WorkflowStatus } from '@/types';

const STATUS_LABELS: Partial<Record<WorkflowStatus, string>> = {
  pending_approval: 'Pending Approval',
  approved:         'Approved',
  in_progress:      'In Progress',
  received:         'Received',
  queried:          'Queried',
  returned:         'Returned',
  cancelled:        'Cancelled',
};

const STATUS_ACCENTS: Partial<Record<WorkflowStatus, 'amber' | 'green' | 'blue' | 'slate' | 'red'>> = {
  pending_approval: 'amber',
  approved:         'green',
  in_progress:      'blue',
  queried:          'amber',
  returned:         'red',
};

export default function WorkflowsPage() {
  const { effectiveRole } = useAuth();
  const router = useRouter();
  const searchParams = useSearchParams();

  // Redirect bare /workflows to appropriate home — no longer a primary route
  useEffect(() => {
    if (!searchParams.get('status')) {
      router.replace(effectiveRole === 'user' ? '/pending-approval' : '/home');
    }
  }, [effectiveRole, router, searchParams]);
  const statusFilter = searchParams.get('status') as WorkflowStatus | null;
  const [search, setSearch] = useState('');

  const { data: allWorkflows, isLoading } = useWorkflows();

  const workflows = useMemo(() => {
    if (!allWorkflows) return [];
    let list = allWorkflows;
    if (statusFilter) list = list.filter((w) => w.status === statusFilter);
    if (search.trim()) {
      const q = search.trim().toLowerCase();
      list = list.filter(
        (w) =>
          w.supplierName?.toLowerCase().includes(q) ||
          w.invoiceNumber?.toLowerCase().includes(q) ||
          w.contractHolderEmail?.toLowerCase().includes(q),
      );
    }
    return list;
  }, [allWorkflows, statusFilter, search]);

  const pageTitle = statusFilter ? (STATUS_LABELS[statusFilter] ?? 'Workflows') : 'All Workflows';

  const emptyDescription = effectiveRole === 'user'
    ? statusFilter === 'pending_approval'
      ? 'You have no invoices currently awaiting your approval.'
      : statusFilter === 'approved'
      ? 'No approved workflows yet.'
      : 'No matching workflows.'
    : `No workflows match the current filter.`;

  if (isLoading) return <PageSpinner />;

  return (
    <PageShell
      title={pageTitle}
      actions={
        <Badge variant={STATUS_ACCENTS[statusFilter as WorkflowStatus] ?? 'slate'}>
          {workflows.length} {workflows.length === 1 ? 'record' : 'records'}
        </Badge>
      }
      noPadding
    >
      {effectiveRole !== 'user' && (
        <WorkflowFilters onSearch={setSearch} searchValue={search} />
      )}
      <div className="p-6">
        <WorkflowTable
          workflows={workflows}
          emptyTitle={statusFilter === 'pending_approval' ? 'No pending approvals' : 'No workflows found'}
          emptyDescription={emptyDescription}
          showContractHolder={effectiveRole !== 'user'}
        />
      </div>
    </PageShell>
  );
}

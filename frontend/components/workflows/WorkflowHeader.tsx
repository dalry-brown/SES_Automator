import { ArrowLeft } from 'lucide-react';
import Link from 'next/link';
import { StatusBadge } from '@/components/ui/Badge';
import { formatCurrency, formatDate } from '@/lib/utils';
import type { Workflow } from '@/types';

interface WorkflowHeaderProps {
  workflow: Workflow;
  backHref?: string;
  actions?: React.ReactNode;
}

export function WorkflowHeader({ workflow, backHref = '/pending-approval', actions }: WorkflowHeaderProps) {
  return (
    <div className="border-b border-slate-200 bg-white px-6 py-4">
      <div className="flex items-start justify-between gap-4">
        <div className="flex items-start gap-4">
          <Link href={backHref} className="mt-0.5 flex-shrink-0 rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-600 transition-colors">
            <ArrowLeft className="h-4 w-4" />
          </Link>
          <div>
            <div className="flex items-center gap-2.5">
              <span className="font-mono text-sm font-bold text-slate-900">{workflow.id}</span>
              <StatusBadge status={workflow.status} label={workflow.statusLabel} />
            </div>
            <div className="mt-1.5 flex flex-wrap gap-x-5 gap-y-1 text-xs text-slate-500">
              {workflow.supplierName && <span><span className="font-medium text-slate-700">Supplier:</span> {workflow.supplierName}</span>}
              {workflow.invoiceNumber && <span><span className="font-medium text-slate-700">Invoice:</span> {workflow.invoiceNumber}</span>}
              {workflow.poNumber && <span><span className="font-medium text-slate-700">PO:</span> {workflow.poNumber}</span>}
              {workflow.amount != null && <span><span className="font-medium text-slate-700">Amount:</span> {formatCurrency(workflow.amount, workflow.currency)}</span>}
              {workflow.contractHolderName && <span><span className="font-medium text-slate-700">Contract Holder:</span> {workflow.contractHolderName}</span>}
              {workflow.createdAt && <span><span className="font-medium text-slate-700">Received:</span> {formatDate(workflow.createdAt)}</span>}
            </div>
          </div>
        </div>
        {actions && <div className="flex flex-shrink-0 items-center gap-2">{actions}</div>}
      </div>
    </div>
  );
}

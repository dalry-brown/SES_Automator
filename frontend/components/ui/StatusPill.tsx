'use client';

import { cn } from '@/lib/utils';
import type { WorkflowStatus } from '@/types';

type PillVariant = 'review' | 'approval' | 'approved' | 'sent' | 'closed' | 'other' | 'comment';

const STATUS_VARIANT: Record<WorkflowStatus, PillVariant> = {
  received:         'review',
  in_progress:      'review',
  pending_approval: 'approval',
  approved:         'approved',
  sent:             'sent',
  closed:           'closed',
  other:            'other',
  queried:          'other',
  returned:         'comment',
  cancelled:        'closed',
};

const STATUS_LABEL: Record<WorkflowStatus, string> = {
  received:         'Pending Review',
  in_progress:      'Pending Review',
  pending_approval: 'Pend. Approval',
  approved:         'Approved',
  sent:             'Sent',
  closed:           'Closed',
  other:            'Other',
  queried:          'Pending · Queried',
  returned:         'Returned',
  cancelled:        'Cancelled',
};

const VARIANT_CLASSES: Record<PillVariant, string> = {
  review:   'bg-[#fff7ed] text-[#c05621] border border-[#fed7aa]',
  approval: 'bg-[#eff6ff] text-[#1e4db7] border border-[#bfdbfe]',
  approved: 'bg-[#f0fdf4] text-[#166534] border border-[#bbf7d0]',
  sent:     'bg-[#f5f3ff] text-[#5b21b6] border border-[#ddd6fe]',
  closed:   'bg-[#f9fafb] text-[#374151] border border-[#e5e7eb]',
  other:    'bg-[#fdf6ec] text-[#92400e] border border-[#fcd34d]',
  comment:  'bg-[#fef2f2] text-[#991b1b] border border-[#fecaca]',
};

interface StatusPillProps {
  status: WorkflowStatus;
  label?: string;
  className?: string;
  small?: boolean;
}

export function StatusPill({ status, label, className, small }: StatusPillProps) {
  const variant = STATUS_VARIANT[status] ?? 'closed';
  const text = label ?? STATUS_LABEL[status] ?? status;

  return (
    <span
      className={cn(
        'inline-flex items-center gap-1 rounded-full font-semibold whitespace-nowrap',
        small ? 'px-2 py-0.5 text-[11px]' : 'px-2.5 py-[3px] text-[12px]',
        VARIANT_CLASSES[variant],
        className,
      )}
    >
      {text}
    </span>
  );
}

interface GenericPillProps {
  variant?: PillVariant;
  children: React.ReactNode;
  className?: string;
}

export function Pill({ variant = 'other', children, className }: GenericPillProps) {
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1 rounded-full px-2.5 py-[3px] text-[12px] font-semibold whitespace-nowrap',
        VARIANT_CLASSES[variant],
        className,
      )}
    >
      {children}
    </span>
  );
}

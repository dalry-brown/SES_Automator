import { cn } from '@/lib/utils';
import type { WorkflowStatus } from '@/types';

const statusStyles: Record<WorkflowStatus, string> = {
  received:         'bg-slate-100 text-slate-700',
  in_progress:      'bg-blue-50 text-blue-700 ring-1 ring-blue-200',
  pending_approval: 'bg-amber-50 text-amber-700 ring-1 ring-amber-200',
  approved:         'bg-emerald-50 text-emerald-700 ring-1 ring-emerald-200',
  sent:             'bg-violet-50 text-violet-700 ring-1 ring-violet-200',
  closed:           'bg-gray-100 text-gray-500',
  other:            'bg-amber-50 text-amber-800 ring-1 ring-amber-200',
  queried:          'bg-orange-50 text-orange-700 ring-1 ring-orange-200',
  returned:         'bg-rose-50 text-rose-700 ring-1 ring-rose-200',
  cancelled:        'bg-gray-100 text-gray-500',
};

interface StatusBadgeProps {
  status: WorkflowStatus;
  label?: string;
  className?: string;
}

export function StatusBadge({ status, label, className }: StatusBadgeProps) {
  return (
    <span className={cn('inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium', statusStyles[status], className)}>
      {label || status.replace('_', ' ')}
    </span>
  );
}

interface BadgeProps {
  variant?: 'default' | 'blue' | 'green' | 'amber' | 'red' | 'slate';
  children: React.ReactNode;
  className?: string;
}

const badgeVariants = {
  default: 'bg-slate-100 text-slate-700',
  blue:    'bg-blue-50 text-blue-700 ring-1 ring-blue-200',
  green:   'bg-emerald-50 text-emerald-700 ring-1 ring-emerald-200',
  amber:   'bg-amber-50 text-amber-700 ring-1 ring-amber-200',
  red:     'bg-red-50 text-red-700 ring-1 ring-red-200',
  slate:   'bg-slate-50 text-slate-600 ring-1 ring-slate-200',
};

export function Badge({ variant = 'default', children, className }: BadgeProps) {
  return (
    <span className={cn('inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium', badgeVariants[variant], className)}>
      {children}
    </span>
  );
}

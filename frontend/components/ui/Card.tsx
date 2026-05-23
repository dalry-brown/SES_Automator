import { cn } from '@/lib/utils';
import type { ReactNode } from 'react';

interface CardProps {
  className?: string;
  children: ReactNode;
  padding?: 'none' | 'sm' | 'md' | 'lg';
}

const paddings = { none: '', sm: 'p-4', md: 'p-5', lg: 'p-6' };

export function Card({ className, children, padding = 'md' }: CardProps) {
  return (
    <div className={cn('rounded-lg border border-slate-200 bg-white shadow-card', paddings[padding], className)}>
      {children}
    </div>
  );
}

interface StatCardProps {
  label: string;
  value: string | number;
  sub?: string;
  accent?: 'blue' | 'amber' | 'green' | 'red' | 'slate';
  icon?: ReactNode;
  className?: string;
}

const accents = {
  blue:  { ring: 'ring-blue-200',    icon: 'bg-blue-50 text-blue-600',    val: 'text-brand-sky' },
  amber: { ring: 'ring-amber-200',   icon: 'bg-amber-50 text-amber-600',  val: 'text-amber-600' },
  green: { ring: 'ring-emerald-200', icon: 'bg-emerald-50 text-emerald-600', val: 'text-emerald-600' },
  red:   { ring: 'ring-red-200',     icon: 'bg-red-50 text-red-600',      val: 'text-red-600' },
  slate: { ring: 'ring-slate-200',   icon: 'bg-slate-100 text-slate-600', val: 'text-slate-800' },
};

export function StatCard({ label, value, sub, accent = 'slate', icon, className }: StatCardProps) {
  const a = accents[accent];
  return (
    <div className={cn('rounded-lg border bg-white p-5 shadow-card ring-1', a.ring, className)}>
      <div className="flex items-start justify-between">
        <div className="min-w-0 flex-1">
          <p className="text-xs font-medium uppercase tracking-wide text-slate-500">{label}</p>
          <p className={cn('mt-1.5 text-2xl font-bold tabular-nums', a.val)}>{value}</p>
          {sub && <p className="mt-0.5 text-xs text-slate-400">{sub}</p>}
        </div>
        {icon && <div className={cn('flex-shrink-0 rounded-lg p-2.5', a.icon)}>{icon}</div>}
      </div>
    </div>
  );
}

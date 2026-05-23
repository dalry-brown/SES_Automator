import { cn } from '@/lib/utils';
import type { ReactNode } from 'react';

interface PageShellProps {
  title?: string;
  actions?: ReactNode;
  children: ReactNode;
  className?: string;
  noPadding?: boolean;
}

export function PageShell({ title, actions, children, className, noPadding }: PageShellProps) {
  return (
    <div className={cn('flex h-full flex-col', className)}>
      {(title || actions) && (
        <div className="flex items-center justify-between border-b border-slate-200 bg-white px-6 py-4">
          {title && <h2 className="text-base font-semibold text-slate-800">{title}</h2>}
          {actions && <div className="flex items-center gap-2">{actions}</div>}
        </div>
      )}
      <div className={cn('flex-1 overflow-auto', !noPadding && 'p-6')}>
        {children}
      </div>
    </div>
  );
}

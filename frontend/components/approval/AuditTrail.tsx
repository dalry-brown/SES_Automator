import { CheckCircle, MessageCircle, AlertCircle, RotateCcw, Send, UserCheck } from 'lucide-react';
import { formatDateTime } from '@/lib/utils';
import type { ApprovalEvent, ApprovalEventType } from '@/types';

const EVENT_CONFIG: Record<ApprovalEventType, { icon: React.ElementType; color: string; label: string }> = {
  submitted: { icon: Send,         color: 'text-blue-500 bg-blue-50',       label: 'Submitted for approval' },
  signed:    { icon: CheckCircle,  color: 'text-emerald-500 bg-emerald-50', label: 'Approved & signed' },
  comment:   { icon: MessageCircle,color: 'text-slate-500 bg-slate-100',    label: 'Comment added' },
  queried:   { icon: AlertCircle,  color: 'text-amber-500 bg-amber-50',     label: 'Query raised' },
  returned:  { icon: RotateCcw,    color: 'text-rose-500 bg-rose-50',       label: 'Returned for revision' },
  rerouted:  { icon: UserCheck,    color: 'text-violet-500 bg-violet-50',   label: 'Re-routed' },
};

interface AuditTrailProps {
  events: ApprovalEvent[];
}

export function AuditTrail({ events }: AuditTrailProps) {
  if (events.length === 0) {
    return <p className="text-xs text-slate-400 py-4 text-center">No activity yet</p>;
  }

  return (
    <ol className="relative space-y-0">
      {events.map((event, i) => {
        const cfg   = EVENT_CONFIG[event.type] ?? EVENT_CONFIG.comment;
        const Icon  = cfg.icon;
        const isLast = i === events.length - 1;

        return (
          <li key={event.id} className="flex gap-3">
            {/* Timeline line + icon */}
            <div className="flex flex-col items-center">
              <div className={`flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-full ${cfg.color}`}>
                <Icon className="h-3.5 w-3.5" />
              </div>
              {!isLast && <div className="mt-1 h-full w-px bg-slate-200" style={{ minHeight: 16 }} />}
            </div>

            {/* Content */}
            <div className="flex-1 pb-4">
              <div className="flex items-baseline justify-between gap-2">
                <p className="text-xs font-semibold text-slate-800">{cfg.label}</p>
                <span className="flex-shrink-0 text-[10px] text-slate-400">
                  {formatDateTime(event.createdAt)}
                </span>
              </div>
              <p className="text-xs text-slate-500">{event.userName}</p>

              {/* Rerouted to info */}
              {event.type === 'rerouted' && event.reroutedToName && (
                <p className="text-xs text-violet-600 mt-0.5">
                  → {event.reroutedToName}
                  {event.reroutedToEmail ? ` (${event.reroutedToEmail})` : ''}
                </p>
              )}

              {/* Comment text (excluding rerouted — already shown above) */}
              {event.comment && event.type !== 'rerouted' && (
                <div className="mt-1.5 rounded-md bg-slate-50 px-3 py-2 text-xs text-slate-600 border border-slate-200 leading-relaxed">
                  {event.comment}
                </div>
              )}

              {/* Document hash for signed events */}
              {event.type === 'signed' && event.docHash && (
                <p className="mt-1 font-mono text-[9px] text-slate-400 break-all">
                  SHA-256: {event.docHash.slice(0, 24)}…
                </p>
              )}
            </div>
          </li>
        );
      })}
    </ol>
  );
}

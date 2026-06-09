'use client';

import { useState, useEffect } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import {
  CheckCircle, Clock, Send, FileText, X, Plus, ExternalLink,
  AlertTriangle, User,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { approvalApi, documentsApi } from '@/lib/api';
import { useToast } from '@/components/ui/Toast';
import { AuditTrail } from '@/components/approval/AuditTrail';
import type { Workflow, ApprovalEvent } from '@/types';

// ── Inline PDF viewer ─────────────────────────────────────────────────────────
function PdfFrame({ url, label }: { url: string; label?: string }) {
  return (
    <div className="flex flex-col flex-1 overflow-hidden">
      <div className="flex items-center justify-between border-b border-slate-200 bg-slate-50 px-3 py-2 flex-shrink-0">
        <div className="flex items-center gap-2 text-xs text-slate-500">
          <FileText className="h-3.5 w-3.5" />
          <span>{label ?? 'Signed document'}</span>
        </div>
        <button
          onClick={() => window.open(url, '_blank', 'width=900,height=1100,menubar=no,toolbar=no')}
          className="flex items-center gap-1 text-[11px] text-slate-400 hover:text-slate-600 transition-colors"
        >
          <ExternalLink className="h-3 w-3" /> Pop out
        </button>
      </div>
      <iframe
        key={url}
        src={url}
        title="Signed SES Document"
        className="flex-1 w-full border-0 bg-slate-100"
        style={{ minHeight: 400 }}
      />
    </div>
  );
}

// ── Right-panel placeholders ──────────────────────────────────────────────────
function SelectChildPlaceholder({ count }: { count: number }) {
  return (
    <div className="flex flex-1 flex-col items-center justify-center bg-slate-50 text-center p-8">
      <div className="mb-3 flex h-14 w-14 items-center justify-center rounded-full bg-slate-100">
        <FileText className="h-7 w-7 text-slate-400" />
      </div>
      <p className="text-sm font-semibold text-slate-600">Select a form to preview its document</p>
      <p className="mt-1 text-xs text-slate-400 max-w-xs">
        {count} sub-workflow{count !== 1 ? 's' : ''} — click one on the left.
      </p>
    </div>
  );
}

function PendingChildPlaceholder({ child }: { child: Workflow }) {
  const cfg: Record<string, { cls: string; label: string }> = {
    pending_approval: { cls: 'bg-blue-100', label: 'Awaiting contract holder signature' },
    queried:          { cls: 'bg-amber-100', label: 'Query raised by contract holder' },
    returned:         { cls: 'bg-rose-100', label: 'Returned for corrections' },
  };
  const { cls, label } = cfg[child.status] ?? { cls: 'bg-slate-100', label: child.statusLabel };
  return (
    <div className="flex flex-1 flex-col items-center justify-center bg-slate-50 text-center p-8">
      <div className={`mb-3 flex h-14 w-14 items-center justify-center rounded-full ${cls}`}>
        <Clock className="h-7 w-7 text-slate-500" />
      </div>
      <p className="text-sm font-semibold text-slate-700">{label}</p>
      <p className="mt-2 text-xs text-slate-500 max-w-xs leading-relaxed">
        Form {child.subLabel} has been sent to{' '}
        <span className="font-medium">{child.contractHolderName || child.contractHolderEmail || 'the contract holder'}</span>{' '}
        and is awaiting their action.
      </p>
      <div className="mt-4 inline-flex items-center gap-1.5 text-xs text-slate-400 border border-slate-200 rounded-full px-3 py-1 bg-white">
        <span className="w-1.5 h-1.5 rounded-full bg-blue-400 animate-pulse" />
        {child.statusLabel}
      </div>
    </div>
  );
}

// ── Recipient editor ──────────────────────────────────────────────────────────
interface Recipient { name: string; address: string; }

function RecipientTag({ r, onRemove }: { r: Recipient; onRemove: () => void }) {
  return (
    <span className="inline-flex items-center gap-1 bg-slate-50 border border-slate-200 rounded px-1.5 py-0.5 text-[11px] text-slate-700">
      {r.name ? `${r.name} <${r.address}>` : r.address}
      <button onClick={onRemove} className="text-slate-400 hover:text-red-500 transition-colors">
        <X size={10} />
      </button>
    </span>
  );
}

function RecipientField({ label, recipients, onChange }: {
  label: string;
  recipients: Recipient[];
  onChange: (r: Recipient[]) => void;
}) {
  const [adding, setAdding] = useState(false);
  const [name, setName]     = useState('');
  const [email, setEmail]   = useState('');

  const commit = () => {
    const trimmed = email.trim();
    if (!trimmed || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmed)) return;
    onChange([...recipients, { name: name.trim(), address: trimmed }]);
    setName(''); setEmail(''); setAdding(false);
  };

  return (
    <div className="mb-3">
      <p className="text-[11px] font-semibold text-slate-400 uppercase tracking-[0.3px] mb-1">{label}</p>
      <div className="flex flex-wrap gap-1 mb-1">
        {recipients.map((r, i) => (
          <RecipientTag key={i} r={r} onRemove={() => onChange(recipients.filter((_, j) => j !== i))} />
        ))}
      </div>
      {adding ? (
        <div className="flex gap-1 flex-wrap">
          <input
            placeholder="Name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="border border-slate-200 rounded px-2 py-1 text-[12px] w-24 outline-none focus:border-ce-navy"
          />
          <input
            placeholder="email@example.com"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && commit()}
            className="border border-slate-200 rounded px-2 py-1 text-[12px] flex-1 min-w-[140px] outline-none focus:border-ce-navy"
          />
          <button onClick={commit} className="px-2 py-1 bg-ce-navy text-white text-[11px] rounded hover:bg-ce-navy2 transition-colors">
            Add
          </button>
          <button
            onClick={() => { setAdding(false); setName(''); setEmail(''); }}
            className="px-2 py-1 border border-slate-200 text-slate-500 text-[11px] rounded hover:bg-slate-50 transition-colors"
          >
            Cancel
          </button>
        </div>
      ) : (
        <button
          onClick={() => setAdding(true)}
          className="flex items-center gap-1 text-[11px] text-slate-400 hover:text-ce-navy transition-colors"
        >
          <Plus size={10} /> Add
        </button>
      )}
    </div>
  );
}

// ── Send dialog ───────────────────────────────────────────────────────────────
function SendDialog({ title, workflowId, onClose, onSend }: {
  title: string;
  workflowId: string;
  onClose: () => void;
  onSend: (to: Recipient[], cc: Recipient[], body: string) => Promise<void>;
}) {
  const [to, setTo]           = useState<Recipient[]>([]);
  const [cc, setCc]           = useState<Recipient[]>([]);
  const [body, setBody]       = useState('');
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);

  useEffect(() => {
    let cancelled = false;
    approvalApi.getRecipients(workflowId)
      .then((d) => {
        if (cancelled) return;
        setTo(d.toRecipients);
        setCc(d.ccRecipients);
        setBody(d.defaultBody || '');
      })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [workflowId]);

  const handleSend = async () => {
    setSending(true);
    try { await onSend(to, cc, body); } finally { setSending(false); }
  };

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-lg" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-200">
          <span className="text-[14px] font-semibold text-slate-800">{title}</span>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600 transition-colors">
            <X size={16} />
          </button>
        </div>
        <div className="px-5 py-4">
          {loading ? (
            <div className="flex items-center justify-center h-20 text-[12px] text-slate-400">Loading recipients…</div>
          ) : (
            <>
              <RecipientField label="To" recipients={to} onChange={setTo} />
              <RecipientField label="CC" recipients={cc} onChange={setCc} />
              <div>
                <p className="text-[11px] font-semibold text-slate-400 uppercase tracking-[0.3px] mb-1">Message</p>
                <textarea
                  rows={3}
                  value={body}
                  onChange={(e) => setBody(e.target.value)}
                  className="w-full border border-slate-200 rounded-lg px-3 py-2 text-[12px] text-slate-700 outline-none resize-none focus:border-ce-navy"
                />
              </div>
            </>
          )}
        </div>
        <div className="px-5 pb-4 flex gap-2">
          <button
            onClick={handleSend}
            disabled={sending || loading || to.length === 0}
            className="flex-1 flex items-center justify-center gap-2 bg-ce-navy text-white rounded-lg py-2.5 text-[13px] font-medium hover:bg-ce-navy2 transition-colors disabled:opacity-50"
          >
            <Send size={13} /> {sending ? 'Sending…' : 'Send'}
          </button>
          <button
            onClick={onClose}
            className="px-4 border border-slate-200 rounded-lg py-2 text-[13px] text-slate-500 hover:bg-slate-50 transition-colors"
          >
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Complete dialog ───────────────────────────────────────────────────────────
function CompleteDialog({ children, onClose, onConfirm, confirming }: {
  children: Workflow[];
  onClose: () => void;
  onConfirm: () => void;
  confirming: boolean;
}) {
  const outstanding = children.filter((c) => !['sent', 'closed'].includes(c.status));
  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-md" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-200">
          <span className="text-[14px] font-semibold text-slate-800">Mark parent as complete?</span>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600"><X size={16} /></button>
        </div>
        <div className="px-5 py-4">
          {outstanding.length > 0 && (
            <>
              <p className="text-[13px] text-slate-600 mb-3">These forms are still outstanding and will not be sent:</p>
              <ul className="space-y-1.5 mb-4">
                {outstanding.map((c) => (
                  <li key={c.id} className="flex items-center gap-2 text-[12.5px]">
                    <AlertTriangle size={13} className="text-amber-500 flex-shrink-0" />
                    <span className="font-semibold text-slate-700">Form {c.subLabel ?? c.id}</span>
                    <span className="text-slate-400">— {c.statusLabel}</span>
                  </li>
                ))}
              </ul>
            </>
          )}
          <p className="text-[12.5px] text-slate-500 leading-relaxed">
            {outstanding.length > 0
              ? 'You can still send outstanding forms individually after completing the parent.'
              : 'All forms have been sent. The parent workflow will be closed.'}
          </p>
        </div>
        <div className="px-5 pb-4 flex gap-2">
          <button
            onClick={onConfirm}
            disabled={confirming}
            className="flex-1 bg-amber-500 text-white rounded-lg py-2.5 text-[13px] font-medium hover:bg-amber-600 transition-colors disabled:opacity-50"
          >
            {confirming ? 'Completing…' : 'Yes, mark complete'}
          </button>
          <button
            onClick={onClose}
            className="px-4 border border-slate-200 rounded-lg py-2 text-[13px] text-slate-500 hover:bg-slate-50 transition-colors"
          >
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Child status badge ────────────────────────────────────────────────────────
function ChildStatusBadge({ status, label }: { status: string; label: string }) {
  const cfg: Record<string, string> = {
    pending_approval: 'bg-blue-50 text-blue-700 border-blue-200',
    queried:          'bg-amber-50 text-amber-700 border-amber-200',
    returned:         'bg-rose-50 text-rose-700 border-rose-200',
    approved:         'bg-emerald-50 text-emerald-700 border-emerald-200',
    sent:             'bg-slate-100 text-slate-500 border-slate-200',
    closed:           'bg-slate-100 text-slate-400 border-slate-200',
  };
  const cls = cfg[status] ?? 'bg-slate-100 text-slate-500 border-slate-200';
  return (
    <span className={`inline-flex items-center px-1.5 py-0.5 rounded text-[10.5px] font-medium border ${cls}`}>
      {label}
    </span>
  );
}

// ── Child item ────────────────────────────────────────────────────────────────
function ChildItem({ child, isSelected, onSelect, onSend, canEdit }: {
  child: Workflow;
  isSelected: boolean;
  onSelect: () => void;
  onSend: () => void;
  canEdit: boolean;
}) {
  const isSigned   = ['approved', 'sent', 'closed'].includes(child.status);
  const alreadySent = ['sent', 'closed'].includes(child.status);
  const canSend    = canEdit && child.status === 'approved' && child.hasDocument;

  return (
    <div
      onClick={onSelect}
      className={cn(
        'rounded-lg border p-3 cursor-pointer transition-all',
        isSelected
          ? 'border-ce-navy bg-[#f0f5ff] ring-1 ring-ce-navy/20'
          : 'border-slate-200 bg-white hover:border-slate-300 hover:bg-slate-50',
      )}
    >
      <div className="flex items-start gap-2.5">
        {isSigned
          ? <CheckCircle size={14} className={cn('flex-shrink-0 mt-0.5', alreadySent ? 'text-slate-400' : 'text-emerald-600')} />
          : <Clock size={14} className="flex-shrink-0 mt-0.5 text-slate-400" />
        }
        <div className="flex-1 min-w-0">
          <div className="flex items-center justify-between gap-1.5 flex-wrap mb-1">
            <div className="flex items-center gap-1.5 min-w-0">
              <span className="font-semibold text-[13px] text-slate-800">Form {child.subLabel}</span>
              <ChildStatusBadge status={child.status} label={child.statusLabel} />
            </div>
            {canSend && (
              <button
                onClick={(e) => { e.stopPropagation(); onSend(); }}
                className="flex items-center gap-1 px-2 py-1 bg-ce-navy text-white rounded-md text-[11px] font-medium hover:bg-ce-navy2 transition-colors flex-shrink-0"
              >
                <Send size={10} /> Send
              </button>
            )}
            {alreadySent && (
              <span className="text-[11px] text-slate-400 flex-shrink-0">Sent ✓</span>
            )}
          </div>

          {child.contractHolderName && (
            <div className="text-[11.5px] text-slate-500 flex items-center gap-1 mb-0.5">
              <User size={10} className="flex-shrink-0" />
              {child.contractHolderName}
            </div>
          )}
          {child.invoiceNumber && (
            <div className="text-[11px] text-slate-400">Inv: {child.invoiceNumber}</div>
          )}

          <p className={cn('text-[11px] mt-1', isSigned && !alreadySent ? 'text-emerald-600' : 'text-slate-400')}>
            {isSigned && !alreadySent
              ? 'Signed — click to view document'
              : alreadySent
              ? 'Sent to vendor'
              : `Awaiting ${child.contractHolderName || 'contract holder'}…`}
          </p>
        </div>
      </div>
    </div>
  );
}

// ── Stats row ─────────────────────────────────────────────────────────────────
function StatChip({ label, value, variant }: { label: string; value: number; variant?: 'green' | 'blue' | 'amber' }) {
  const cls = variant === 'green' ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
    : variant === 'blue'  ? 'bg-blue-50 text-blue-700 border-blue-200'
    : variant === 'amber' ? 'bg-amber-50 text-amber-700 border-amber-200'
    : 'bg-slate-50 text-slate-600 border-slate-200';
  return (
    <div className={`flex flex-col items-center px-3 py-2.5 rounded-lg border ${cls}`}>
      <span className="text-[20px] font-bold leading-none">{value}</span>
      <span className="text-[10.5px] mt-0.5 font-medium">{label}</span>
    </div>
  );
}

// ── Main export ───────────────────────────────────────────────────────────────
export interface ParentApprovalViewProps {
  workflowId: string;
  children: Workflow[];
  events: ApprovalEvent[];
  canEdit: boolean; // true for admin/editor, false for CH view
  onRefetch: () => void;
}

export function ParentApprovalView({ workflowId, children, events, canEdit, onRefetch }: ParentApprovalViewProps) {
  const qc = useQueryClient();
  const { success: toastSuccess, error: toastError } = useToast();

  const [selectedId, setSelectedId]     = useState<string | null>(null);
  const [sendChildId, setSendChildId]   = useState<string | null>(null);
  const [sendAllOpen, setSendAllOpen]   = useState(false);
  const [completeOpen, setCompleteOpen] = useState(false);
  const [completing, setCompleting]     = useState(false);

  const selectedChild  = children.find((c) => c.id === selectedId) ?? null;
  const approvedWithDoc = children.filter((c) => c.status === 'approved' && c.hasDocument);
  const signedCount    = children.filter((c) => ['approved', 'sent', 'closed'].includes(c.status)).length;
  const pendingCount   = children.filter((c) => ['pending_approval', 'queried', 'returned'].includes(c.status)).length;

  // PDF url: only show for signed children
  const pdfUrl = selectedChild?.hasDocument ? documentsApi.sesDocUrl(selectedChild.id) : null;

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ['approval', workflowId] });
    qc.invalidateQueries({ queryKey: ['workflow-children', workflowId] });
    qc.invalidateQueries({ queryKey: ['workflows'] });
    onRefetch();
  };

  const handleSendChild = async (to: Recipient[], cc: Recipient[], body: string) => {
    if (!sendChildId) return;
    try {
      await approvalApi.sendChild(workflowId, sendChildId, { toRecipients: to, ccRecipients: cc, body });
      const child = children.find((c) => c.id === sendChildId);
      toastSuccess(`Form ${child?.subLabel ?? sendChildId} sent to vendor.`);
      setSendChildId(null);
      invalidate();
    } catch (err) {
      toastError(err instanceof Error ? err.message : 'Send failed');
    }
  };

  const handleSendAll = async (to: Recipient[], cc: Recipient[], body: string) => {
    try {
      const res = await approvalApi.sendAllApproved(workflowId, { toRecipients: to, ccRecipients: cc, body });
      toastSuccess(`Sent ${res.sent} signed form${res.sent !== 1 ? 's' : ''} to vendor.`);
      setSendAllOpen(false);
      invalidate();
    } catch (err) {
      toastError(err instanceof Error ? err.message : 'Send all failed');
    }
  };

  const handleComplete = async () => {
    setCompleting(true);
    try {
      await approvalApi.complete(workflowId);
      toastSuccess('Parent workflow marked as complete.');
      setCompleteOpen(false);
      invalidate();
    } catch (err) {
      toastError(err instanceof Error ? err.message : 'Complete failed');
    } finally {
      setCompleting(false);
    }
  };

  return (
    <>
      {/* ── Left panel ─────────────────────────────────────────────────── */}
      <div className="flex w-[300px] flex-shrink-0 flex-col border-r border-slate-200 bg-white overflow-y-auto">

        {/* Summary stats */}
        <div className="border-b border-slate-100 px-5 py-4">
          <p className="mb-3 text-xs font-semibold uppercase tracking-wide text-slate-400">Branch overview</p>
          <div className="grid grid-cols-3 gap-2">
            <StatChip label="Total"   value={children.length} />
            <StatChip label="Signed"  value={signedCount}  variant="green" />
            <StatChip label="Pending" value={pendingCount} variant="blue" />
          </div>
        </div>

        {/* Sub-workflow list */}
        <div className="border-b border-slate-100 px-5 py-4">
          <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-400">Sub-workflows</p>
          <div className="space-y-2">
            {children.map((child) => (
              <ChildItem
                key={child.id}
                child={child}
                isSelected={selectedId === child.id}
                onSelect={() => setSelectedId((prev) => prev === child.id ? null : child.id)}
                onSend={() => setSendChildId(child.id)}
                canEdit={canEdit}
              />
            ))}
          </div>
        </div>

        {/* Batch actions — editor only */}
        {canEdit && approvedWithDoc.length > 0 && (
          <div className="border-b border-slate-100 px-5 py-4 space-y-2">
            <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-slate-400">Send to vendor</p>
            {approvedWithDoc.length === 1 ? (
              <button
                onClick={() => setSendChildId(approvedWithDoc[0].id)}
                className="w-full flex items-center justify-center gap-2 bg-ce-navy text-white rounded-lg py-2.5 text-[13px] font-medium hover:bg-ce-navy2 transition-colors"
              >
                <Send size={13} /> Send Form {approvedWithDoc[0].subLabel} to vendor
              </button>
            ) : (
              <button
                onClick={() => setSendAllOpen(true)}
                className="w-full flex items-center justify-center gap-2 bg-ce-navy text-white rounded-lg py-2.5 text-[13px] font-medium hover:bg-ce-navy2 transition-colors"
              >
                <Send size={13} /> Send {approvedWithDoc.length} signed forms to vendor
              </button>
            )}
          </div>
        )}

        {/* Mark complete — editor only */}
        {canEdit && (
          <div className="border-b border-slate-100 px-5 py-3">
            <button
              onClick={() => setCompleteOpen(true)}
              className="w-full flex items-center justify-center gap-2 border border-amber-300 bg-amber-50 text-amber-800 rounded-lg py-2 text-[12.5px] font-medium hover:bg-amber-100 transition-colors"
            >
              Mark parent complete
            </button>
          </div>
        )}

        {/* Audit trail */}
        <div className="flex-1 px-5 py-4">
          <p className="mb-3 text-xs font-semibold uppercase tracking-wide text-slate-400">Activity</p>
          <AuditTrail events={events} />
        </div>
      </div>

      {/* ── Right panel — PDF or placeholder ───────────────────────────── */}
      <div className="flex flex-1 flex-col overflow-hidden">
        {selectedChild && pdfUrl ? (
          <PdfFrame
            url={pdfUrl}
            label={`Form ${selectedChild.subLabel} — Signed document`}
          />
        ) : selectedChild ? (
          <PendingChildPlaceholder child={selectedChild} />
        ) : (
          <SelectChildPlaceholder count={children.length} />
        )}
      </div>

      {/* ── Dialogs ─────────────────────────────────────────────────────── */}
      {sendChildId && (
        <SendDialog
          title={`Send Form ${children.find((c) => c.id === sendChildId)?.subLabel ?? ''} to vendor`}
          workflowId={workflowId}
          onClose={() => setSendChildId(null)}
          onSend={handleSendChild}
        />
      )}
      {sendAllOpen && (
        <SendDialog
          title={`Send ${approvedWithDoc.length} signed forms to vendor`}
          workflowId={workflowId}
          onClose={() => setSendAllOpen(false)}
          onSend={handleSendAll}
        />
      )}
      {completeOpen && (
        <CompleteDialog
          children={children}
          onClose={() => setCompleteOpen(false)}
          onConfirm={handleComplete}
          confirming={completing}
        />
      )}
    </>
  );
}

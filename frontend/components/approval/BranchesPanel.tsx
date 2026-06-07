'use client';

import { useState, useEffect } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Send, CheckCircle, Clock, XCircle, FileCheck, AlertTriangle, X, Plus, Trash2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import { approvalApi, workflowsApi } from '@/lib/api';
import { useToast } from '@/components/ui/Toast';
import type { Workflow } from '@/types';

// ── Status badge ──────────────────────────────────────────────────────────────
function ChildStatusBadge({ status, label }: { status: string; label: string }) {
  const cfg: Record<string, string> = {
    pending_approval: 'bg-blue-100 text-blue-700 border-blue-200',
    queried:          'bg-amber-100 text-amber-700 border-amber-200',
    returned:         'bg-rose-100 text-rose-700 border-rose-200',
    approved:         'bg-emerald-100 text-emerald-700 border-emerald-200',
    sent:             'bg-slate-100 text-slate-600 border-slate-200',
    closed:           'bg-slate-100 text-slate-500 border-slate-200',
  };
  const cls = cfg[status] ?? 'bg-slate-100 text-slate-500 border-slate-200';
  return (
    <span className={`inline-flex items-center px-1.5 py-0.5 rounded text-[10.5px] font-medium border ${cls}`}>
      {label}
    </span>
  );
}

// ── Recipient editor (reusable in the send dialog) ────────────────────────────
interface Recipient { name: string; address: string; }

function RecipientTag({ r, onRemove }: { r: Recipient; onRemove: () => void }) {
  return (
    <span className="inline-flex items-center gap-1 bg-ce-bg border border-ce-border rounded-md px-1.5 py-0.5 text-[11px] text-ce-text">
      {r.name ? `${r.name} <${r.address}>` : r.address}
      <button type="button" onClick={onRemove} className="text-ce-hint hover:text-red-500 transition-colors">
        <X size={10} />
      </button>
    </span>
  );
}

interface RecipientFieldProps {
  label: string;
  recipients: Recipient[];
  onChange: (r: Recipient[]) => void;
}

function RecipientField({ label, recipients, onChange }: RecipientFieldProps) {
  const [adding, setAdding]   = useState(false);
  const [name, setName]       = useState('');
  const [email, setEmail]     = useState('');

  const commit = () => {
    const trimmed = email.trim();
    if (!trimmed || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmed)) return;
    onChange([...recipients, { name: name.trim(), address: trimmed }]);
    setName(''); setEmail(''); setAdding(false);
  };

  return (
    <div className="mb-3">
      <div className="text-[11px] font-semibold text-ce-muted uppercase tracking-[0.3px] mb-1">{label}</div>
      <div className="flex flex-wrap gap-1 mb-1">
        {recipients.map((r, i) => (
          <RecipientTag key={i} r={r} onRemove={() => onChange(recipients.filter((_, j) => j !== i))} />
        ))}
      </div>
      {adding ? (
        <div className="flex gap-1 items-center flex-wrap">
          <input
            placeholder="Name (optional)"
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="border border-ce-border rounded-md px-2 py-1 text-[12px] w-28 outline-none focus:border-ce-navy"
          />
          <input
            placeholder="email@example.com"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && commit()}
            className="border border-ce-border rounded-md px-2 py-1 text-[12px] flex-1 min-w-[160px] outline-none focus:border-ce-navy"
          />
          <button onClick={commit} className="px-2 py-1 bg-ce-navy text-white text-[11px] rounded-md hover:bg-ce-navy2 transition-colors">Add</button>
          <button onClick={() => { setAdding(false); setName(''); setEmail(''); }} className="px-2 py-1 border border-ce-border text-ce-muted text-[11px] rounded-md hover:bg-ce-bg transition-colors">Cancel</button>
        </div>
      ) : (
        <button
          onClick={() => setAdding(true)}
          className="flex items-center gap-1 text-[11px] text-ce-muted hover:text-ce-navy transition-colors"
        >
          <Plus size={11} /> Add recipient
        </button>
      )}
    </div>
  );
}

// ── Send dialog ───────────────────────────────────────────────────────────────
interface SendDialogProps {
  title: string;
  onClose: () => void;
  onSend: (to: Recipient[], cc: Recipient[], body: string) => Promise<void>;
  workflowId: string;
}

function SendDialog({ title, onClose, onSend, workflowId }: SendDialogProps) {
  const [to, setTo]         = useState<Recipient[]>([]);
  const [cc, setCc]         = useState<Recipient[]>([]);
  const [body, setBody]     = useState('');
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);

  useEffect(() => {
    approvalApi.getRecipients(workflowId)
      .then((data) => {
        setTo(data.toRecipients);
        setCc(data.ccRecipients);
        setBody(data.defaultBody || '');
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [workflowId]);

  const handleSend = async () => {
    setSending(true);
    try { await onSend(to, cc, body); } finally { setSending(false); }
  };

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-md" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between px-5 py-4 border-b border-ce-border">
          <span className="text-[14px] font-semibold text-ce-navy">{title}</span>
          <button onClick={onClose} className="text-ce-hint hover:text-ce-navy transition-colors"><X size={16} /></button>
        </div>
        <div className="px-5 py-4">
          {loading ? (
            <div className="flex items-center justify-center h-20 text-[12px] text-ce-muted">Loading recipients…</div>
          ) : (
            <>
              <RecipientField label="To" recipients={to} onChange={setTo} />
              <RecipientField label="CC" recipients={cc} onChange={setCc} />
              <div className="mb-2">
                <div className="text-[11px] font-semibold text-ce-muted uppercase tracking-[0.3px] mb-1">Email body</div>
                <textarea
                  rows={3}
                  value={body}
                  onChange={(e) => setBody(e.target.value)}
                  className="w-full border border-ce-border rounded-lg px-2.5 py-2 text-[12px] text-ce-text outline-none resize-none focus:border-ce-navy"
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
            className="px-4 border border-ce-border bg-white text-ce-muted rounded-lg py-2 text-[13px] hover:bg-ce-bg transition-colors"
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
        <div className="flex items-center justify-between px-5 py-4 border-b border-ce-border">
          <span className="text-[14px] font-semibold text-ce-navy">Mark parent as complete?</span>
          <button onClick={onClose} className="text-ce-hint hover:text-ce-navy transition-colors"><X size={16} /></button>
        </div>
        <div className="px-5 py-4">
          <p className="text-[13px] text-ce-text leading-relaxed mb-3">
            This will close the parent workflow. The following child workflows are still outstanding:
          </p>
          <ul className="space-y-1.5 mb-4">
            {outstanding.map((c) => (
              <li key={c.id} className="flex items-center gap-2 text-[12.5px]">
                <AlertTriangle size={13} className="text-amber-500 flex-shrink-0" />
                <span className="font-semibold text-ce-navy">{c.subLabel ?? c.id}</span>
                <span className="text-ce-muted">— {c.statusLabel}</span>
              </li>
            ))}
          </ul>
          <p className="text-[12px] text-ce-muted leading-relaxed">
            You can still process the outstanding children individually after completing the parent.
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
          <button onClick={onClose} className="px-4 border border-ce-border bg-white text-ce-muted rounded-lg py-2 text-[13px] hover:bg-ce-bg transition-colors">
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Child row ─────────────────────────────────────────────────────────────────
function ChildRow({ child, parentId, onAction }: { child: Workflow; parentId: string; onAction: () => void }) {
  const [sendOpen, setSendOpen] = useState(false);
  const { success: toastSuccess, error: toastError } = useToast();

  const canSend = child.status === 'approved' && child.hasDocument;
  const isSent  = ['sent', 'closed'].includes(child.status);

  const StatusIcon = isSent ? CheckCircle : child.status === 'approved' ? FileCheck : Clock;
  const iconColor  = isSent ? 'text-emerald-500' : child.status === 'approved' ? 'text-emerald-400' : 'text-ce-hint';

  const handleSend = async (to: Recipient[], cc: Recipient[], body: string) => {
    try {
      await approvalApi.sendChild(parentId, child.id, { toRecipients: to, ccRecipients: cc, body });
      toastSuccess(`Form ${child.subLabel ?? child.id} sent to vendor.`);
      setSendOpen(false);
      onAction();
    } catch (err) {
      toastError(err instanceof Error ? err.message : 'Send failed');
    }
  };

  return (
    <div className="flex items-center gap-3 p-3 bg-ce-bg border border-ce-border rounded-lg">
      <StatusIcon size={15} className={cn('flex-shrink-0', iconColor)} />
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-1.5 flex-wrap">
          <span className="text-[13px] font-semibold text-ce-navy">Form {child.subLabel ?? String.fromCharCode(65 + (child.subIndex ?? 0))}</span>
          <ChildStatusBadge status={child.status} label={child.statusLabel} />
        </div>
        {child.supplierName && (
          <div className="text-[11.5px] text-ce-muted truncate mt-0.5">{child.supplierName}</div>
        )}
        {!child.hasDocument && child.status === 'approved' && (
          <div className="text-[11px] text-amber-600 mt-0.5">No document generated yet</div>
        )}
      </div>
      {canSend && (
        <button
          onClick={() => setSendOpen(true)}
          className="flex items-center gap-1 px-2.5 py-1.5 bg-ce-navy text-white rounded-lg text-[11.5px] font-medium hover:bg-ce-navy2 transition-colors flex-shrink-0"
        >
          <Send size={11} /> Send
        </button>
      )}
      {sendOpen && (
        <SendDialog
          title={`Send Form ${child.subLabel ?? child.id} to vendor`}
          workflowId={parentId}
          onClose={() => setSendOpen(false)}
          onSend={handleSend}
        />
      )}
    </div>
  );
}

// ── Main BranchesPanel ────────────────────────────────────────────────────────
interface BranchesPanelProps {
  workflow: Workflow;
}

export function BranchesPanel({ workflow }: BranchesPanelProps) {
  const qc = useQueryClient();
  const { success: toastSuccess, error: toastError } = useToast();
  const [sendAllOpen, setSendAllOpen]     = useState(false);
  const [completeOpen, setCompleteOpen]   = useState(false);
  const [completing, setCompleting]       = useState(false);

  const { data, isLoading, refetch } = useQuery({
    queryKey: ['workflow-children', workflow.id],
    queryFn:  () => workflowsApi.getChildren(workflow.id),
    enabled:  !!workflow.id,
  });
  const children: Workflow[] = data?.children ?? [];

  const approvedWithDoc = children.filter((c) => c.status === 'approved' && c.hasDocument);
  const allDone         = children.length > 0 && children.every((c) => ['sent', 'closed'].includes(c.status));
  const parentClosed    = ['sent', 'closed'].includes(workflow.status);

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ['workflow-children', workflow.id] });
    qc.invalidateQueries({ queryKey: ['workflows'] });
    qc.invalidateQueries({ queryKey: ['approval', workflow.id] });
  };

  const handleSendAll = async (to: Recipient[], cc: Recipient[], body: string) => {
    try {
      const res = await approvalApi.sendAllApproved(workflow.id, { toRecipients: to, ccRecipients: cc, body });
      toastSuccess(`Sent ${res.sent} approved form${res.sent !== 1 ? 's' : ''} to vendor.`);
      setSendAllOpen(false);
      invalidate();
      refetch();
    } catch (err) {
      toastError(err instanceof Error ? err.message : 'Send all failed');
    }
  };

  const handleComplete = async () => {
    setCompleting(true);
    try {
      await approvalApi.complete(workflow.id);
      toastSuccess('Parent workflow marked as complete.');
      setCompleteOpen(false);
      invalidate();
    } catch (err) {
      toastError(err instanceof Error ? err.message : 'Complete failed');
    } finally {
      setCompleting(false);
    }
  };

  if (isLoading) {
    return <div className="flex items-center justify-center h-24 text-[12px] text-ce-muted">Loading branches…</div>;
  }

  if (children.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-12 text-ce-muted gap-2">
        <XCircle size={24} className="text-ce-hint" />
        <p className="text-[13px]">No child workflows found.</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-3 p-4">
      {/* Summary */}
      <div className="text-[12px] text-ce-muted">
        {children.length} sub-workflow{children.length !== 1 ? 's' : ''} · {approvedWithDoc.length} ready to send
      </div>

      {/* Child rows */}
      <div className="flex flex-col gap-2">
        {children.map((child) => (
          <ChildRow
            key={child.id}
            child={child}
            parentId={workflow.id}
            onAction={() => { invalidate(); refetch(); }}
          />
        ))}
      </div>

      {/* Batch actions */}
      {!parentClosed && (
        <div className="flex flex-col gap-2 pt-1 border-t border-ce-border">
          {approvedWithDoc.length > 1 && (
            <button
              onClick={() => setSendAllOpen(true)}
              className="flex items-center justify-center gap-2 bg-ce-navy text-white rounded-lg py-2.5 text-[13px] font-medium hover:bg-ce-navy2 transition-colors"
            >
              <Send size={13} /> Send all approved ({approvedWithDoc.length})
            </button>
          )}
          {!allDone && (
            <button
              onClick={() => setCompleteOpen(true)}
              className="flex items-center justify-center gap-2 border border-amber-300 bg-amber-50 text-amber-800 rounded-lg py-2 text-[12.5px] font-medium hover:bg-amber-100 transition-colors"
            >
              <CheckCircle size={13} /> Mark parent complete
            </button>
          )}
        </div>
      )}

      {sendAllOpen && (
        <SendDialog
          title={`Send ${approvedWithDoc.length} approved forms to vendor`}
          workflowId={workflow.id}
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
    </div>
  );
}

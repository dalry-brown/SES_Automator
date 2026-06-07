'use client';

import { useState, useEffect, useRef } from 'react';
import {
  CheckCircle, MessageCircle, AlertCircle, RotateCcw,
  UserCheck, Send, Clock, XCircle, X, Users,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { useToast } from '@/components/ui/Toast';
import { useApprovalMutations } from '@/lib/hooks/useApproval';
import { useAuth } from '@/components/providers/AuthProvider';
import { approvalApi } from '@/lib/api';
import { SignatureModal } from './SignatureModal';
import type { Workflow } from '@/types';

const SIGN_STEPS  = ['Processing signature…', 'Saving document…', 'Notifying team…', 'Almost done…'];
const SEND_STEPS  = ['Preparing document…', 'Sending email…', 'Updating status…', 'Almost done…'];
const STEP_DELAY  = 5_000; // rotate every 5 s

function useStepMessage(active: boolean, steps: string[]) {
  const [idx, setIdx] = useState(0);
  useEffect(() => {
    if (!active) { setIdx(0); return; }
    const t = setInterval(() => setIdx((i) => (i + 1) % steps.length), STEP_DELAY);
    return () => clearInterval(t);
  }, [active, steps.length]);
  return steps[idx];
}

type Recipient = { name: string; address: string };

interface SignaturePanelProps {
  workflow: Workflow;
  hasMergedDoc: boolean;
  canSign?: boolean;
  skippedReasons?: string[];
  onSigned?: () => void;
}

type ActionMode = 'idle' | 'comment' | 'query' | 'return' | 'reroute' | 'reply' | 'send';

function TextInput({
  label, placeholder, value, onChange, rows = 3,
}: {
  label: string; placeholder: string;
  value: string; onChange: (v: string) => void; rows?: number;
}) {
  return (
    <div className="space-y-1">
      <label className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">{label}</label>
      <textarea
        rows={rows}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="w-full rounded-xl border border-slate-200 px-3 py-2 text-[13px] outline-none resize-none focus:border-[#1b3a6b] focus:ring-2 focus:ring-[#1b3a6b]/10 transition-all"
      />
    </div>
  );
}

function FieldInput({
  label, placeholder, value, onChange, type = 'text',
}: {
  label: string; placeholder: string;
  value: string; onChange: (v: string) => void; type?: string;
}) {
  return (
    <div className="space-y-1">
      <label className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">{label}</label>
      <input
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="w-full rounded-xl border border-slate-200 px-3 py-2 text-[13px] outline-none focus:border-[#1b3a6b] focus:ring-2 focus:ring-[#1b3a6b]/10 transition-all"
      />
    </div>
  );
}

// ── Status banners shown when the workflow is in a terminal/locked state ───────
function StatusBanner({ status, workflow }: { status: string; workflow: Workflow }) {
  if (status === 'approved' || status === 'sent') {
    return (
      <div className="rounded-xl bg-emerald-50 border border-emerald-200 p-4 flex items-start gap-3">
        <CheckCircle className="h-5 w-5 flex-shrink-0 text-emerald-500 mt-0.5" />
        <div>
          <p className="text-[13px] font-semibold text-emerald-800">
            {status === 'sent' ? 'Approved & Sent' : 'Approved'}
          </p>
          <p className="text-[12px] text-emerald-600 mt-0.5">
            {status === 'sent'
              ? 'The signed document has been sent to the vendor.'
              : 'This workflow has been digitally approved.'}
          </p>
          {workflow.approvedAt && (
            <p className="text-[11px] text-emerald-500 mt-1">
              {new Date(workflow.approvedAt).toLocaleString('en-GB', {
                day: '2-digit', month: 'short', year: 'numeric',
                hour: '2-digit', minute: '2-digit',
              })}
            </p>
          )}
        </div>
      </div>
    );
  }

  if (status === 'returned') {
    return (
      <div className="rounded-xl bg-orange-50 border border-orange-200 p-4 flex items-start gap-3">
        <RotateCcw className="h-5 w-5 flex-shrink-0 text-orange-500 mt-0.5" />
        <div>
          <p className="text-[13px] font-semibold text-orange-800">Returned for Corrections</p>
          <p className="text-[12px] text-orange-600 mt-0.5">
            The contract holder has returned this document. The cost engineer will
            review the feedback and resubmit.
          </p>
        </div>
      </div>
    );
  }

  if (status === 'queried') {
    return (
      <div className="rounded-xl bg-amber-50 border border-amber-200 p-4 flex items-start gap-3">
        <MessageCircle className="h-5 w-5 flex-shrink-0 text-amber-500 mt-0.5" />
        <div>
          <p className="text-[13px] font-semibold text-amber-800">Query Raised</p>
          <p className="text-[12px] text-amber-600 mt-0.5">
            A query has been raised. You may add a follow-up, or still approve or return the document.
          </p>
        </div>
      </div>
    );
  }

  if (status === 'closed' || status === 'cancelled') {
    return (
      <div className="rounded-xl bg-slate-50 border border-slate-200 p-4 flex items-start gap-3">
        <XCircle className="h-5 w-5 flex-shrink-0 text-slate-400 mt-0.5" />
        <div>
          <p className="text-[13px] font-semibold text-slate-600">
            {status === 'closed' ? 'Workflow Closed' : 'Workflow Cancelled'}
          </p>
          <p className="text-[12px] text-slate-400 mt-0.5">No further action is required.</p>
        </div>
      </div>
    );
  }

  return null;
}

// ── Main component ─────────────────────────────────────────────────────────────
export function SignaturePanel({
  workflow,
  hasMergedDoc,
  canSign = true,
  skippedReasons = [],
  onSigned,
}: SignaturePanelProps) {
  const { user } = useAuth();
  const { success, error } = useToast();
  const { sign, comment, query, returnDoc, reroute, reply, sendToVendor } = useApprovalMutations(workflow.id);

  const [actionMode, setActionMode] = useState<ActionMode>('idle');
  const [text, setText]             = useState('');
  const [rerouteEmail, setRerouteEmail] = useState('');
  const [rerouteName, setRerouteName]   = useState('');
  const [sigModalOpen, setSigModalOpen] = useState(false);
  const [recovering, setRecovering]     = useState(false);

  // Recipient editing state (populated when send panel opens)
  const [toRecipients, setToRecipients]     = useState<Recipient[]>([]);
  const [ccRecipients, setCcRecipients]     = useState<Recipient[]>([]);
  const [originalTo, setOriginalTo]         = useState<Recipient[]>([]);
  const [originalCc, setOriginalCc]         = useState<Recipient[]>([]);
  const [recipientsLoading, setRecipientsLoading] = useState(false);
  const [emailBody, setEmailBody]           = useState('');

  // Add-recipient inline form state
  const [addingTo, setAddingTo]   = useState(false);
  const [newToName, setNewToName] = useState('');
  const [newToEmail, setNewToEmail] = useState('');
  const [addingCc, setAddingCc]   = useState(false);
  const [newCcName, setNewCcName] = useState('');
  const [newCcEmail, setNewCcEmail] = useState('');

  const signStep = useStepMessage(sign.isPending, SIGN_STEPS);
  const sendStep = useStepMessage(sendToVendor.isPending, SEND_STEPS);

  // After a timeout error, poll the workflow status for up to 2 min to detect
  // whether the backend actually completed the operation.
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const stopPolling = () => { if (pollRef.current) { clearInterval(pollRef.current); pollRef.current = null; } };

  const startRecoveryPoll = (expectedStatus: string, onRecovered: () => void) => {
    setRecovering(true);
    let attempts = 0;
    pollRef.current = setInterval(async () => {
      attempts++;
      try {
        const data = await approvalApi.pageData(workflow.id);
        if (data.workflow.status === expectedStatus) {
          stopPolling();
          setRecovering(false);
          onRecovered();
        }
      } catch { /* ignore poll errors */ }
      if (attempts >= 24) { // 2 min at 5 s intervals
        stopPolling();
        setRecovering(false);
      }
    }, 5_000);
  };

  useEffect(() => () => stopPolling(), []);

  const status    = workflow.status;
  const isActionable = ['pending_approval', 'queried'].includes(status);

  const isEditor = user?.role === 'editor' || user?.role === 'admin';
  // isAssignedCH: the only person who can sign (exact email match, no admin override)
  const isAssignedCH = user?.role === 'user' && workflow.contractHolderEmail === user.email;
  // isAdmin: can Return and Re-route but not sign
  const isAdminUser = user?.role === 'admin';
  // canAct: controls Return/Reroute visibility (CH or admin, but NOT editor-only role)
  const canAct = isActionable && hasMergedDoc && (isAssignedCH || isAdminUser);

  const reset = () => {
    setActionMode('idle');
    setText('');
    setToRecipients([]);
    setCcRecipients([]);
    setOriginalTo([]);
    setOriginalCc([]);
    setEmailBody('');
    setRecipientsLoading(false);
    setAddingTo(false); setNewToName(''); setNewToEmail('');
    setAddingCc(false); setNewCcName(''); setNewCcEmail('');
  };

  // Fetch thread recipients when the send panel opens
  useEffect(() => {
    if (actionMode !== 'send') return;
    let cancelled = false;
    setRecipientsLoading(true);
    approvalApi.getRecipients(workflow.id)
      .then((data) => {
        if (cancelled) return;
        setToRecipients(data.toRecipients);
        setCcRecipients(data.ccRecipients);
        setOriginalTo(data.toRecipients);
        setOriginalCc(data.ccRecipients);
        setEmailBody(data.defaultBody || '');
      })
      .catch(() => {})
      .finally(() => { if (!cancelled) setRecipientsLoading(false); });
    return () => { cancelled = true; };
  }, [actionMode, workflow.id]);

  // ── Handlers ─────────────────────────────────────────────────────────────────
  const handleSign = async (dataUrl: string) => {
    try {
      for (const reason of skippedReasons) {
        await comment.mutateAsync(reason);
      }
      await sign.mutateAsync(dataUrl);
      success('Workflow approved and vendor notified.');
      setSigModalOpen(false);
      onSigned?.();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Signing failed';
      if (msg.includes('timed out')) {
        error('Signing is taking longer than expected — checking if it completed…');
        setSigModalOpen(false);
        startRecoveryPoll('approved', () => {
          success('Workflow was approved successfully.');
          onSigned?.();
        });
      } else {
        error(msg);
      }
    }
  };

  const handleComment = async () => {
    if (!text.trim()) return;
    try {
      await comment.mutateAsync(text.trim());
      success('Comment added.');
      reset();
    } catch (err: unknown) {
      error(err instanceof Error ? err.message : 'Failed to add comment');
    }
  };

  const handleQuery = async () => {
    if (!text.trim()) return;
    try {
      await query.mutateAsync(text.trim());
      success('Query raised. The cost engineer has been notified.');
      reset();
    } catch (err: unknown) {
      error(err instanceof Error ? err.message : 'Failed to raise query');
    }
  };

  const handleReturn = async () => {
    if (!text.trim()) return;
    try {
      await returnDoc.mutateAsync(text.trim());
      success('Document returned. The cost engineer has been notified.');
      reset();
    } catch (err: unknown) {
      error(err instanceof Error ? err.message : 'Failed to return document');
    }
  };

  const handleReroute = async () => {
    if (!rerouteEmail.trim() || !rerouteName.trim()) return;
    try {
      await reroute.mutateAsync({ email: rerouteEmail.trim(), name: rerouteName.trim() });
      success(`Re-routed to ${rerouteName}. They have been notified by email.`);
      reset();
      setRerouteEmail('');
      setRerouteName('');
    } catch (err: unknown) {
      error(err instanceof Error ? err.message : 'Failed to re-route');
    }
  };

  const handleReply = async () => {
    if (!text.trim()) return;
    try {
      await reply.mutateAsync(text.trim());
      success('Reply sent.');
      reset();
    } catch (err: unknown) {
      error(err instanceof Error ? err.message : 'Failed to send reply');
    }
  };

  const handleSendToVendor = async () => {
    try {
      await sendToVendor.mutateAsync({ toRecipients, ccRecipients, body: emailBody });
      success('Document sent to vendor.');
      reset();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed to send document';
      if (msg.includes('timed out')) {
        error('Send is taking longer than expected — checking if it completed…');
        reset();
        startRecoveryPoll('sent', () => {
          success('Document was sent to the vendor successfully.');
        });
      } else {
        error(msg);
      }
    }
  };

  // ── Recovery banner ───────────────────────────────────────────────────────────
  if (recovering) {
    return (
      <div className="rounded-xl bg-blue-50 border border-blue-200 p-4 flex items-start gap-3">
        <div className="h-4 w-4 rounded-full border-2 border-blue-400 border-t-transparent animate-spin flex-shrink-0 mt-0.5" />
        <div>
          <p className="text-[13px] font-semibold text-blue-800">Checking status…</p>
          <p className="text-[12px] text-blue-600 mt-0.5">
            The operation is still completing on the server. This page will update automatically.
          </p>
        </div>
      </div>
    );
  }

  // ── Terminal / non-actionable statuses ────────────────────────────────────────
  const terminalStatuses = ['approved', 'sent', 'returned', 'queried', 'closed', 'cancelled'];
  if (terminalStatuses.includes(status) && actionMode === 'idle') {
    const banner = <StatusBanner status={status} workflow={workflow} />;

    // Approved — CE must manually review then send to vendor
    if (status === 'approved') {
      return (
        <div className="space-y-3">
          {banner}
          {isEditor && (
            <ActionButton
              icon={<Send size={14} />}
              label="Send to vendor"
              variant="navy"
              onClick={() => setActionMode('send')}
            />
          )}
        </div>
      );
    }

    // Queried — assigned CH can sign/return/reroute; admin can return/reroute only; CE can reply
    if (status === 'queried') {
      return (
        <div className="space-y-3">
          {banner}
          {isAssignedCH && hasMergedDoc && (
            <div className="flex flex-col gap-2 pt-1">
              <ActionButton icon={<CheckCircle size={14} />} label="Approve & Sign" variant="success" onClick={() => setSigModalOpen(true)} disabled={!canSign} disabledTitle="Review all documents and make decisions before signing" />
              <ActionButton icon={<RotateCcw size={14} />} label="Return for Corrections" variant="warn" onClick={() => setActionMode('return')} />
              <ActionButton icon={<UserCheck size={14} />} label="Re-route signing" variant="ghost" onClick={() => setActionMode('reroute')} />
              <ActionButton icon={<MessageCircle size={14} />} label="Add comment" variant="ghost" onClick={() => setActionMode('comment')} />
            </div>
          )}
          {isAdminUser && hasMergedDoc && (
            <div className="flex flex-col gap-2 pt-1">
              <ActionButton icon={<RotateCcw size={14} />} label="Return for Corrections" variant="warn" onClick={() => setActionMode('return')} />
              <ActionButton icon={<UserCheck size={14} />} label="Re-route signing" variant="ghost" onClick={() => setActionMode('reroute')} />
            </div>
          )}
          {isEditor && isActionable && (
            <ActionButton icon={<Send size={14} />} label="Reply to query" variant="secondary" onClick={() => setActionMode('reply')} />
          )}
          {renderInlineForm()}
          {renderSigModal()}
        </div>
      );
    }

    // All other terminal statuses — banner only
    return <div className="space-y-3">{banner}</div>;
  }

  // ── Send panel — recipient editing + body + confirmation ─────────────────────
  if (actionMode === 'send') {
    const recipientsDirty =
      toRecipients.length !== originalTo.length ||
      ccRecipients.length !== originalCc.length ||
      toRecipients.some((r, i) => r.address !== originalTo[i]?.address) ||
      ccRecipients.some((r, i) => r.address !== originalCc[i]?.address);

    const addToRecipient = () => {
      const email = newToEmail.trim();
      if (!email) return;
      if (!toRecipients.some((r) => r.address === email)) {
        setToRecipients((p) => [...p, { name: newToName.trim(), address: email }]);
      }
      setNewToName(''); setNewToEmail(''); setAddingTo(false);
    };

    const addCcRecipient = () => {
      const email = newCcEmail.trim();
      if (!email) return;
      if (!ccRecipients.some((r) => r.address === email)) {
        setCcRecipients((p) => [...p, { name: newCcName.trim(), address: email }]);
      }
      setNewCcName(''); setNewCcEmail(''); setAddingCc(false);
    };

    return (
      <div className="space-y-3">
        <StatusBanner status={status} workflow={workflow} />

        <div className="rounded-xl border border-slate-200 bg-white overflow-hidden">
          {/* Header */}
          <div className="px-4 py-3 border-b border-slate-100 flex items-center gap-2">
            <Users size={14} className="text-[#1b3a6b] flex-shrink-0" />
            <p className="text-[13px] font-semibold text-slate-800">Compose email</p>
          </div>

          <div className="px-4 py-3 space-y-4">
            {recipientsLoading ? (
              <div className="flex items-center justify-center py-6">
                <div className="h-5 w-5 rounded-full border-2 border-[#1b3a6b] border-t-transparent animate-spin" />
              </div>
            ) : (
              <>
                {/* ── To ─────────────────────────────────────────────── */}
                <div className="space-y-1.5">
                  <div className="flex items-center justify-between">
                    <p className="text-[10.5px] font-bold uppercase tracking-widest text-slate-400">To</p>
                    {!addingTo && (
                      <button
                        onClick={() => setAddingTo(true)}
                        className="text-[11px] text-[#1b3a6b] hover:underline font-medium"
                      >
                        + Add
                      </button>
                    )}
                  </div>
                  <div className="flex flex-wrap gap-1.5 min-h-[32px]">
                    {toRecipients.length === 0 && !addingTo && (
                      <span className="text-[12px] text-rose-500 italic">No recipients — add at least one</span>
                    )}
                    {toRecipients.map((r) => (
                      <RecipientChip
                        key={r.address}
                        name={r.name}
                        address={r.address}
                        onRemove={() => setToRecipients((p) => p.filter((x) => x.address !== r.address))}
                      />
                    ))}
                  </div>
                  {addingTo && (
                    <div className="flex gap-1.5 mt-1">
                      <input
                        autoFocus
                        placeholder="Name (optional)"
                        value={newToName}
                        onChange={(e) => setNewToName(e.target.value)}
                        className="flex-1 min-w-0 rounded-lg border border-slate-200 px-2 py-1.5 text-[12px] outline-none focus:border-[#1b3a6b] transition-colors"
                      />
                      <input
                        placeholder="Email address"
                        type="email"
                        value={newToEmail}
                        onChange={(e) => setNewToEmail(e.target.value)}
                        onKeyDown={(e) => { if (e.key === 'Enter') addToRecipient(); if (e.key === 'Escape') { setAddingTo(false); setNewToName(''); setNewToEmail(''); } }}
                        className="flex-[1.4] min-w-0 rounded-lg border border-slate-200 px-2 py-1.5 text-[12px] outline-none focus:border-[#1b3a6b] transition-colors"
                      />
                      <button onClick={addToRecipient} disabled={!newToEmail.trim()} className="px-2.5 py-1.5 bg-[#1b3a6b] text-white rounded-lg text-[12px] font-medium disabled:opacity-40 hover:bg-[#162d56] transition-colors flex-shrink-0">Add</button>
                      <button onClick={() => { setAddingTo(false); setNewToName(''); setNewToEmail(''); }} className="px-2 py-1.5 rounded-lg border border-slate-200 text-slate-400 hover:bg-slate-50 transition-colors flex-shrink-0"><X size={12} /></button>
                    </div>
                  )}
                </div>

                {/* ── CC ─────────────────────────────────────────────── */}
                <div className="space-y-1.5">
                  <div className="flex items-center justify-between">
                    <p className="text-[10.5px] font-bold uppercase tracking-widest text-slate-400">CC</p>
                    {!addingCc && (
                      <button
                        onClick={() => setAddingCc(true)}
                        className="text-[11px] text-[#1b3a6b] hover:underline font-medium"
                      >
                        + Add
                      </button>
                    )}
                  </div>
                  <div className="flex flex-wrap gap-1.5 min-h-[24px]">
                    {ccRecipients.length === 0 && !addingCc && (
                      <span className="text-[12px] text-slate-400 italic">No CC recipients</span>
                    )}
                    {ccRecipients.map((r) => (
                      <RecipientChip
                        key={r.address}
                        name={r.name}
                        address={r.address}
                        onRemove={() => setCcRecipients((p) => p.filter((x) => x.address !== r.address))}
                      />
                    ))}
                  </div>
                  {addingCc && (
                    <div className="flex gap-1.5 mt-1">
                      <input
                        autoFocus
                        placeholder="Name (optional)"
                        value={newCcName}
                        onChange={(e) => setNewCcName(e.target.value)}
                        className="flex-1 min-w-0 rounded-lg border border-slate-200 px-2 py-1.5 text-[12px] outline-none focus:border-[#1b3a6b] transition-colors"
                      />
                      <input
                        placeholder="Email address"
                        type="email"
                        value={newCcEmail}
                        onChange={(e) => setNewCcEmail(e.target.value)}
                        onKeyDown={(e) => { if (e.key === 'Enter') addCcRecipient(); if (e.key === 'Escape') { setAddingCc(false); setNewCcName(''); setNewCcEmail(''); } }}
                        className="flex-[1.4] min-w-0 rounded-lg border border-slate-200 px-2 py-1.5 text-[12px] outline-none focus:border-[#1b3a6b] transition-colors"
                      />
                      <button onClick={addCcRecipient} disabled={!newCcEmail.trim()} className="px-2.5 py-1.5 bg-[#1b3a6b] text-white rounded-lg text-[12px] font-medium disabled:opacity-40 hover:bg-[#162d56] transition-colors flex-shrink-0">Add</button>
                      <button onClick={() => { setAddingCc(false); setNewCcName(''); setNewCcEmail(''); }} className="px-2 py-1.5 rounded-lg border border-slate-200 text-slate-400 hover:bg-slate-50 transition-colors flex-shrink-0"><X size={12} /></button>
                    </div>
                  )}
                </div>

                {/* ── Message body ────────────────────────────────────── */}
                <div className="space-y-1.5">
                  <p className="text-[10.5px] font-bold uppercase tracking-widest text-slate-400">Message</p>
                  <textarea
                    rows={7}
                    value={emailBody}
                    onChange={(e) => setEmailBody(e.target.value)}
                    className="w-full rounded-xl border border-slate-200 px-3 py-2 text-[12.5px] text-slate-700 leading-relaxed outline-none resize-none focus:border-[#1b3a6b] focus:ring-2 focus:ring-[#1b3a6b]/10 transition-all font-mono"
                  />
                  <p className="text-[10.5px] text-slate-400">The signed PDF will be attached automatically.</p>
                </div>

                {/* Reset recipients link */}
                {recipientsDirty && (
                  <button
                    onClick={() => { setToRecipients(originalTo); setCcRecipients(originalCc); }}
                    className="text-[11.5px] text-slate-400 hover:text-[#1b3a6b] transition-colors underline underline-offset-2"
                  >
                    ↺ Reset to original recipients
                  </button>
                )}
              </>
            )}
          </div>

          {/* Footer note */}
          <div className="px-4 py-2.5 border-t border-slate-100 bg-slate-50">
            <p className="text-[11px] text-slate-400 leading-relaxed">
              Sent as a reply-all in the original email thread. Workflow moves to <strong>Sent</strong>.
            </p>
          </div>
        </div>

        {/* Actions */}
        <div className="flex gap-2">
          <button
            onClick={reset}
            disabled={sendToVendor.isPending}
            className="flex-1 py-2.5 rounded-xl border border-slate-200 text-[12.5px] font-medium text-slate-500 hover:bg-slate-100 transition-colors disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            onClick={handleSendToVendor}
            disabled={sendToVendor.isPending || recipientsLoading || toRecipients.length === 0}
            className="flex-1 py-2.5 rounded-xl bg-[#1b3a6b] text-white text-[12.5px] font-semibold hover:bg-[#162d56] transition-colors disabled:opacity-40 flex items-center justify-center gap-2"
          >
            {sendToVendor.isPending
              ? <><div className="h-3.5 w-3.5 rounded-full border-2 border-white border-t-transparent animate-spin" /> {sendStep}</>
              : <><Send size={13} /> Send document</>
            }
          </button>
        </div>
      </div>
    );
  }

  // ── No merged doc ─────────────────────────────────────────────────────────────
  if (!hasMergedDoc && status === 'pending_approval') {
    return (
      <div className="rounded-xl bg-amber-50 border border-amber-200 p-4 flex items-start gap-3">
        <AlertCircle className="h-5 w-5 flex-shrink-0 text-amber-500 mt-0.5" />
        <div>
          <p className="text-[13px] font-semibold text-amber-800">Document not yet ready</p>
          <p className="text-[12px] text-amber-600 mt-0.5">
            The cost engineering team is still preparing the SES document.
          </p>
        </div>
      </div>
    );
  }

  // ── Pending approval — full action panel ──────────────────────────────────────
  if (status === 'pending_approval' && actionMode === 'idle') {
    return (
      <div className="space-y-2">
        {isAssignedCH ? (
          // Assigned contract holder — full sign panel
          <>
            <div className="rounded-xl bg-blue-50 border border-blue-200 p-3 flex items-center gap-2">
              <Clock size={14} className="text-blue-400 flex-shrink-0" />
              <p className="text-[12px] text-blue-700">
                Awaiting your approval as{' '}
                <strong>{workflow.contractHolderName || workflow.contractHolderEmail}</strong>.
              </p>
            </div>
            <ActionButton
              icon={<CheckCircle size={14} />}
              label="Approve & Sign"
              variant="success"
              onClick={() => setSigModalOpen(true)}
              disabled={!canSign}
              disabledTitle="Review all documents and make decisions before signing"
            />
            <ActionButton icon={<MessageCircle size={14} />} label="Raise a query" variant="secondary" onClick={() => setActionMode('query')} />
            <ActionButton icon={<RotateCcw size={14} />} label="Return for Corrections" variant="warn" onClick={() => setActionMode('return')} />
            <ActionButton icon={<UserCheck size={14} />} label="Re-route signing" variant="ghost" onClick={() => setActionMode('reroute')} />
            <ActionButton icon={<Send size={14} />} label="Add comment only" variant="ghost" onClick={() => setActionMode('comment')} />
          </>
        ) : isAdminUser && hasMergedDoc ? (
          // Admin observer — Return and Re-route only, no signing
          <>
            <div className="rounded-xl bg-slate-50 border border-slate-200 p-3 flex items-center gap-2">
              <Clock size={14} className="text-slate-400 flex-shrink-0" />
              <p className="text-[12px] text-slate-600">
                Awaiting signature from{' '}
                <strong>{workflow.contractHolderName || workflow.contractHolderEmail || 'the contract holder'}</strong>.
              </p>
            </div>
            <ActionButton icon={<RotateCcw size={14} />} label="Return for Corrections" variant="warn" onClick={() => setActionMode('return')} />
            <ActionButton icon={<UserCheck size={14} />} label="Re-route signing" variant="ghost" onClick={() => setActionMode('reroute')} />
          </>
        ) : (
          // Observer (non-assigned user)
          <div className="rounded-xl bg-blue-50 border border-blue-200 p-4 flex items-start gap-3">
            <Clock className="h-5 w-5 flex-shrink-0 text-blue-400 mt-0.5" />
            <div>
              <p className="text-[13px] font-semibold text-blue-800">Pending Approval</p>
              <p className="text-[12px] text-blue-600 mt-0.5">
                Awaiting signature from{' '}
                {workflow.contractHolderName || workflow.contractHolderEmail || 'the contract holder'}.
              </p>
            </div>
          </div>
        )}
        {isEditor && (
          <ActionButton icon={<Send size={14} />} label="Reply to thread" variant="secondary" onClick={() => setActionMode('reply')} />
        )}
        {renderSigModal()}
      </div>
    );
  }

  // ── Inline form helpers ───────────────────────────────────────────────────────
  function renderInlineForm() {
    if (actionMode === 'idle') return null;

    if (actionMode === 'comment') {
      return (
        <InlineForm
          title="Add Comment"
          onCancel={reset}
          onSubmit={handleComment}
          loading={comment.isPending}
          submitLabel="Submit comment"
          canSubmit={!!text.trim()}
        >
          <TextInput label="Comment" placeholder="Enter your comment…" value={text} onChange={setText} />
        </InlineForm>
      );
    }

    if (actionMode === 'query') {
      return (
        <InlineForm
          title="Raise a Query"
          description="The cost engineer will be notified but the form stays locked until you approve or return it."
          onCancel={reset}
          onSubmit={handleQuery}
          loading={query.isPending}
          submitLabel="Send query"
          canSubmit={!!text.trim()}
          submitVariant="amber"
        >
          <TextInput label="Your query" placeholder="What needs clarification?" value={text} onChange={setText} />
        </InlineForm>
      );
    }

    if (actionMode === 'return') {
      return (
        <InlineForm
          title="Return for Corrections"
          description="The cost engineer will be notified and can edit and resubmit the form."
          onCancel={reset}
          onSubmit={handleReturn}
          loading={returnDoc.isPending}
          submitLabel="Return document"
          canSubmit={!!text.trim()}
          submitVariant="danger"
        >
          <TextInput label="Reason for return" placeholder="What needs to be corrected?" value={text} onChange={setText} />
        </InlineForm>
      );
    }

    if (actionMode === 'reroute') {
      return (
        <InlineForm
          title="Re-route Signing"
          description="The new contract holder will receive an email with a link to review and sign."
          onCancel={reset}
          onSubmit={handleReroute}
          loading={reroute.isPending}
          submitLabel="Re-route"
          canSubmit={!!rerouteEmail.trim() && !!rerouteName.trim()}
          submitVariant="navy"
        >
          <FieldInput label="Full name" placeholder="e.g. James Osei" value={rerouteName} onChange={setRerouteName} />
          <FieldInput label="Email address" placeholder="e.g. j.osei@tullow.com" type="email" value={rerouteEmail} onChange={setRerouteEmail} />
        </InlineForm>
      );
    }

    if (actionMode === 'reply') {
      return (
        <InlineForm
          title={status === 'queried' ? 'Reply to Query' : 'Add a Note'}
          description="Your response will be recorded in the activity log and visible to the contract holder on their next visit."
          onCancel={reset}
          onSubmit={handleReply}
          loading={reply.isPending}
          submitLabel="Send response"
          canSubmit={!!text.trim()}
        >
          <TextInput label="Message" placeholder="Type your response…" value={text} onChange={setText} />
        </InlineForm>
      );
    }

    return null;
  }

  function renderSigModal() {
    if (!user) return null;
    return (
      <SignatureModal
        open={sigModalOpen}
        user={user}
        loading={sign.isPending}
        loadingLabel={signStep}
        onClose={() => setSigModalOpen(false)}
        onConfirm={handleSign}
      />
    );
  }

  // Default fallback — show inline form if active, plus reply button for editors
  return (
    <div className="space-y-3">
      {isEditor && isActionable && actionMode === 'idle' && (
        <ActionButton icon={<Send size={14} />} label="Reply to thread" variant="secondary" onClick={() => setActionMode('reply')} />
      )}
      {renderInlineForm()}
      {renderSigModal()}
    </div>
  );
}

// ── Small helpers ──────────────────────────────────────────────────────────────

function RecipientChip({ name, address, onRemove }: { name: string; address: string; onRemove: () => void }) {
  return (
    <div className="inline-flex items-center gap-1.5 bg-slate-50 border border-slate-200 rounded-lg px-2.5 py-1 max-w-full">
      <div className="min-w-0">
        {name ? (
          <>
            <span className="text-[12px] font-medium text-slate-700 leading-none">{name}</span>
            <span className="text-[10.5px] text-slate-400 ml-1 leading-none truncate">{address}</span>
          </>
        ) : (
          <span className="text-[12px] font-medium text-slate-700 leading-none">{address}</span>
        )}
      </div>
      <button
        onClick={onRemove}
        className="flex-shrink-0 ml-0.5 rounded-full p-0.5 text-slate-300 hover:text-rose-500 hover:bg-rose-50 transition-colors"
        title="Remove recipient"
      >
        <X size={11} />
      </button>
    </div>
  );
}

type BtnVariant = 'success' | 'secondary' | 'warn' | 'ghost' | 'danger' | 'amber' | 'navy';

function ActionButton({
  icon, label, variant, onClick, disabled, disabledTitle,
}: {
  icon: React.ReactNode;
  label: string;
  variant: BtnVariant;
  onClick: () => void;
  disabled?: boolean;
  disabledTitle?: string;
}) {
  const styles: Record<BtnVariant, string> = {
    success:   'bg-emerald-600 text-white hover:bg-emerald-700',
    secondary: 'bg-slate-100 text-slate-700 hover:bg-slate-200',
    warn:      'bg-orange-50 text-orange-700 border border-orange-200 hover:bg-orange-100',
    ghost:     'bg-white text-slate-600 border border-slate-200 hover:bg-slate-50',
    danger:    'bg-red-50 text-red-700 border border-red-200 hover:bg-red-100',
    amber:     'bg-amber-50 text-amber-800 border border-amber-200 hover:bg-amber-100',
    navy:      'bg-[#1b3a6b] text-white hover:bg-[#162d56]',
  };
  return (
    <button
      onClick={disabled ? undefined : onClick}
      disabled={disabled}
      title={disabled ? disabledTitle : undefined}
      className={cn(
        'w-full flex items-center justify-center gap-2 rounded-xl py-2.5 text-[13px] font-medium transition-colors',
        styles[variant],
        disabled && 'opacity-40 cursor-not-allowed'
      )}
    >
      {icon} {label}
    </button>
  );
}

function InlineForm({
  title, description, children, onCancel, onSubmit, loading, submitLabel, canSubmit, submitVariant = 'navy',
}: {
  title: string;
  description?: string;
  children: React.ReactNode;
  onCancel: () => void;
  onSubmit: () => void;
  loading?: boolean;
  submitLabel: string;
  canSubmit: boolean;
  submitVariant?: BtnVariant;
}) {
  const submitStyles: Record<BtnVariant, string> = {
    success: 'bg-emerald-600 text-white hover:bg-emerald-700',
    secondary: 'bg-slate-200 text-slate-700 hover:bg-slate-300',
    warn:    'bg-orange-500 text-white hover:bg-orange-600',
    ghost:   'bg-white text-slate-600 border border-slate-200 hover:bg-slate-50',
    danger:  'bg-red-600 text-white hover:bg-red-700',
    amber:   'bg-amber-500 text-white hover:bg-amber-600',
    navy:    'bg-[#1b3a6b] text-white hover:bg-[#162d56]',
  };

  return (
    <div className="rounded-xl border border-slate-200 bg-slate-50 p-4 space-y-3">
      <div>
        <p className="text-[13px] font-semibold text-slate-700">{title}</p>
        {description && (
          <p className="text-[12px] text-slate-400 mt-0.5 leading-relaxed">{description}</p>
        )}
      </div>
      {children}
      <div className="flex gap-2 pt-1">
        <button
          onClick={onCancel}
          disabled={loading}
          className="flex-1 py-2 rounded-xl border border-slate-200 text-[12.5px] font-medium text-slate-500 hover:bg-slate-100 transition-colors disabled:opacity-50"
        >
          Cancel
        </button>
        <button
          onClick={onSubmit}
          disabled={!canSubmit || loading}
          className={cn(
            'flex-1 py-2 rounded-xl text-[12.5px] font-semibold transition-colors disabled:opacity-40',
            submitStyles[submitVariant]
          )}
        >
          {loading ? 'Sending…' : submitLabel}
        </button>
      </div>
    </div>
  );
}

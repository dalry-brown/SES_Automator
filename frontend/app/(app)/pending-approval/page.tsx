'use client';

import { useState, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import { Search, Edit, Send, FileText, ChevronRight, MessageCircle, AlertCircle, RotateCcw, UserCheck } from 'lucide-react';
import { useWorkflows } from '@/lib/hooks/useWorkflows';
import { useApprovalMutations } from '@/lib/hooks/useApproval';
import { useAuth } from '@/components/providers/AuthProvider';
import { useToast } from '@/components/ui/Toast';
import { SplitPanel, PanelHeader, PanelBody, PanelFooter, PanelSection, MetaRow, PanelEmpty } from '@/components/ui/SplitPanel';
import { PageSpinner } from '@/components/ui/Spinner';
import { formatDate, formatDateTime, daysSince, cn } from '@/lib/utils';
import { sesApi, approvalApi, workflowsApi } from '@/lib/api';
import type { Workflow, SesForm, ApprovalEvent } from '@/types';

// ── Types ──────────────────────────────────────────────────────────────────────
type StoredRow  = { sesNumber: string; amount: string };
type StoredForm = { sesRows?: StoredRow[]; description?: string; vendorName?: string; poNumber?: string; invoiceAmount?: string | number; currency?: string; [k: string]: unknown };
type StoredFields = { forms?: StoredForm[]; [k: string]: unknown };

function firstForm(sesForm: SesForm | null): StoredForm | null {
  if (!sesForm?.fields) return null;
  const f = sesForm.fields as StoredFields;
  return f.forms?.[0] ?? (sesForm.fields as StoredForm);
}

// ── Status badge ──────────────────────────────────────────────────────────────
function StatusBadge({ status }: { status: string }) {
  const config: Record<string, { label: string; cls: string }> = {
    pending_approval: { label: 'Pending',          cls: 'bg-blue-100 text-blue-700 border-blue-200' },
    queried:          { label: 'Pending · Queried', cls: 'bg-amber-100 text-amber-700 border-amber-200' },
    returned:         { label: 'Returned',          cls: 'bg-rose-100 text-rose-700 border-rose-200' },
  };
  const { label, cls } = config[status] ?? { label: status, cls: 'bg-slate-100 text-slate-600 border-slate-200' };
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded-md text-[11px] font-medium border ${cls}`}>
      {label}
    </span>
  );
}

const EVENT_ICONS: Partial<Record<string, React.ElementType>> = {
  queried:  AlertCircle,
  returned: RotateCcw,
  comment:  MessageCircle,
  rerouted: UserCheck,
};
const EVENT_COLORS: Partial<Record<string, string>> = {
  queried:  'text-amber-600',
  returned: 'text-rose-600',
  comment:  'text-slate-500',
  rerouted: 'text-violet-600',
};
const EVENT_LABELS: Partial<Record<string, string>> = {
  queried:  'Query raised',
  returned: 'Returned for corrections',
  comment:  'Comment',
  rerouted: 'Re-routed',
  submitted:'Submitted for approval',
};

// ── Shared side panel content fetcher ─────────────────────────────────────────
function useWorkflowPanelData(workflowId: string) {
  const sesQ = useQuery({
    queryKey: ['ses-form', 'workflow', workflowId],
    queryFn:  () => sesApi.byWorkflow(workflowId),
    enabled:  !!workflowId,
  });
  const evQ = useQuery({
    queryKey: ['approval', workflowId],
    queryFn:  () => approvalApi.pageData(workflowId),
    enabled:  !!workflowId,
  });
  const msgQ = useQuery({
    queryKey: ['messages', workflowId],
    queryFn:  () => workflowsApi.getMessages(workflowId),
    enabled:  !!workflowId,
  });
  // Use the first (original) message for CC info
  const firstMessage = msgQ.data?.messages?.[0] ?? null;
  return {
    sesForm: sesQ.data?.form ?? null,
    events: evQ.data?.events ?? [],
    firstMessage,
    isLoading: sesQ.isLoading,
  };
}

// ── CH side panel ──────────────────────────────────────────────────────────────
function ChSidePanel({ workflow }: { workflow: Workflow }) {
  const router = useRouter();
  const { sesForm, events, firstMessage, isLoading } = useWorkflowPanelData(workflow.id);

  const f = firstForm(sesForm);
  const rawForms = (sesForm?.fields as StoredFields | null)?.forms ?? (f ? [f] : []);
  // Only count forms that have actual content (not empty placeholders)
  const allForms = rawForms.filter((form) =>
    !!(form.vendorName || form.description || (form.sesRows ?? []).some((r) => r.sesNumber))
  );
  const sesNumbers = rawForms.flatMap((form) =>
    (form.sesRows ?? []).map((r) => r.sesNumber).filter(Boolean)
  );

  const amount   = f?.invoiceAmount ?? workflow.amount;
  const currency = f?.currency || workflow.currency;
  const amountStr = amount != null ? `${currency || ''} ${Number(amount).toLocaleString()}`.trim() : undefined;

  // Latest actionable events for CH awareness
  const noteEvents = events.filter((e) => ['queried', 'returned', 'comment', 'rerouted'].includes(e.type));

  return (
    <>
      <PanelHeader
        wfId={workflow.id}
        title={f?.vendorName || workflow.supplierName || 'Unknown vendor'}
        subtitle={workflow.invoiceNumber ? `Invoice ${workflow.invoiceNumber}` : undefined}
      />
      <PanelBody>
        {isLoading ? (
          <div className="flex items-center justify-center h-24 text-[12px] text-ce-muted">Loading details…</div>
        ) : (
          <>
            {/* Show CC recipients from original email if present */}
            {firstMessage?.ccRecipients && firstMessage.ccRecipients.length > 0 && (
              <PanelSection label="Email CC">
                <p className="text-[12px] text-ce-text leading-relaxed break-words">
                  {firstMessage.ccRecipients.map((r) => r.emailAddress.address).join(', ')}
                </p>
              </PanelSection>
            )}

            <PanelSection label="Vendor & invoice">
              <MetaRow label="Vendor"   value={f?.vendorName  || workflow.supplierName} />
              <MetaRow label="Invoice"  value={workflow.invoiceNumber} />
              <MetaRow label="PO no."   value={f?.poNumber    || workflow.poNumber} />
              <MetaRow label="Amount"   value={amountStr} />
            </PanelSection>

            {sesNumbers.length > 0 && (
              <PanelSection label="SES numbers">
                <div className="flex flex-wrap gap-1.5">
                  {sesNumbers.map((sn, i) => (
                    <span key={i} className="bg-ce-bg border border-ce-border text-[12px] text-ce-text px-2 py-0.5 rounded-md font-mono">
                      {sn}
                    </span>
                  ))}
                </div>
              </PanelSection>
            )}

            {f?.description && (
              <PanelSection label="Scope of work">
                <p className="text-[13px] text-ce-text leading-relaxed">{f.description as string}</p>
              </PanelSection>
            )}

            {allForms.length > 1 && (
              <PanelSection label="Documents">
                <p className="text-[12px] text-ce-muted">{allForms.length} SES forms require your signature.</p>
              </PanelSection>
            )}

            {noteEvents.length > 0 && (
              <PanelSection label="Messages & activity">
                <div className="space-y-2">
                  {noteEvents.slice(-3).map((ev) => {
                    const Icon  = EVENT_ICONS[ev.type] ?? MessageCircle;
                    const color = EVENT_COLORS[ev.type] ?? 'text-slate-500';
                    const label = EVENT_LABELS[ev.type] ?? ev.type;
                    return (
                      <div key={ev.id} className="flex gap-2.5 p-2.5 bg-slate-50 border border-slate-200 rounded-lg">
                        <Icon size={13} className={cn('flex-shrink-0 mt-0.5', color)} />
                        <div className="min-w-0">
                          <p className={cn('text-[11px] font-semibold', color)}>{label}</p>
                          <p className="text-[11px] text-slate-400">{ev.userName} · {formatDateTime(ev.createdAt)}</p>
                          {ev.comment && (
                            <p className="text-[12px] text-slate-600 mt-1 leading-snug">{ev.comment}</p>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </PanelSection>
            )}

            <PanelSection label="Submitted">
              <MetaRow label="Date"    value={workflow.submittedAt ? formatDateTime(workflow.submittedAt) : undefined} />
              <MetaRow label="Pending" value={(() => {
                const d = daysSince(workflow.submittedAt);
                return d != null ? `${d} day${d !== 1 ? 's' : ''}` : undefined;
              })()} />
            </PanelSection>
          </>
        )}
      </PanelBody>
      <PanelFooter>
        <button
          onClick={() => router.push(`/workflows/${workflow.id}/approval`)}
          className="w-full bg-ce-navy text-white text-[13px] font-semibold py-2.5 rounded-lg hover:bg-ce-navy2 transition-colors flex items-center justify-center gap-2"
        >
          <FileText size={14} /> Review &amp; sign document
        </button>
      </PanelFooter>
    </>
  );
}

// ── Editor side panel ──────────────────────────────────────────────────────────
function EditorSidePanel({ workflow }: { workflow: Workflow }) {
  const router = useRouter();
  const { sesForm, events, firstMessage, isLoading } = useWorkflowPanelData(workflow.id);
  const { reply: replyMutation } = useApprovalMutations(workflow.id);
  const { success: toastSuccess } = useToast();
  const [replyText, setReplyText] = useState('');

  const handleReply = async () => {
    if (!replyText.trim()) return;
    await replyMutation.mutateAsync(replyText.trim());
    setReplyText('');
    toastSuccess('Response sent.');
  };

  const f = firstForm(sesForm);
  const sesNumbers = ((sesForm?.fields as StoredFields | null)?.forms ?? (f ? [f] : [])).flatMap((form) =>
    (form.sesRows ?? []).map((r) => r.sesNumber).filter(Boolean)
  );
  const amount    = f?.invoiceAmount ?? workflow.amount;
  const currency  = f?.currency || workflow.currency;
  const amountStr = amount != null ? `${currency || ''} ${Number(amount).toLocaleString()}`.trim() : undefined;

  const days = daysSince(workflow.submittedAt);
  const noteEvents = events.filter((e) => ['queried', 'returned', 'comment', 'rerouted'].includes(e.type));

  return (
    <>
      <PanelHeader
        wfId={workflow.id}
        title={f?.vendorName || workflow.supplierName || 'Unknown vendor'}
        subtitle={workflow.invoiceNumber ? `Invoice ${workflow.invoiceNumber}` : undefined}
      />
      <PanelBody>
        {isLoading ? (
          <div className="flex items-center justify-center h-24 text-[12px] text-ce-muted">Loading…</div>
        ) : (
          <>
            <PanelSection label="Invoice details">
              <MetaRow label="Vendor"  value={f?.vendorName  || workflow.supplierName} />
              <MetaRow label="Invoice" value={workflow.invoiceNumber} />
              <MetaRow label="Amount"  value={amountStr} />
              <MetaRow label="PO no."  value={f?.poNumber || workflow.poNumber} />
            </PanelSection>

            {sesNumbers.length > 0 && (
              <PanelSection label="SES numbers">
                <div className="flex flex-wrap gap-1.5">
                  {sesNumbers.map((sn, i) => (
                    <span key={i} className="bg-ce-bg border border-ce-border text-[12px] text-ce-text px-2 py-0.5 rounded-md font-mono">
                      {sn}
                    </span>
                  ))}
                </div>
              </PanelSection>
            )}

            {f?.description && (
              <PanelSection label="Scope of work">
                <p className="text-[13px] text-ce-text leading-relaxed">{f.description as string}</p>
              </PanelSection>
            )}

            {firstMessage?.ccRecipients && firstMessage.ccRecipients.length > 0 && (
              <PanelSection label="Email CC">
                <p className="text-[12px] text-ce-text leading-relaxed break-words">
                  {firstMessage.ccRecipients.map((r) => r.emailAddress.address).join(', ')}
                </p>
              </PanelSection>
            )}

            <PanelSection label="Contract holder">
              <MetaRow label="Name"  value={workflow.contractHolderName} />
              <MetaRow label="Email" value={workflow.contractHolderEmail} />
              <MetaRow label="Sent"  value={workflow.submittedAt ? formatDateTime(workflow.submittedAt) : undefined} />
              {days != null && (
                <MetaRow label="Pending" value={
                  <span className={days >= 7 ? 'dur-over' : days >= 3 ? 'dur-warn' : 'dur-ok'}>
                    {days} day{days !== 1 ? 's' : ''}
                  </span>
                } />
              )}
            </PanelSection>

            {noteEvents.length > 0 && (
              <PanelSection label={workflow.status === 'queried' ? 'Query thread' : 'CH messages'}>
                <div className="space-y-2">
                  {noteEvents.map((ev) => {
                    const Icon  = EVENT_ICONS[ev.type] ?? MessageCircle;
                    const color = EVENT_COLORS[ev.type] ?? 'text-slate-500';
                    const label = EVENT_LABELS[ev.type] ?? ev.type;
                    return (
                      <div key={ev.id} className="flex gap-2.5 p-2.5 bg-slate-50 border border-slate-200 rounded-lg">
                        <Icon size={13} className={cn('flex-shrink-0 mt-0.5', color)} />
                        <div className="min-w-0">
                          <p className={cn('text-[11px] font-semibold', color)}>{label}</p>
                          <p className="text-[11px] text-slate-400">{ev.userName} · {formatDateTime(ev.createdAt)}</p>
                          {ev.comment && (
                            <p className="text-[12px] text-slate-600 mt-1 leading-snug">{ev.comment}</p>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </PanelSection>
            )}

            {(workflow.status === 'queried' || workflow.status === 'returned') && (
              <PanelSection label={workflow.status === 'returned' ? 'Reply to CH' : 'Your response'}>
                <div className="space-y-2">
                  <textarea
                    rows={3}
                    value={replyText}
                    onChange={(e) => setReplyText(e.target.value)}
                    placeholder={
                      workflow.status === 'returned'
                        ? 'e.g. This invoice was already corrected — please review the updated version…'
                        : 'Type your response to the query…'
                    }
                    className="w-full rounded-lg border border-ce-border px-3 py-2 text-[12px] outline-none resize-none focus:border-ce-navy text-ce-text placeholder:text-ce-hint"
                  />
                  <button
                    onClick={handleReply}
                    disabled={!replyText.trim() || replyMutation.isPending}
                    className="w-full bg-ce-navy text-white text-[12.5px] font-medium py-2 rounded-lg hover:bg-ce-navy2 transition-colors disabled:opacity-40"
                  >
                    {replyMutation.isPending ? 'Sending…' : 'Send response'}
                  </button>
                </div>
              </PanelSection>
            )}
          </>
        )}
      </PanelBody>
      <PanelFooter>
        {workflow.status === 'returned' ? (
          <>
            <button
              onClick={() => router.push(`/workflows/${workflow.id}`)}
              className="w-full bg-ce-navy text-white text-[13px] font-semibold py-2.5 rounded-lg hover:bg-ce-navy2 transition-colors flex items-center justify-center gap-2"
            >
              <Edit size={14} /> Edit SES form
            </button>
            <button
              onClick={() => router.push(`/workflows/${workflow.id}/approval`)}
              className="w-full bg-white border border-ce-border text-[13px] font-medium py-2 rounded-lg text-ce-muted hover:bg-ce-bg hover:text-ce-text transition-colors flex items-center justify-center gap-1.5"
            >
              <ChevronRight size={13} /> View approval page
            </button>
          </>
        ) : workflow.status === 'queried' ? (
          <button
            onClick={() => router.push(`/workflows/${workflow.id}/approval`)}
            className="w-full bg-ce-navy text-white text-[13px] font-medium py-2 rounded-lg hover:bg-ce-navy2 transition-colors flex items-center justify-center gap-1.5"
          >
            <ChevronRight size={13} /> View approval page
          </button>
        ) : (
          <>
            <button
              onClick={() => router.push(`/workflows/${workflow.id}/approval`)}
              className="w-full bg-ce-navy text-white text-[13px] font-medium py-2 rounded-lg hover:bg-ce-navy2 transition-colors flex items-center justify-center gap-1.5"
            >
              <ChevronRight size={13} /> View approval page
            </button>
            <button
              onClick={() => router.push(`/workflows/${workflow.id}`)}
              className="w-full bg-white border border-ce-border text-[13px] font-medium py-2 rounded-lg text-ce-muted hover:bg-ce-bg hover:text-ce-text transition-colors flex items-center justify-center gap-1.5"
            >
              <Edit size={13} /> Edit SES form
            </button>
            <button className="w-full bg-white border border-ce-border text-[13px] font-medium py-2 rounded-lg text-ce-muted hover:bg-ce-bg hover:text-ce-text transition-colors flex items-center justify-center gap-1.5">
              <Send size={13} /> Resend to contract holder
            </button>
          </>
        )}
      </PanelFooter>
    </>
  );
}

// ── Page ──────────────────────────────────────────────────────────────────────
export default function PendingApprovalPage() {
  const { effectiveRole } = useAuth();
  const isChView = effectiveRole === 'user';

  const [search, setSearch]     = useState('');
  const [selected, setSelected] = useState<Workflow | null>(null);

  const { data: allWf, isLoading } = useWorkflows();

  const workflows = useMemo(() => {
    const list = (allWf ?? []).filter((w) => {
      if (isChView) return w.status === 'pending_approval' || w.status === 'queried';
      return w.status === 'pending_approval' || w.status === 'queried' || w.status === 'returned';
    });
    if (!search.trim()) return list;
    const q = search.toLowerCase();
    return list.filter(
      (w) =>
        w.supplierName?.toLowerCase().includes(q) ||
        w.invoiceNumber?.toLowerCase().includes(q) ||
        w.contractHolderEmail?.toLowerCase().includes(q) ||
        w.contractHolderName?.toLowerCase().includes(q),
    );
  }, [allWf, search, isChView]);

  if (isLoading) return <PageSpinner />;

  return (
    <div className="flex flex-col flex-1 overflow-hidden">
      <SplitPanel
        defaultSideW={360}
        main={
          <>
            <div className="px-5 py-3.5 border-b border-ce-border flex items-center justify-between flex-shrink-0 bg-white">
              <div>
                <div className="text-[16px] font-semibold text-ce-navy">
                  {isChView ? 'Awaiting your signature' : 'Pending approval'}
                </div>
                <div className="text-[12.5px] text-ce-muted mt-0.5">
                  {workflows.length} item{workflows.length !== 1 ? 's' : ''}{isChView ? ' — click to review' : ''}
                </div>
              </div>
              <div className="flex gap-2 items-center">
                <div className="relative">
                  <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-ce-hint pointer-events-none" />
                  <input
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    placeholder="Search…"
                    className="border border-ce-border rounded-lg pl-7 pr-3 py-[7px] text-[13px] text-ce-text bg-ce-bg outline-none w-48 focus:border-ce-navy focus:bg-white transition-colors"
                  />
                </div>
                {!isChView && (
                  <select className="border border-ce-border rounded-lg px-2.5 py-[6px] text-[12.5px] text-ce-muted bg-white outline-none cursor-pointer">
                    <option>Newest first</option>
                    <option>Oldest first</option>
                  </select>
                )}
              </div>
            </div>

            <div className="flex-1 overflow-auto">
              {isChView ? (
                // ── CH card list ─────────────────────────────────────────────
                <div className="divide-y divide-ce-border">
                  {workflows.length === 0 && (
                    <div className="text-center text-ce-muted py-16 text-[13px]">
                      No workflows awaiting your signature
                    </div>
                  )}
                  {workflows.map((wf) => {
                    const days = daysSince(wf.submittedAt);
                    const isSelected = selected?.id === wf.id;
                    return (
                      <div
                        key={wf.id}
                        onClick={() => setSelected(wf)}
                        className={cn(
                          'flex items-center gap-4 px-5 py-4 cursor-pointer transition-colors group',
                          isSelected ? 'bg-ce-bg border-l-2 border-ce-navy' : 'hover:bg-ce-bg/60'
                        )}
                      >
                        <div className="flex-shrink-0 w-9 h-9 rounded-xl bg-ce-navy/8 flex items-center justify-center">
                          <FileText size={16} className="text-ce-navy" />
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-1.5 mb-0.5 overflow-hidden">
                            <span className="text-[14px] font-semibold text-ce-text truncate min-w-0">
                              {wf.supplierName || 'Unknown vendor'}
                            </span>
                          </div>
                          <div className="text-[12px] text-ce-muted">
                            {[wf.invoiceNumber && `Invoice ${wf.invoiceNumber}`, wf.poNumber && `PO ${wf.poNumber}`].filter(Boolean).join(' · ') || wf.id}
                          </div>
                        </div>
                        <div className="flex-shrink-0 text-right">
                          {days != null && (
                            <div className={cn('text-[12px] font-medium mb-1', days >= 7 ? 'text-red-600' : days >= 3 ? 'text-amber-600' : 'text-ce-muted')}>
                              {days === 0 ? 'Today' : `${days}d ago`}
                            </div>
                          )}
                          <ChevronRight size={14} className={cn('transition-colors ml-auto', isSelected ? 'text-ce-navy' : 'text-ce-muted group-hover:text-ce-navy')} />
                        </div>
                      </div>
                    );
                  })}
                </div>
              ) : (
                // ── Editor table ─────────────────────────────────────────────
                <table className="w-full border-collapse" style={{ tableLayout: 'fixed', minWidth: 820 }}>
                  <thead className="ce-thead">
                    <tr>
                      <th style={{ width: 150 }}>Workflow ID</th>
                      <th>Vendor</th>
                      <th style={{ width: 92 }}>Inv. no.</th>
                      <th style={{ width: 84 }}>Amount</th>
                      <th>Contract holder</th>
                      <th style={{ width: 130 }}>Sent to CH</th>
                      <th style={{ width: 90 }}>Days pend.</th>
                      <th style={{ width: 90 }}>Status</th>
                    </tr>
                  </thead>
                  <tbody className="ce-tbody">
                    {workflows.length === 0 && (
                      <tr>
                        <td colSpan={8} className="text-center text-ce-muted py-16 text-[13px]">
                          No pending approvals
                        </td>
                      </tr>
                    )}
                    {workflows.map((wf) => {
                      const days = daysSince(wf.submittedAt);
                      return (
                        <tr
                          key={wf.id}
                          className={cn('ce-row', selected?.id === wf.id && 'selected')}
                          onClick={() => setSelected(wf)}
                        >
                          <td className="font-semibold text-ce-navy">{wf.id}</td>
                          <td>{wf.supplierName || '—'}</td>
                          <td>{wf.invoiceNumber || '—'}</td>
                          <td>{wf.amount != null ? `${wf.currency} ${wf.amount.toLocaleString()}` : '—'}</td>
                          <td>{wf.contractHolderName || wf.contractHolderEmail || '—'}</td>
                          <td>
                            {wf.submittedAt ? (
                              <>
                                <div className="text-[13px]">{formatDate(wf.submittedAt, { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}</div>
                                <div className="text-[11.5px] text-ce-hint">{relTime(wf.submittedAt)}</div>
                              </>
                            ) : '—'}
                          </td>
                          <td>
                            {days != null ? (
                              <span className={days >= 7 ? 'dur-over' : days >= 3 ? 'dur-warn' : 'dur-ok'}>
                                {days} day{days !== 1 ? 's' : ''}
                              </span>
                            ) : '—'}
                          </td>
                          <td><StatusBadge status={wf.status} /></td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              )}
            </div>
          </>
        }
        side={
          !selected ? (
            <PanelEmpty message={isChView ? 'Select a workflow to view details' : 'Select a workflow to view contract holder details'} />
          ) : isChView ? (
            <ChSidePanel workflow={selected} />
          ) : (
            <EditorSidePanel workflow={selected} />
          )
        }
      />
    </div>
  );
}

function relTime(d: string | null | undefined) {
  const days = daysSince(d);
  if (days === null) return '';
  if (days === 0) return 'Today';
  if (days === 1) return 'Yesterday';
  return `${days} days ago`;
}

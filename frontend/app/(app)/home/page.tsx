'use client';

import { useState, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import { Search, BarChart2, FileText, ExternalLink, ChevronRight, Mail } from 'lucide-react';
import { useQuery } from '@tanstack/react-query';
import { emailsApi, attachmentsApi, othersApi, workflowsApi } from '@/lib/api';
import { useQueryClient } from '@tanstack/react-query';
import { useToast } from '@/components/ui/Toast';
import { useWorkflows } from '@/lib/hooks/useWorkflows';
import { StatusPill } from '@/components/ui/StatusPill';
import { SplitPanel, PanelHeader, PanelBody, PanelFooter, PanelSection, MetaRow, PanelEmpty } from '@/components/ui/SplitPanel';
import { AttachmentChip, AttachmentSidebarView } from '@/components/ui/AttachmentPreview';
import { PageSpinner } from '@/components/ui/Spinner';
import { formatDateTime, formatDate, cn } from '@/lib/utils';
import type { ThreadMessage, WorkflowStatus, Attachment } from '@/types';

type FilterKey = 'all' | WorkflowStatus;

const FILTERS: { key: FilterKey; label: string }[] = [
  { key: 'all',              label: 'All' },
  { key: 'received',         label: 'Pending review' },
  { key: 'pending_approval', label: 'Pending approval' },
  { key: 'approved',         label: 'Approved' },
  { key: 'sent',             label: 'Sent' },
  { key: 'closed',           label: 'Closed' },
];

const ASSIGN_TYPES = ['Change order', 'PO top-up', 'PR', 'General enquiry', 'AP', 'Other'];

// ── Grouped conversation structure ─────────────────────────────────────────────
interface ConversationGroup {
  workflowId: string;
  supplierName: string | null;
  status: WorkflowStatus;
  statusLabel: string;
  firstReceivedAt: string | null;
  messages: ThreadMessage[];
}

function groupByWorkflow(emails: ThreadMessage[]): ConversationGroup[] {
  const map = new Map<string, ConversationGroup>();
  for (const msg of emails) {
    const wfId = msg.workflowId;
    if (!map.has(wfId)) {
      map.set(wfId, {
        workflowId:     wfId,
        supplierName:   msg.supplierName,
        status:         msg.status,
        statusLabel:    msg.statusLabel,
        firstReceivedAt: msg.receivedAt,
        messages: [],
      });
    }
    const group = map.get(wfId)!;
    group.messages.push(msg);
    // Keep earliest received date as parent date
    if (msg.receivedAt && group.firstReceivedAt && msg.receivedAt < group.firstReceivedAt) {
      group.firstReceivedAt = msg.receivedAt;
    }
    // Status reflects the latest workflow state (same for all msgs in same wf)
    group.status      = msg.status;
    group.statusLabel = msg.statusLabel;
  }
  return Array.from(map.values());
}

export default function HomePage() {
  const router = useRouter();
  const qc = useQueryClient();
  const { success, error: toastError } = useToast();
  const [filter, setFilter]           = useState<FilterKey>('all');
  const [search, setSearch]           = useState('');
  const [selected, setSelected]       = useState<ThreadMessage | null>(null);
  const [expanded, setExpanded]       = useState<Set<string>>(new Set());
  const [previewAtt, setPreviewAtt]   = useState<Attachment | null>(null);
  const [assigning, setAssigning]     = useState(false);

  const { data: wfData }    = useWorkflows();
  const { data: emailsData, isLoading } = useQuery({
    queryKey: ['emails'],
    queryFn:  () => emailsApi.list(),
    refetchInterval: 60_000,
  });

  const { data: attData } = useQuery({
    queryKey: ['attachments', 'workflow', selected?.workflowId],
    queryFn:  () => attachmentsApi.byWorkflow(selected!.workflowId),
    enabled:  !!selected?.workflowId,
  });
  const attachments: Attachment[] = attData?.attachments ?? [];

  const wfs    = wfData ?? [];
  const emails = emailsData?.emails ?? [];

  const reviewCount   = emails.filter((e) => e.status === 'received').length;
  const approvalCount = wfs.filter((w) => w.status === 'pending_approval').length;
  const approvedCount = wfs.filter((w) => w.status === 'approved').length;
  const sentCount     = wfs.filter((w) => w.status === 'sent').length;
  const totalCount    = wfs.length;

  const groups = useMemo(() => {
    let list = emails;
    if (filter !== 'all') list = list.filter((e) => e.status === filter);
    if (search.trim()) {
      const q = search.toLowerCase();
      list = list.filter(
        (e) =>
          e.subject?.toLowerCase().includes(q) ||
          e.senderEmail?.toLowerCase().includes(q) ||
          e.senderName?.toLowerCase().includes(q) ||
          e.supplierName?.toLowerCase().includes(q),
      );
    }
    return groupByWorkflow(list);
  }, [emails, filter, search]);

  if (isLoading) return <PageSpinner />;

  const toggleExpand = (wfId: string) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(wfId)) next.delete(wfId);
      else next.add(wfId);
      return next;
    });
  };

  const handleSelect = (msg: ThreadMessage) => {
    setSelected(msg);
    setPreviewAtt(null);
  };

  const handleGroupClick = (group: ConversationGroup) => {
    if (group.messages.length === 1) {
      handleSelect(group.messages[0]);
    } else {
      toggleExpand(group.workflowId);
      // Also select the most recent message for the side panel
      const latest = [...group.messages].sort(
        (a, b) => new Date(b.receivedAt ?? 0).getTime() - new Date(a.receivedAt ?? 0).getTime()
      )[0];
      handleSelect(latest);
    }
  };

  const handleAssign = async (category: string) => {
    if (!selected || assigning) return;
    setAssigning(true);
    try {
      await othersApi.create({
        workflowId:   selected.workflowId ?? undefined,
        category,
        description:  category,
        supplierName: selected.supplierName || selected.senderName || undefined,
      });
      if (selected.workflowId) {
        await workflowsApi.setStatus(selected.workflowId, 'other' as WorkflowStatus);
      }
      qc.invalidateQueries({ queryKey: ['emails'] });
      qc.invalidateQueries({ queryKey: ['workflows'] });
      qc.invalidateQueries({ queryKey: ['others'] });
      success('Assigned to Others.');
      setSelected(null);
      router.push('/others');
    } catch (err) {
      toastError(err instanceof Error ? err.message : 'Failed to assign — check the console');
    } finally {
      setAssigning(false);
    }
  };

  const handlePopout = () => {
    if (selected?.workflowId) {
      window.open(`/preview/${selected.workflowId}`, '_blank', 'width=860,height=960,resizable=yes');
    }
  };

  const isUnprocessed = selected?.status === 'received';
  const ccList = selected?.ccRecipients?.map((r) => r.emailAddress.address).join(', ');

  return (
    <div className="flex flex-col flex-1 overflow-hidden">
      {/* Stats hero */}
      <div className="flex gap-2.5 px-5 py-3.5 flex-wrap bg-white border-b border-ce-border flex-shrink-0">
        <StatHero label="Pending review"   count={reviewCount}   dot="#f59e0b" onClick={() => router.push('/inbox')} />
        <StatHero label="Pending approval" count={approvalCount} dot="#3b82f6" onClick={() => router.push('/pending-approval')} />
        <StatHero label="Approved"         count={approvedCount} dot="#10b981" onClick={() => router.push('/approved')} />
        <StatHero label="Sent / Closed"    count={sentCount}     dot="#9ca3af" onClick={() => router.push('/archive')} />
        <div
          className="flex-1 min-w-[100px] bg-ce-navy rounded-xl px-3.5 py-3 cursor-pointer hover:bg-ce-navy2 transition-colors"
          onClick={() => router.push('/tracker')}
        >
          <div className="text-[11px] text-white/60 font-medium flex items-center gap-1">
            <BarChart2 size={11} /> Tracker
          </div>
          <div className="text-[26px] font-bold text-white leading-none mt-0.5">{totalCount}</div>
          <div className="text-[11px] text-white/40 mt-0.5">view all →</div>
        </div>
      </div>

      <SplitPanel
        main={
          <>
            <div className="px-5 py-3.5 border-b border-ce-border flex items-center justify-between flex-shrink-0 bg-white">
              <div>
                <div className="text-[16px] font-semibold text-ce-navy">Inbox</div>
                <div className="text-[12.5px] text-ce-muted mt-0.5">
                  {groups.length} conversation{groups.length !== 1 ? 's' : ''} — click to preview and assign
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
              </div>
            </div>

            <div className="px-5 py-2.5 border-b border-ce-border flex gap-1.5 flex-wrap flex-shrink-0 bg-white">
              {FILTERS.map((f) => (
                <button
                  key={f.key}
                  onClick={() => setFilter(f.key)}
                  className={cn(
                    'px-3 py-1 rounded-full text-[12.5px] font-medium border transition-all',
                    filter === f.key
                      ? 'bg-ce-navy text-white border-ce-navy'
                      : 'bg-white text-ce-muted border-ce-border hover:border-ce-border2 hover:text-ce-text',
                  )}
                >
                  {f.label}
                </button>
              ))}
            </div>

            <div className="flex-1 overflow-auto">
              {groups.length === 0 ? (
                <div className="text-center text-ce-muted py-16 text-[13px]">No emails found</div>
              ) : (
                <div className="divide-y divide-ce-border">
                  {groups.map((group) => {
                    const isOpen   = expanded.has(group.workflowId);
                    const isMulti  = group.messages.length > 1;
                    const isSelWf  = selected?.workflowId === group.workflowId;

                    return (
                      <div key={group.workflowId}>
                        {/* Parent row */}
                        <div
                          onClick={() => handleGroupClick(group)}
                          className={cn(
                            'flex items-center gap-3 px-5 py-3.5 cursor-pointer transition-colors group',
                            isSelWf && !isOpen ? 'bg-ce-bg border-l-2 border-ce-navy' : 'hover:bg-ce-bg/60',
                            isOpen && 'bg-slate-50',
                          )}
                        >
                          {/* Expand chevron / mail icon */}
                          <div className="flex-shrink-0 w-7 flex items-center justify-center">
                            {isMulti ? (
                              <div className={cn('transition-transform', isOpen && 'rotate-90')}>
                                <ChevronRight size={14} className="text-ce-muted" />
                              </div>
                            ) : (
                              <Mail size={14} className="text-ce-muted" />
                            )}
                          </div>

                          {/* Main content */}
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 mb-0.5">
                              <span className="text-[13px] font-semibold text-ce-navy font-mono flex-shrink-0">
                                {group.workflowId}
                              </span>
                              <span className="text-[13px] font-medium text-ce-text truncate">
                                {group.supplierName || group.messages[0]?.senderName || 'Unknown sender'}
                              </span>
                              {isMulti && (
                                <span className="flex-shrink-0 bg-ce-navy/10 text-ce-navy text-[11px] font-semibold px-1.5 py-0.5 rounded-full">
                                  {group.messages.length}
                                </span>
                              )}
                            </div>
                            <div className="text-[12px] text-ce-muted truncate">
                              {group.messages[0]?.subject || '(no subject)'}
                            </div>
                          </div>

                          {/* Right: date + status */}
                          <div className="flex-shrink-0 flex flex-col items-end gap-1">
                            <div className="text-[12px] text-ce-muted">
                              {formatDate(group.firstReceivedAt, { day: 'numeric', month: 'short' })}
                            </div>
                            <StatusPill status={group.status} small />
                          </div>
                        </div>

                        {/* Child rows (expanded) */}
                        {isOpen && isMulti && (
                          <div className="bg-slate-50 border-b border-ce-border">
                            {group.messages.map((msg, idx) => {
                              const isSelMsg = selected?.id === msg.id;
                              return (
                                <div
                                  key={msg.id}
                                  onClick={(e) => { e.stopPropagation(); handleSelect(msg); }}
                                  className={cn(
                                    'flex items-center gap-3 pl-12 pr-5 py-2.5 cursor-pointer transition-colors border-t border-ce-border/50',
                                    isSelMsg
                                      ? 'bg-[#eef3fb] border-l-2 border-ce-navy'
                                      : 'hover:bg-white/80',
                                  )}
                                >
                                  <div className="flex-shrink-0 w-5 h-5 rounded-full bg-ce-muted/10 flex items-center justify-center text-[10px] font-bold text-ce-muted">
                                    {idx + 1}
                                  </div>
                                  <div className="flex-1 min-w-0">
                                    <div className="flex items-center gap-2 mb-0.5">
                                      <span className="text-[12.5px] font-medium text-ce-text truncate">
                                        {msg.senderName || msg.senderEmail || 'Unknown'}
                                      </span>
                                    </div>
                                    <div className="text-[11.5px] text-ce-muted truncate">
                                      {msg.subject || '(no subject)'}
                                    </div>
                                  </div>
                                  <div className="flex-shrink-0 text-[11.5px] text-ce-hint">
                                    {formatDate(msg.receivedAt, { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}
                                  </div>
                                </div>
                              );
                            })}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </>
        }
        side={
          !selected ? (
            <PanelEmpty message="Select a conversation to preview and assign" />
          ) : (
            <div className="flex flex-col h-full overflow-hidden">
              <PanelHeader
                wfId={selected.workflowId ?? undefined}
                title={selected.supplierName || selected.senderName || 'Unknown sender'}
                subtitle={selected.subject ?? undefined}
                onPopout={selected.workflowId ? handlePopout : undefined}
              />

              {previewAtt ? (
                <AttachmentSidebarView
                  attachment={previewAtt}
                  onClose={() => setPreviewAtt(null)}
                />
              ) : (
                <>
                  <PanelBody className="gap-3">
                    <PanelSection label="Email details">
                      <MetaRow label="From"     value={selected.senderEmail} />
                      <MetaRow label="To"       value={selected.toRecipients?.map((r) => r.emailAddress.address).join(', ')} />
                      {ccList && <MetaRow label="CC" value={ccList} />}
                      <MetaRow label="Received" value={formatDateTime(selected.receivedAt)} />
                    </PanelSection>

                    <PanelSection label="Body">
                      <div className="bg-ce-bg border border-ce-border rounded-lg p-2.5 text-[13px] text-ce-text leading-relaxed max-h-[100px] overflow-y-auto whitespace-pre-wrap">
                        {selected.bodyPreview ?? '(no body preview)'}
                      </div>
                    </PanelSection>

                    {attachments.length > 0 && (
                      <PanelSection label={`Attachments (${attachments.length})`}>
                        <div className="flex flex-col gap-1">
                          {attachments.map((att) => (
                            <AttachmentChip
                              key={att.id}
                              att={att}
                              onClick={() => setPreviewAtt(att)}
                            />
                          ))}
                        </div>
                      </PanelSection>
                    )}

                    {isUnprocessed && (
                      <PanelSection label="Assign this email">
                        <div className="grid grid-cols-2 gap-1.5">
                          <button
                            onClick={() => selected.workflowId && router.push(`/workflows/${selected.workflowId}`)}
                            className="col-span-2 bg-ce-navy text-white rounded-lg py-2.5 px-3 text-[12px] font-medium hover:bg-ce-navy2 transition-colors flex items-center justify-center gap-1.5"
                          >
                            <FileText size={13} /> Open / Create SES workflow
                          </button>
                          {ASSIGN_TYPES.map((t) => (
                            <button
                              key={t}
                              disabled={assigning}
                              onClick={() => handleAssign(t)}
                              className="bg-white border border-ce-border rounded-lg py-1.5 px-2 text-[12px] font-medium hover:border-ce-navy hover:text-ce-navy hover:bg-blue-50 transition-all text-center disabled:opacity-50 disabled:cursor-not-allowed"
                            >
                              {t}
                            </button>
                          ))}
                        </div>
                      </PanelSection>
                    )}
                  </PanelBody>

                  <PanelFooter>
                    {isUnprocessed ? (
                      <div className="text-[12px] text-ce-muted text-center py-1">Choose an assignment above</div>
                    ) : (
                      <button
                        onClick={() => selected.workflowId && router.push(`/workflows/${selected.workflowId}`)}
                        className="w-full bg-ce-navy text-white text-[13px] font-medium py-2 rounded-lg hover:bg-ce-navy2 transition-colors flex items-center justify-center gap-1.5"
                      >
                        <ExternalLink size={13} /> View SES form
                      </button>
                    )}
                  </PanelFooter>
                </>
              )}
            </div>
          )
        }
      />
    </div>
  );
}

function StatHero({ label, count, dot, onClick }: { label: string; count: number; dot: string; onClick?: () => void }) {
  return (
    <div
      className={cn(
        'flex-1 min-w-[100px] bg-ce-bg border border-ce-border rounded-xl px-3.5 py-3',
        onClick && 'cursor-pointer hover:border-ce-border2 transition-colors',
      )}
      onClick={onClick}
    >
      <div className="text-[11px] text-ce-muted font-medium flex items-center gap-1">
        <span className="inline-block w-1.5 h-1.5 rounded-full flex-shrink-0" style={{ background: dot }} />
        {label}
      </div>
      <div className="text-[26px] font-bold text-ce-navy leading-none mt-0.5">{count}</div>
    </div>
  );
}

'use client';

import { useState, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import { Search, BarChart2, FileText, ExternalLink, Mail, Pencil, BookOpen, MessageSquare } from 'lucide-react';
import { useQuery } from '@tanstack/react-query';
import { attachmentsApi, othersApi, workflowsApi, trackerApi } from '@/lib/api';
import { useQueryClient } from '@tanstack/react-query';
import { useToast } from '@/components/ui/Toast';
import { useWorkflows } from '@/lib/hooks/useWorkflows';
import { useAuth } from '@/components/providers/AuthProvider';
import { StatusPill } from '@/components/ui/StatusPill';
import { SplitPanel, PanelHeader, PanelBody, PanelFooter, PanelSection, MetaRow, PanelEmpty } from '@/components/ui/SplitPanel';
import { AttachmentChip, AttachmentSidebarView } from '@/components/ui/AttachmentPreview';
import { ThreadView } from '@/components/ui/ThreadView';
import { PageSpinner } from '@/components/ui/Spinner';
import { formatDateTime, formatDate, formatDraftEditor, cn } from '@/lib/utils';
import type { ThreadMessage, WorkflowStatus, Attachment, Workflow } from '@/types';

type FilterKey = 'all' | 'draft' | WorkflowStatus;
type SideTab = 'details' | 'thread';

const FILTERS: { key: FilterKey; label: string }[] = [
  { key: 'all',              label: 'All' },
  { key: 'received',         label: 'Pending review' },
  { key: 'draft',            label: 'Drafts' },
  { key: 'pending_approval', label: 'Pending approval' },
  { key: 'approved',         label: 'Approved' },
  { key: 'sent',             label: 'Sent' },
  { key: 'closed',           label: 'Closed' },
];

const ASSIGN_TYPES = ['Change order', 'PO top-up', 'PR', 'General enquiry', 'AP', 'Other'];

// ── Conversation group (built from workflow-level data, no messages array) ──────
interface ConversationGroup {
  workflowId: string;
  supplierName: string | null;
  status: WorkflowStatus;
  statusLabel: string;
  firstReceivedAt: string | null;
  firstSubject: string | null;
  firstSenderName: string | null;
  messageCount: number;
  hasNewMessage: boolean;
  hasDraft: boolean;
  lockedBy: string | null;
  lockedAt: string | null;
  lockedByName: string | null;
  lockedByEmail: string | null;
  draftEditorName: string | null;
}

function workflowsToGroups(workflows: Workflow[]): ConversationGroup[] {
  return workflows.map((wf) => ({
    workflowId:      wf.id,
    supplierName:    wf.supplierName,
    status:          wf.status,
    statusLabel:     wf.statusLabel,
    firstReceivedAt: wf.lastReceivedAt ?? wf.createdAt,
    firstSubject:    wf.firstSubject ?? null,
    firstSenderName: wf.firstSenderName ?? null,
    messageCount:    wf.messageCount ?? 0,
    hasNewMessage:   wf.hasNewMessage,
    hasDraft:        wf.hasDraft,
    lockedBy:        wf.lockedBy,
    lockedAt:        wf.lockedAt,
    lockedByName:    wf.lockedByName ?? null,
    lockedByEmail:   wf.lockedByEmail ?? null,
    draftEditorName: wf.draftEditorName ?? null,
  }));
}

export default function HomePage() {
  const router    = useRouter();
  const qc        = useQueryClient();
  const { success, error: toastError } = useToast();
  const { effectiveRole } = useAuth();
  const isEditor = effectiveRole === 'editor' || effectiveRole === 'admin';

  const [filter, setFilter]         = useState<FilterKey>('all');
  const [search, setSearch]         = useState('');
  const [selected, setSelected]     = useState<ConversationGroup | null>(null);
  const [activeTab, setActiveTab]   = useState<SideTab>('details');
  const [previewAtt, setPreviewAtt] = useState<Attachment | null>(null);
  const [assigning, setAssigning]   = useState(false);

  const { data: wfData, isLoading } = useWorkflows();
  const wfs = wfData ?? [];

  const { data: msgData } = useQuery({
    queryKey: ['messages', selected?.workflowId],
    queryFn:  () => workflowsApi.getMessages(selected!.workflowId),
    enabled:  !!selected?.workflowId,
    staleTime: 0,
  });
  const msgs: ThreadMessage[] = msgData?.messages ?? [];

  const { data: attData } = useQuery({
    queryKey: ['attachments', 'workflow', selected?.workflowId],
    queryFn:  () => attachmentsApi.byWorkflow(selected!.workflowId),
    enabled:  !!selected?.workflowId,
  });
  const attachments: Attachment[] = attData?.attachments ?? [];

  const reviewCount   = wfs.filter((w) => w.status === 'received').length;
  const approvalCount = wfs.filter((w) => w.status === 'pending_approval').length;
  const approvedCount = wfs.filter((w) => w.status === 'approved').length;
  const sentCount     = wfs.filter((w) => w.status === 'sent' || w.status === 'closed').length;

  const { data: monthlyData } = useQuery({
    queryKey: ['tracker', 'monthly-count'],
    queryFn:  trackerApi.monthlyCount,
    staleTime: 60_000,
  });
  const monthCount = monthlyData?.count ?? 0;
  const monthLabel = new Date().toLocaleDateString('en-GB', { month: 'long', year: 'numeric' });

  const groups = useMemo(() => {
    let list = wfs;
    if (filter === 'draft') {
      list = list.filter((w) => w.hasDraft && w.status === 'received');
    } else if (filter !== 'all') {
      list = list.filter((w) => w.status === filter);
    }
    if (search.trim()) {
      const q = search.toLowerCase();
      list = list.filter(
        (w) =>
          w.firstSubject?.toLowerCase().includes(q) ||
          w.firstSenderEmail?.toLowerCase().includes(q) ||
          w.firstSenderName?.toLowerCase().includes(q) ||
          w.supplierName?.toLowerCase().includes(q),
      );
    }
    return workflowsToGroups(list);
  }, [wfs, filter, search]);

  if (isLoading) return <PageSpinner />;

  const handleSelect = (group: ConversationGroup) => {
    setSelected(group);
    setPreviewAtt(null);
    setActiveTab('details');
  };

  const handleAssign = async (category: string) => {
    if (!selected || assigning) return;
    setAssigning(true);
    try {
      await othersApi.create({
        workflowId:   selected.workflowId ?? undefined,
        category,
        description:  category,
        supplierName: selected.supplierName || selected.firstSenderName || undefined,
      });
      if (selected.workflowId) {
        await workflowsApi.setStatus(selected.workflowId, 'other' as WorkflowStatus);
      }
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

  const sortedMsgs   = [...msgs].sort(
    (a, b) => new Date(a.receivedAt ?? 0).getTime() - new Date(b.receivedAt ?? 0).getTime()
  );
  const firstMsg      = sortedMsgs[0] ?? null;
  const isUnprocessed = selected?.status === 'received';
  const ccList = firstMsg?.ccRecipients?.map((r) => r.emailAddress.address).join(', ');

  return (
    <div className="flex flex-col flex-1 overflow-hidden">
      {/* Stats hero */}
      <div className="flex gap-2.5 px-5 py-3.5 flex-wrap bg-white border-b border-ce-border flex-shrink-0">
        <StatHero label="Pending review"   count={reviewCount}   dot="#f59e0b" onClick={() => router.push('/inbox')} />
        <StatHero label="Pending approval" count={approvalCount} dot="#3b82f6" onClick={() => router.push('/pending-approval')} />
        <StatHero label="Approved"         count={approvedCount} dot="#10b981" onClick={() => router.push('/approved')} />
        <StatHero label="Sent / Closed"    count={sentCount}     dot="#9ca3af" onClick={() => router.push('/archive')} />
        <div
          className="flex-1 min-w-[100px] bg-ce-navy rounded-xl px-3.5 py-3 cursor-pointer hover:bg-ce-navy2 transition-colors group"
          onClick={() => router.push('/tracker')}
        >
          <div className="flex items-center justify-between mb-1">
            <span className="text-[11px] text-white/60 font-medium flex items-center gap-1">
              <BarChart2 size={11} /> Tracker
            </span>
            <span className="text-[9.5px] font-semibold text-white/55 bg-white/10 rounded-md px-1.5 py-0.5 leading-none group-hover:bg-white/15 transition-colors">
              {monthLabel}
            </span>
          </div>
          <div className="text-[26px] font-bold text-white leading-none">{monthCount}</div>
          <div className="text-[11px] text-white/40 mt-0.5">SES this month · view all →</div>
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
                    const isSelWf = selected?.workflowId === group.workflowId;
                    const hasNew = group.hasNewMessage;
                    const lockAgeMin = group.lockedAt
                      ? (Date.now() - new Date(group.lockedAt).getTime()) / 60000
                      : 999;
                    const isBeingEdited = !!group.lockedBy && lockAgeMin < 15;
                    const editorName = isBeingEdited
                      ? (group.lockedByName ?? group.lockedByEmail ?? 'Someone')
                      : null;
                    const isDraft = group.hasDraft && group.status === 'received';
                    const draftEditor = isDraft ? formatDraftEditor(group.draftEditorName ?? null) : null;
                    const msgCount = group.messageCount;

                    return (
                      <div
                        key={group.workflowId}
                        onClick={() => handleSelect(group)}
                        className={cn(
                          'flex items-center gap-3 px-5 py-3.5 cursor-pointer transition-colors group',
                          isSelWf
                            ? 'bg-ce-bg border-l-2 border-ce-navy'
                            : 'hover:bg-ce-bg/60',
                        )}
                      >
                        {/* Mail icon with new-message dot */}
                        <div className="flex-shrink-0 w-7 flex items-center justify-center relative">
                          <Mail size={14} className="text-ce-muted" />
                          {hasNew && (
                            <span className="absolute -top-1 -right-1 w-2 h-2 rounded-full bg-blue-500 ring-2 ring-white" />
                          )}
                        </div>

                        {/* Main content */}
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 mb-0.5">
                            <span className="text-[13px] font-semibold text-ce-navy font-mono flex-shrink-0">
                              {group.workflowId}
                            </span>
                            <span className={cn(
                              'text-[13px] font-medium truncate',
                              hasNew ? 'text-ce-text font-semibold' : 'text-ce-text',
                            )}>
                              {group.supplierName || group.firstSenderName || 'Unknown sender'}
                            </span>
                            {msgCount > 1 && (
                              <span className="flex-shrink-0 bg-ce-navy/10 text-ce-navy text-[11px] font-semibold px-1.5 py-0.5 rounded-full">
                                {msgCount}
                              </span>
                            )}
                            {isDraft && !isBeingEdited && (
                              <span
                                title={`Draft saved by ${group.draftEditorName ?? 'a cost engineer'}`}
                                className="flex-shrink-0 flex items-center gap-1 bg-sky-50 text-sky-600 border border-sky-200 text-[11px] font-semibold px-1.5 py-0.5 rounded-full"
                              >
                                <BookOpen size={9} />
                                Draft{draftEditor ? ` · ${draftEditor}` : ''}
                              </span>
                            )}
                            {isBeingEdited && (
                              <span
                                title={`${editorName} is creating the SES form`}
                                className="flex-shrink-0 flex items-center gap-1 bg-amber-100 text-amber-700 text-[11px] font-semibold px-1.5 py-0.5 rounded-full"
                              >
                                <Pencil size={9} />
                                In progress
                              </span>
                            )}
                            {hasNew && (
                              <span className="flex-shrink-0 flex items-center gap-1 bg-blue-50 text-blue-600 border border-blue-200 text-[11px] font-semibold px-1.5 py-0.5 rounded-full">
                                <MessageSquare size={9} />
                                New reply
                              </span>
                            )}
                          </div>
                          <div className="text-[12px] text-ce-muted truncate">
                            {group.firstSubject || '(no subject)'}
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
                title={selected.supplierName || firstMsg?.senderName || 'Unknown sender'}
                subtitle={firstMsg?.subject ?? undefined}
                onPopout={selected.workflowId ? handlePopout : undefined}
              />

              {/* Tab bar */}
              <div className="flex border-b border-ce-border flex-shrink-0 bg-white px-4">
                {(['details', 'thread'] as SideTab[]).map((tab) => (
                  <button
                    key={tab}
                    onClick={() => setActiveTab(tab)}
                    className={cn(
                      'px-3 py-2 text-[12.5px] font-medium border-b-2 transition-colors capitalize',
                      activeTab === tab
                        ? 'border-ce-navy text-ce-navy'
                        : 'border-transparent text-ce-muted hover:text-ce-text',
                    )}
                  >
                    {tab === 'thread' ? (
                      <span className="flex items-center gap-1">
                        Thread
                        {msgs.length > 1 && (
                          <span className="bg-ce-navy/10 text-ce-navy text-[10px] font-bold px-1 rounded-full">
                            {msgs.length}
                          </span>
                        )}
                      </span>
                    ) : 'Details'}
                  </button>
                ))}
              </div>

              {activeTab === 'thread' ? (
                <ThreadView
                  workflowId={selected.workflowId}
                  canReply={isEditor}
                />
              ) : previewAtt ? (
                <AttachmentSidebarView
                  attachment={previewAtt}
                  onClose={() => setPreviewAtt(null)}
                />
              ) : (
                <>
                  <PanelBody className="gap-3">
                    <PanelSection label="Email details">
                      <MetaRow label="From"     value={firstMsg?.senderEmail} />
                      <MetaRow label="To"       value={firstMsg?.toRecipients?.map((r) => r.emailAddress.address).join(', ')} />
                      {ccList && <MetaRow label="CC" value={ccList} />}
                      <MetaRow label="Received" value={formatDateTime(firstMsg?.receivedAt ?? null)} />
                    </PanelSection>

                    <PanelSection label="Body">
                      <div className="bg-ce-bg border border-ce-border rounded-lg p-2.5 text-[13px] text-ce-text leading-relaxed max-h-[100px] overflow-y-auto whitespace-pre-wrap">
                        {firstMsg?.bodyPreview ?? '(no body preview)'}
                      </div>
                      {msgs.length > 1 && (
                        <button
                          onClick={() => setActiveTab('thread')}
                          className="mt-1.5 text-[11.5px] text-[#1b3a6b] hover:underline font-medium"
                        >
                          {msgs.length - 1} more message{msgs.length > 2 ? 's' : ''} — view thread →
                        </button>
                      )}
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
                            onClick={() => selected.workflowId && router.push(`/workflows/${selected.workflowId}?from=/home`)}
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
                        onClick={() => selected.workflowId && router.push(`/workflows/${selected.workflowId}?from=/home`)}
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

'use client';

import { useState, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import { Search, FileText, BookOpen, Pencil, Mail, MessageSquare } from 'lucide-react';
import { useQuery } from '@tanstack/react-query';
import { attachmentsApi, othersApi, workflowsApi } from '@/lib/api';
import { useQueryClient } from '@tanstack/react-query';
import { useToast } from '@/components/ui/Toast';
import { useWorkflows } from '@/lib/hooks/useWorkflows';
import { useAuth } from '@/components/providers/AuthProvider';
import { SplitPanel, PanelHeader, PanelBody, PanelFooter, PanelSection, MetaRow, PanelEmpty } from '@/components/ui/SplitPanel';
import { AttachmentChip, AttachmentSidebarView } from '@/components/ui/AttachmentPreview';
import { ThreadView } from '@/components/ui/ThreadView';
import { PageSpinner } from '@/components/ui/Spinner';
import { formatDate, formatDateTime, formatDraftEditor, daysSince, cn } from '@/lib/utils';
import type { ThreadMessage, WorkflowStatus, Attachment, Workflow } from '@/types';

const ASSIGN_TYPES = ['Change order', 'PO top-up', 'PR', 'General enquiry', 'AP', 'Other'];

type FilterKey = 'all' | 'draft' | 'in_progress';
type SideTab = 'details' | 'thread';

const FILTERS: { key: FilterKey; label: string }[] = [
  { key: 'all',         label: 'All' },
  { key: 'draft',       label: 'Drafts' },
  { key: 'in_progress', label: 'In progress' },
];

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
    draftEditorName: wf.draftEditorName ?? null,
  }));
}

export default function InboxPage() {
  const router  = useRouter();
  const qc      = useQueryClient();
  const { success, error: toastError } = useToast();
  const { effectiveRole } = useAuth();
  const isEditor = effectiveRole === 'editor' || effectiveRole === 'admin';

  const [search, setSearch]         = useState('');
  const [filter, setFilter]         = useState<FilterKey>('all');
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

  const groups = useMemo(() => {
    let list = wfs.filter((w) => w.status === 'received');

    if (filter === 'draft') {
      list = list.filter((w) => w.hasDraft);
    } else if (filter === 'in_progress') {
      list = list.filter((w) => {
        if (!w.lockedBy || !w.lockedAt) return false;
        return (Date.now() - new Date(w.lockedAt).getTime()) / 60000 < 15;
      });
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

  const sortedMsgs = [...msgs].sort(
    (a, b) => new Date(a.receivedAt ?? 0).getTime() - new Date(b.receivedAt ?? 0).getTime()
  );
  const firstMsg = sortedMsgs[0] ?? null;
  const ccList   = firstMsg?.ccRecipients?.map((r) => r.emailAddress.address).join(', ');

  return (
    <div className="flex flex-col flex-1 overflow-hidden">
      <SplitPanel
        defaultSideW={360}
        minSideW={280}
        maxSideW={720}
        main={
          <>
            <div className="px-5 py-3.5 border-b border-ce-border flex items-center justify-between flex-shrink-0 bg-white">
              <div>
                <div className="text-[16px] font-semibold text-ce-navy">Pending review</div>
                <div className="text-[12.5px] text-ce-muted mt-0.5">
                  {groups.length} conversation{groups.length !== 1 ? 's' : ''} — click to preview and assign
                </div>
              </div>
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

            <div className="px-5 py-2 border-b border-ce-border flex gap-1.5 flex-shrink-0 bg-white">
              {FILTERS.map((f) => (
                <button
                  key={f.key}
                  onClick={() => setFilter(f.key)}
                  className={cn(
                    'px-3 py-1 rounded-full text-[12px] font-medium border transition-all',
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
                <div className="text-center text-ce-muted py-16 text-[13px]">No pending review emails</div>
              ) : (
                <div className="divide-y divide-ce-border">
                  {groups.map((group) => {
                    const isSelWf = selected?.workflowId === group.workflowId;
                    const hasNew = group.hasNewMessage;
                    const lockAgeMin = group.lockedAt
                      ? (Date.now() - new Date(group.lockedAt).getTime()) / 60000
                      : 999;
                    const isBeingEdited = !!group.lockedBy && lockAgeMin < 15;
                    const isDraft = group.hasDraft && !isBeingEdited;
                    const draftEditor = formatDraftEditor(group.draftEditorName ?? null);
                    const msgCount = group.messageCount;

                    return (
                      <div
                        key={group.workflowId}
                        onClick={() => handleSelect(group)}
                        className={cn(
                          'flex items-center gap-3 px-5 py-3.5 cursor-pointer transition-colors',
                          isSelWf
                            ? 'bg-ce-bg border-l-2 border-ce-navy'
                            : 'hover:bg-ce-bg/60',
                        )}
                      >
                        {/* Icon with new-message dot */}
                        <div className="flex-shrink-0 w-7 flex items-center justify-center relative">
                          <Mail size={14} className="text-ce-muted" />
                          {hasNew && (
                            <span className="absolute -top-1 -right-1 w-2 h-2 rounded-full bg-blue-500 ring-2 ring-white" />
                          )}
                        </div>

                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 mb-0.5">
                            <span className="text-[13px] font-semibold text-ce-navy font-mono flex-shrink-0">
                              {group.workflowId}
                            </span>
                            <span className="text-[13px] font-medium text-ce-text truncate">
                              {group.supplierName || group.firstSenderName || 'Unknown sender'}
                            </span>
                            {msgCount > 1 && (
                              <span className="flex-shrink-0 flex items-center gap-0.5 bg-ce-navy/10 text-ce-navy text-[11px] font-semibold px-1.5 py-0.5 rounded-full">
                                <MessageSquare size={9} /> {msgCount}
                              </span>
                            )}
                            {isDraft && (
                              <span className="flex-shrink-0 flex items-center gap-1 bg-sky-50 text-sky-600 border border-sky-200 text-[11px] font-semibold px-1.5 py-0.5 rounded-full">
                                <BookOpen size={9} />
                                Draft{draftEditor ? ` · ${draftEditor}` : ''}
                              </span>
                            )}
                            {isBeingEdited && (
                              <span className="flex-shrink-0 flex items-center gap-1 bg-amber-100 text-amber-700 text-[11px] font-semibold px-1.5 py-0.5 rounded-full">
                                <Pencil size={9} />
                                In progress
                              </span>
                            )}
                          </div>
                          <div className="text-[12px] text-ce-muted truncate">
                            {group.firstSubject || '(no subject)'}
                          </div>
                        </div>

                        <div className="flex-shrink-0 text-right">
                          <div className="text-[12px] text-ce-muted">
                            {formatDate(group.firstReceivedAt, { day: 'numeric', month: 'short' })}
                          </div>
                          <div className="text-[11px] text-ce-hint mt-0.5">{relTime(group.firstReceivedAt)}</div>
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
            <PanelEmpty message="Select an email to preview and assign" />
          ) : (
            <div className="flex flex-col h-full overflow-hidden">
              <PanelHeader
                wfId={selected.workflowId ?? undefined}
                title={selected.supplierName || firstMsg?.senderName || 'Unknown'}
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
                        {msgs.length > 0 && (
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

                    <PanelSection label="Assign this email">
                      <div className="grid grid-cols-2 gap-1.5">
                        <button
                          onClick={() => selected.workflowId && router.push(`/workflows/${selected.workflowId}?from=/inbox`)}
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
                  </PanelBody>

                  <PanelFooter>
                    <button
                      onClick={() => selected.workflowId && router.push(`/workflows/${selected.workflowId}?from=/inbox`)}
                      className="w-full bg-ce-navy text-white text-[13px] font-medium py-2 rounded-lg hover:bg-ce-navy2 transition-colors flex items-center justify-center gap-1.5"
                    >
                      <FileText size={13} /> Open SES form
                    </button>
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

function relTime(dateStr: string | null | undefined): string {
  if (!dateStr) return '';
  const days = daysSince(dateStr);
  if (days === null) return '';
  if (days === 0) {
    const hrs = Math.floor((Date.now() - new Date(dateStr).getTime()) / 3_600_000);
    return hrs <= 0 ? 'Just now' : `${hrs}h ago`;
  }
  if (days === 1) return 'Yesterday';
  return `${days} days ago`;
}

'use client';

import { useState, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import { Search, FileText } from 'lucide-react';
import { useQuery } from '@tanstack/react-query';
import { emailsApi, attachmentsApi, othersApi, workflowsApi } from '@/lib/api';
import { useQueryClient } from '@tanstack/react-query';
import { useToast } from '@/components/ui/Toast';
import { SplitPanel, PanelHeader, PanelBody, PanelFooter, PanelSection, MetaRow, PanelEmpty } from '@/components/ui/SplitPanel';
import { AttachmentChip, AttachmentSidebarView } from '@/components/ui/AttachmentPreview';
import { PageSpinner } from '@/components/ui/Spinner';
import { formatDate, formatDateTime, daysSince, cn } from '@/lib/utils';
import type { ThreadMessage, Attachment } from '@/types';

const ASSIGN_TYPES = ['Change order', 'PO top-up', 'PR', 'General enquiry', 'AP', 'Other'];

export default function InboxPage() {
  const router = useRouter();
  const qc = useQueryClient();
  const { success, error: toastError } = useToast();
  const [search, setSearch]         = useState('');
  const [selected, setSelected]     = useState<ThreadMessage | null>(null);
  const [previewAtt, setPreviewAtt] = useState<Attachment | null>(null);
  const [assigning, setAssigning]   = useState(false);

  const { data, isLoading } = useQuery({
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

  const emails = useMemo(() => {
    const all = (data?.emails ?? []).filter((e) => e.status === 'received');
    if (!search.trim()) return all;
    const q = search.toLowerCase();
    return all.filter(
      (e) =>
        e.subject?.toLowerCase().includes(q) ||
        e.senderEmail?.toLowerCase().includes(q) ||
        e.senderName?.toLowerCase().includes(q) ||
        e.supplierName?.toLowerCase().includes(q),
    );
  }, [data, search]);

  if (isLoading) return <PageSpinner />;

  const handleSelect = (email: ThreadMessage) => {
    setSelected(email);
    setPreviewAtt(null);
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
        await workflowsApi.setStatus(selected.workflowId, 'other');
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
      window.open(
        `/preview/${selected.workflowId}`,
        '_blank',
        'width=860,height=960,resizable=yes',
      );
    }
  };

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
                  {emails.length} email{emails.length !== 1 ? 's' : ''} — click to preview and assign
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

            <div className="flex-1 overflow-auto">
              <table className="w-full border-collapse" style={{ tableLayout: 'fixed' }}>
                <thead className="ce-thead">
                  <tr>
                    <th style={{ width: 150 }}>Workflow ID</th>
                    <th style={{ width: 180 }}>Sender</th>
                    <th>Subject</th>
                    <th style={{ width: 130 }}>Date &amp; time</th>
                  </tr>
                </thead>
                <tbody className="ce-tbody">
                  {emails.length === 0 && (
                    <tr>
                      <td colSpan={4} className="text-center text-ce-muted py-16 text-[13px]">
                        No pending review emails
                      </td>
                    </tr>
                  )}
                  {emails.map((email) => (
                    <tr
                      key={email.id}
                      className={cn('ce-row', selected?.id === email.id && 'selected')}
                      onClick={() => handleSelect(email)}
                    >
                      <td className="font-semibold text-ce-navy">
                        {email.workflowId ?? '—'}
                      </td>
                      <td className="text-ce-muted text-[12px]">{email.senderEmail || '—'}</td>
                      <td>{email.subject || '(no subject)'}</td>
                      <td>
                        <div className="text-[13px]">{formatDate(email.receivedAt, { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}</div>
                        <div className="text-[11.5px] text-ce-hint">{relTime(email.receivedAt)}</div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
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
                title={selected.supplierName || selected.senderName || 'Unknown'}
                subtitle={selected.subject ?? undefined}
                onPopout={selected.workflowId ? handlePopout : undefined}
              />

              {/* When an attachment is selected, replace body with inline viewer */}
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
                      {selected.ccRecipients && selected.ccRecipients.length > 0 && (
                        <MetaRow label="CC" value={selected.ccRecipients.map((r) => r.emailAddress.address).join(', ')} />
                      )}
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
                  </PanelBody>

                  <PanelFooter>
                    <button
                      onClick={() => selected.workflowId && router.push(`/workflows/${selected.workflowId}`)}
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

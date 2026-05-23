'use client';

import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import { useAuth } from '@/components/providers/AuthProvider';
import { workflowsApi, attachmentsApi, sesApi, sesDocumentsApi } from '@/lib/api';
import { AttachmentViewer, AttachmentChip } from '@/components/ui/AttachmentPreview';
import { formatDateTime, formatDate } from '@/lib/utils';
import type { Attachment, ThreadMessage, FormVersion, SesDocument } from '@/types';
import { FileText, FileSearch, Mail, Clock } from 'lucide-react';
import { cn } from '@/lib/utils';

type Tab = 'email' | 'audit' | 'preview' | 'docs';

export default function ReferencePage() {
  const { workflowId } = useParams<{ workflowId: string }>();
  const router = useRouter();
  const { isAuthenticated, isLoading } = useAuth();
  const [activeTab, setActiveTab]   = useState<Tab>('email');
  const [previewAtt, setPreviewAtt] = useState<Attachment | null>(null);
  const [activeDocIdx, setActiveDocIdx] = useState(0);

  const { data: msgData } = useQuery({
    queryKey: ['workflow-messages', workflowId],
    queryFn:  () => workflowsApi.getMessages(workflowId),
    enabled:  !!workflowId && isAuthenticated,
  });

  const { data: attData } = useQuery({
    queryKey: ['attachments', 'workflow', workflowId],
    queryFn:  () => attachmentsApi.byWorkflow(workflowId),
    enabled:  !!workflowId && isAuthenticated,
  });

  const { data: formData } = useQuery({
    queryKey: ['ses', 'workflow', workflowId],
    queryFn:  () => sesApi.byWorkflow(workflowId),
    enabled:  !!workflowId && isAuthenticated,
  });

  const { data: versionsData } = useQuery({
    queryKey: ['ses-versions', formData?.form?.id],
    queryFn:  () => sesApi.versions(formData!.form.id),
    enabled:  !!formData?.form?.id && isAuthenticated,
  });

  const { data: sesDocsData } = useQuery({
    queryKey: ['ses-documents', workflowId],
    queryFn:  () => sesDocumentsApi.listByWorkflow(workflowId),
    enabled:  !!workflowId && isAuthenticated,
  });

  useEffect(() => {
    if (!isLoading && !isAuthenticated) router.replace('/login');
  }, [isAuthenticated, isLoading, router]);

  if (isLoading || !isAuthenticated) return null;

  const messages: ThreadMessage[]   = msgData?.messages ?? [];
  const attachments: Attachment[]   = attData?.attachments ?? [];
  const versions: FormVersion[]     = versionsData?.versions ?? [];
  const sesDocuments: SesDocument[] = sesDocsData?.documents ?? [];
  const latest = messages[messages.length - 1] ?? null;

  return (
    <div className="h-screen flex flex-col bg-white overflow-hidden" style={{ fontFamily: 'Inter, system-ui, sans-serif' }}>

      {/* Top bar */}
      <div className="flex items-center gap-3 px-5 py-3 bg-[#1F3864] flex-shrink-0">
        <div className="min-w-0 flex-1">
          <div className="text-white/50 text-[11px] font-medium">{workflowId}</div>
          <div className="text-white text-[14px] font-semibold leading-snug truncate">
            {latest?.supplierName || latest?.senderName || 'Reference panel'}
          </div>
        </div>
        <div className="text-white/40 text-[11px]">
          {messages.length} message{messages.length !== 1 ? 's' : ''} · {attachments.length} file{attachments.length !== 1 ? 's' : ''}
        </div>
      </div>

      {/* Tab strip */}
      <div className="flex border-b border-gray-200 flex-shrink-0 bg-white">
        {([
          { id: 'email',   label: 'Email',        icon: Mail },
          { id: 'audit',   label: 'Audit trail',  icon: Clock },
          { id: 'preview', label: 'Attachments',  icon: FileText },
          { id: 'docs',    label: 'Preview docs', icon: FileSearch },
        ] as { id: Tab; label: string; icon: React.ElementType }[]).map(({ id, label, icon: Icon }) => (
          <button
            key={id}
            onClick={() => setActiveTab(id)}
            className={cn(
              'flex items-center gap-1.5 px-5 py-3 text-[13px] font-medium border-b-2 -mb-px transition-all',
              activeTab === id
                ? 'text-[#1F3864] border-[#1F3864]'
                : 'text-gray-500 border-transparent hover:text-gray-700',
            )}
          >
            <Icon size={13} /> {label}
          </button>
        ))}
      </div>

      {/* Body */}
      <div className="flex flex-1 min-h-0 overflow-hidden">

        {/* ── Email tab ── */}
        {activeTab === 'email' && (
          latest ? (
            <div className="flex-1 overflow-y-auto p-5 flex flex-col gap-4">
              {/* Meta */}
              <div className="bg-gray-50 border border-gray-200 rounded-lg p-4 flex flex-col gap-1.5">
                <MetaRow label="From"     value={latest.senderEmail} />
                <MetaRow label="To"       value={latest.toRecipients?.map((r) => r.emailAddress.address).join(', ')} />
                <MetaRow label="Subject"  value={latest.subject} />
                <MetaRow label="Received" value={formatDateTime(latest.receivedAt)} />
              </div>

              {/* Body */}
              <div>
                <SectionHead>Message body</SectionHead>
                <div className="bg-gray-50 border border-gray-200 rounded-lg p-4 text-[13px] text-gray-800 leading-relaxed whitespace-pre-wrap max-h-[300px] overflow-y-auto">
                  {latest.bodyPreview ?? '(no body preview available)'}
                </div>
              </div>

              {/* Thread */}
              {messages.length > 1 && (
                <div>
                  <SectionHead>Thread ({messages.length} messages)</SectionHead>
                  <div className="flex flex-col gap-2">
                    {messages.map((m, i) => (
                      <div key={m.id} className="flex items-start gap-2.5 bg-gray-50 border border-gray-200 rounded-lg p-3 text-[12.5px]">
                        <span className="text-gray-400 font-medium flex-shrink-0 mt-0.5">{i + 1}.</span>
                        <div className="min-w-0">
                          <div className="font-medium text-gray-800 truncate">{m.subject || '(no subject)'}</div>
                          <div className="text-gray-500 mt-0.5">{m.senderEmail} · {formatDateTime(m.receivedAt)}</div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          ) : (
            <EmptyState icon={Mail} message="No email thread found for this workflow." />
          )
        )}

        {/* ── Audit trail tab ── */}
        {activeTab === 'audit' && (
          versions.length > 0 ? (
            <div className="flex-1 overflow-y-auto p-5">
              <div className="relative">
                <div className="absolute left-[5px] top-0 bottom-0 w-px bg-gray-200" />
                {versions.map((v) => (
                  <div key={v.id} className="flex gap-4 mb-5 relative">
                    <div className="w-3 h-3 rounded-full bg-amber-400 border-2 border-white flex-shrink-0 mt-1 z-10 shadow-sm" />
                    <div className="min-w-0 bg-gray-50 border border-gray-200 rounded-lg px-3 py-2.5 flex-1">
                      <div className="text-[13px] font-semibold text-[#1F3864]">Version {v.versionNumber}</div>
                      <div className="text-[12px] text-gray-600 mt-0.5">{v.createdByName}</div>
                      <div className="text-[11.5px] text-gray-400 mt-0.5">
                        {v.createdAt ? formatDate(v.createdAt, { day: 'numeric', month: 'short', year: 'numeric' }) : ''}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ) : (
            <EmptyState icon={FileSearch} message="No form versions recorded yet." />
          )
        )}

        {/* ── Preview docs tab ── */}
        {activeTab === 'docs' && (
          sesDocuments.length > 0 ? (
            <div className="flex flex-1 min-h-0 overflow-hidden">
              {sesDocuments.length > 1 && (
                <div className="w-[200px] flex-shrink-0 border-r border-gray-200 flex flex-col overflow-hidden">
                  <div className="p-3 border-b border-gray-200">
                    <SectionHead>{sesDocuments.length} merged doc{sesDocuments.length !== 1 ? 's' : ''}</SectionHead>
                  </div>
                  <div className="flex-1 overflow-y-auto p-3 flex flex-col gap-1.5">
                    {sesDocuments.map((doc, i) => (
                      <button
                        key={doc.id}
                        onClick={() => setActiveDocIdx(i)}
                        className={cn(
                          'w-full text-left px-3 py-2 rounded-lg text-[12.5px] transition-colors',
                          activeDocIdx === i
                            ? 'bg-[#1F3864] text-white'
                            : 'bg-gray-50 text-gray-700 hover:bg-gray-100',
                        )}
                      >
                        Form {doc.formIndex + 1}
                      </button>
                    ))}
                  </div>
                </div>
              )}
              <div className="flex-1 flex flex-col min-w-0">
                <iframe
                  key={sesDocuments[activeDocIdx]?.id}
                  src={sesDocumentsApi.previewUrl(sesDocuments[activeDocIdx]?.id ?? '')}
                  className="flex-1 w-full border-0"
                  title="Merged SES document"
                />
              </div>
            </div>
          ) : (
            <EmptyState icon={FileSearch} message="No merged preview document yet. Generate one from the SES form." />
          )
        )}

        {/* ── Attachments / preview tab ── */}
        {activeTab === 'preview' && (
          attachments.length > 0 ? (
            <div className="flex flex-1 min-h-0 overflow-hidden">
              {/* List */}
              <div className="w-[260px] flex-shrink-0 border-r border-gray-200 flex flex-col overflow-hidden">
                <div className="p-3 border-b border-gray-200">
                  <SectionHead>{attachments.length} attachment{attachments.length !== 1 ? 's' : ''}</SectionHead>
                </div>
                <div className="flex-1 overflow-y-auto p-3 flex flex-col gap-1.5">
                  {attachments.map((att) => (
                    <AttachmentChip
                      key={att.id}
                      att={att}
                      selected={previewAtt?.id === att.id}
                      onClick={() => setPreviewAtt(previewAtt?.id === att.id ? null : att)}
                    />
                  ))}
                </div>
              </div>
              {/* Viewer */}
              <div className="flex-1 flex flex-col min-w-0 bg-gray-50">
                {previewAtt ? (
                  <AttachmentViewer attachment={previewAtt} className="flex-1" />
                ) : (
                  <div className="flex-1 flex flex-col items-center justify-center gap-2 text-center p-8">
                    <FileText size={32} className="text-gray-300" />
                    <div className="text-[14px] font-medium text-gray-700">Select an attachment to preview</div>
                    <div className="text-[12px] text-gray-400">Click any file in the list on the left</div>
                  </div>
                )}
              </div>
            </div>
          ) : (
            <EmptyState icon={FileText} message="No attachments on this workflow." />
          )
        )}
      </div>
    </div>
  );
}

function MetaRow({ label, value }: { label: string; value?: string | null }) {
  return (
    <div className="flex gap-2 text-[13px]">
      <span className="text-gray-500 min-w-[64px] font-medium flex-shrink-0">{label}</span>
      <span className="text-gray-800 break-words leading-snug">{value ?? '—'}</span>
    </div>
  );
}

function SectionHead({ children }: { children: React.ReactNode }) {
  return (
    <div className="text-[11px] font-bold text-gray-400 uppercase tracking-[0.6px] mb-2">{children}</div>
  );
}

function EmptyState({ icon: Icon, message }: { icon: React.ElementType; message: string }) {
  return (
    <div className="flex-1 flex flex-col items-center justify-center gap-2 text-center p-8">
      <Icon size={28} className="text-gray-300" />
      <p className="text-[13px] text-gray-500">{message}</p>
    </div>
  );
}

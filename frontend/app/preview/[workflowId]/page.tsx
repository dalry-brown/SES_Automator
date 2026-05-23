'use client';

import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { workflowsApi, attachmentsApi } from '@/lib/api';
import { AttachmentViewer, AttachmentChip } from '@/components/ui/AttachmentPreview';
import { formatDateTime } from '@/lib/utils';
import type { Attachment, ThreadMessage } from '@/types';

export default function PreviewPage({ params }: { params: { workflowId: string } }) {
  const { workflowId } = params;
  const [activeAtt, setActiveAtt] = useState<Attachment | null>(null);

  const { data: msgData, isLoading: msgLoading } = useQuery({
    queryKey: ['workflow-messages', workflowId],
    queryFn:  () => workflowsApi.getMessages(workflowId),
  });

  const { data: attData } = useQuery({
    queryKey: ['attachments', 'workflow', workflowId],
    queryFn:  () => attachmentsApi.byWorkflow(workflowId),
  });

  const messages: ThreadMessage[] = msgData?.messages ?? [];
  const attachments: Attachment[] = attData?.attachments ?? [];
  const latest = messages[messages.length - 1] ?? null;

  if (msgLoading) {
    return (
      <div className="h-screen flex items-center justify-center text-[13px] text-ce-muted bg-ce-bg">
        Loading…
      </div>
    );
  }

  const wfLabel = workflowId;

  return (
    <div className="h-screen flex flex-col bg-white overflow-hidden" style={{ fontFamily: 'Inter, system-ui, sans-serif' }}>
      {/* Top bar */}
      <div className="flex items-center gap-3 px-5 py-3.5 bg-ce-navy flex-shrink-0">
        <div className="min-w-0 flex-1">
          <div className="text-white/50 text-[11px] font-medium">{wfLabel}</div>
          <div className="text-white text-[15px] font-semibold leading-snug truncate">
            {latest?.supplierName || latest?.senderName || 'Email preview'}
          </div>
        </div>
        <div className="text-white/40 text-[11px]">
          {messages.length} message{messages.length !== 1 ? 's' : ''} · {attachments.length} attachment{attachments.length !== 1 ? 's' : ''}
        </div>
      </div>

      <div className="flex flex-1 min-h-0 overflow-hidden">
        {/* Left: email detail panel */}
        <div className="w-[320px] flex-shrink-0 border-r border-ce-border flex flex-col overflow-hidden">
          {/* Email meta */}
          <div className="flex-shrink-0 p-4 border-b border-ce-border">
            <div className="text-[11px] font-semibold text-ce-muted uppercase tracking-[0.5px] mb-2">Email details</div>
            <MetaRow label="From"     value={latest?.senderEmail} />
            <MetaRow label="To"       value={latest?.toRecipients?.map((r) => r.emailAddress.address).join(', ')} />
            <MetaRow label="Subject"  value={latest?.subject} />
            <MetaRow label="Received" value={formatDateTime(latest?.receivedAt)} />
          </div>

          {/* Body preview */}
          <div className="flex-shrink-0 p-4 border-b border-ce-border">
            <div className="text-[11px] font-semibold text-ce-muted uppercase tracking-[0.5px] mb-2">Body</div>
            <div className="bg-ce-bg rounded-lg p-2.5 text-[13px] text-ce-text leading-relaxed max-h-[140px] overflow-y-auto whitespace-pre-wrap border border-ce-border">
              {latest?.bodyPreview ?? '(no body preview)'}
            </div>
          </div>

          {/* Thread (multiple messages) */}
          {messages.length > 1 && (
            <div className="flex-shrink-0 p-4 border-b border-ce-border">
              <div className="text-[11px] font-semibold text-ce-muted uppercase tracking-[0.5px] mb-2">Thread ({messages.length})</div>
              <div className="flex flex-col gap-1.5">
                {messages.map((m, i) => (
                  <div key={m.id} className="flex items-start gap-2 text-[12px]">
                    <span className="text-ce-hint flex-shrink-0">{i + 1}.</span>
                    <div className="min-w-0">
                      <div className="text-ce-text font-medium truncate">{m.subject || '(no subject)'}</div>
                      <div className="text-ce-muted">{m.senderEmail} · {formatDateTime(m.receivedAt)}</div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Attachments list */}
          {attachments.length > 0 && (
            <div className="flex-1 overflow-y-auto p-4">
              <div className="text-[11px] font-semibold text-ce-muted uppercase tracking-[0.5px] mb-2">
                Attachments ({attachments.length})
              </div>
              <div className="flex flex-col gap-1.5">
                {attachments.map((att) => (
                  <AttachmentChip
                    key={att.id}
                    att={att}
                    selected={activeAtt?.id === att.id}
                    onClick={() => setActiveAtt(activeAtt?.id === att.id ? null : att)}
                  />
                ))}
              </div>
            </div>
          )}

          {attachments.length === 0 && (
            <div className="flex-1 flex items-center justify-center text-[13px] text-ce-muted p-4">
              No attachments
            </div>
          )}
        </div>

        {/* Right: attachment viewer */}
        <div className="flex-1 flex flex-col min-w-0 bg-ce-bg">
          {activeAtt ? (
            <AttachmentViewer attachment={activeAtt} className="flex-1" />
          ) : (
            <div className="flex-1 flex flex-col items-center justify-center text-center p-8 gap-2">
              <div className="text-[32px]">📎</div>
              <div className="text-[14px] font-medium text-ce-navy">
                {attachments.length > 0
                  ? 'Select an attachment to preview'
                  : 'No attachments on this email'}
              </div>
              <div className="text-[12px] text-ce-muted max-w-[240px]">
                {attachments.length > 0
                  ? 'Click any file in the list on the left'
                  : 'Email content is shown in the panel on the left'}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function MetaRow({ label, value }: { label: string; value?: string | null }) {
  return (
    <div className="flex gap-2 mb-1.5 text-[12.5px]">
      <span className="text-ce-muted min-w-[56px] font-medium flex-shrink-0">{label}</span>
      <span className="text-ce-text break-words leading-snug">{value ?? '—'}</span>
    </div>
  );
}

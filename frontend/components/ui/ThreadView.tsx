'use client';

import { useState, useEffect, useRef, useMemo } from 'react';
import { Send, X } from 'lucide-react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { workflowsApi } from '@/lib/api';
import { useAuth } from '@/components/providers/AuthProvider';
import { useToast } from '@/components/ui/Toast';
import { formatDateTime, cn } from '@/lib/utils';
import type { ThreadMessage, WorkflowStatus } from '@/types';

interface ThreadViewProps {
  messages?: ThreadMessage[];
  workflowId: string;
  canReply?: boolean;
}

function MessageBubble({ msg, highlighted }: { msg: ThreadMessage; highlighted: boolean }) {
  const [expanded, setExpanded] = useState(false);
  const isOut = msg.isOutbound;
  const initial = (msg.senderName || msg.senderEmail || '?')[0].toUpperCase();

  return (
    <div className={cn('flex', isOut ? 'justify-end' : 'justify-start')}>
      <div
        className={cn(
          'max-w-[80%] rounded-xl border p-3 transition-all duration-700',
          isOut
            ? 'bg-[#1b3a6b]/5 border-[#1b3a6b]/20'
            : 'bg-white border-slate-200',
          highlighted && !isOut && 'ring-2 ring-blue-400 border-blue-300',
        )}
      >
        {/* Header */}
        <div className="flex items-start justify-between gap-2 mb-2">
          <div className="flex items-center gap-2 min-w-0">
            <div className={cn(
              'w-6 h-6 rounded-full flex items-center justify-center text-[10px] font-bold flex-shrink-0',
              isOut ? 'bg-[#1b3a6b] text-white' : 'bg-slate-100 text-slate-600',
            )}>
              {initial}
            </div>
            <div className="min-w-0">
              <span className="text-[12px] font-semibold text-slate-700">
                {isOut ? 'You' : (msg.senderName || msg.senderEmail || 'Unknown')}
              </span>
              {!isOut && msg.senderName && msg.senderEmail && (
                <span className="text-[10.5px] text-slate-400 ml-1 hidden sm:inline truncate">
                  &lt;{msg.senderEmail}&gt;
                </span>
              )}
            </div>
          </div>
          <div className="flex items-center gap-1.5 flex-shrink-0">
            {msg.isNew && (
              <span className="text-[9.5px] font-bold text-blue-600 bg-blue-50 border border-blue-200 px-1.5 py-0.5 rounded-full">
                NEW
              </span>
            )}
            <span className="text-[10.5px] text-slate-400 whitespace-nowrap">
              {formatDateTime(msg.receivedAt)}
            </span>
          </div>
        </div>

        {/* Body */}
        <div className="text-[12.5px] text-slate-600 leading-relaxed pl-8">
          {expanded && msg.bodyHtml ? (
            <div
              className="prose prose-sm max-w-none text-slate-600"
              dangerouslySetInnerHTML={{ __html: msg.bodyHtml }}
            />
          ) : (
            <p className={cn(!expanded && 'line-clamp-4')}>
              {msg.bodyPreview || '(no preview available)'}
            </p>
          )}
          {(msg.bodyHtml || (msg.bodyPreview && msg.bodyPreview.length > 200)) && (
            <button
              onClick={() => setExpanded((p) => !p)}
              className="text-[11px] text-[#1b3a6b] hover:underline mt-1.5 block"
            >
              {expanded ? 'Show less ↑' : 'Read more ↓'}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

export function ThreadView({ messages: initialMessages = [], workflowId, canReply = false }: ThreadViewProps) {
  const qc   = useQueryClient();
  const { user } = useAuth();
  const { success, error: toastError } = useToast();
  const [replyText, setReplyText]   = useState('');
  const [showReply, setShowReply]   = useState(false);
  const [localMessages, setLocalMessages] = useState<ThreadMessage[]>([]);
  const bottomRef = useRef<HTMLDivElement>(null);

  // Own fetch so the thread always has fresh data (shared cache key with parent queries)
  const { data: fetchedData } = useQuery({
    queryKey: ['messages', workflowId],
    queryFn:  () => workflowsApi.getMessages(workflowId),
    // Use parent-supplied messages as instant initial data — no loading flicker
    initialData: initialMessages.length > 0 ? { messages: initialMessages } : undefined,
    staleTime: 0,
  });
  const serverMessages: ThreadMessage[] = fetchedData?.messages ?? initialMessages;

  // IDs of new messages captured on mount — drives the highlight ring
  const [highlightedIds] = useState<Set<string>>(
    () => new Set(initialMessages.filter((m) => m.isNew).map((m) => m.id))
  );

  // Mark read once on open if any new messages exist
  useEffect(() => {
    const hasNew = initialMessages.some((m) => m.isNew);
    if (!hasNew) return;
    workflowsApi.markRead(workflowId)
      .then(() => {
        qc.invalidateQueries({ queryKey: ['workflows'] });
        qc.invalidateQueries({ queryKey: ['emails'] });
        qc.invalidateQueries({ queryKey: ['messages', workflowId] });
      })
      .catch(() => {});
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [workflowId]);

  // Merge server + optimistic messages.
  // Deduplicate: remove a local message once the same outbound content arrives from server.
  const allMessages = useMemo(() => {
    const serverOutboundPreviews = new Set(
      serverMessages
        .filter((m) => m.isOutbound)
        .map((m) => m.bodyPreview?.trim())
        .filter(Boolean)
    );
    const filteredLocal = localMessages.filter(
      (m) => !serverOutboundPreviews.has(m.bodyPreview?.trim() ?? '')
    );
    return [...serverMessages, ...filteredLocal].sort((a, b) => {
      const ta = a.receivedAt ? new Date(a.receivedAt).getTime() : 0;
      const tb = b.receivedAt ? new Date(b.receivedAt).getTime() : 0;
      return ta - tb;
    });
  }, [serverMessages, localMessages]);

  // Scroll to bottom whenever message list grows
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [allMessages.length]);

  const replyMutation = useMutation({
    mutationFn: (comment: string) => workflowsApi.replyToVendor(workflowId, comment),
    onSuccess: (_data, comment) => {
      // Instantly show the sent message — no waiting for refetch
      setLocalMessages((prev) => [
        ...prev,
        {
          id:            `local-${Date.now()}`,
          workflowId,
          messageId:     `out-local-${Date.now()}`,
          conversationId: '',
          senderEmail:   user?.email ?? null,
          senderName:    user?.name ?? null,
          subject:       null,
          bodyPreview:   comment,
          bodyHtml:      null,
          toRecipients:  null,
          ccRecipients:  null,
          receivedAt:    new Date().toISOString(),
          supplierName:  null,
          status:        'received' as WorkflowStatus,
          statusLabel:   'Received',
          isNew:         false,
          isOutbound:    true,
        },
      ]);
      success('Reply sent to vendor.');
      setReplyText('');
      setShowReply(false);
      // Refetch — real outbound message replaces the optimistic one via deduplication
      qc.invalidateQueries({ queryKey: ['messages', workflowId] });
      qc.invalidateQueries({ queryKey: ['emails'] });
    },
    onError: (err: unknown) => {
      toastError(err instanceof Error ? err.message : 'Failed to send reply');
    },
  });

  const handleSend = () => {
    if (!replyText.trim() || replyMutation.isPending) return;
    replyMutation.mutate(replyText.trim());
  };

  if (allMessages.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center flex-1 py-12 text-ce-muted">
        <p className="text-[13px]">No email messages yet</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full overflow-hidden">
      {/* Message list — oldest at top, newest at bottom */}
      <div className="flex-1 overflow-y-auto px-4 py-3 space-y-3 bg-slate-50">
        {allMessages.map((msg) => (
          <MessageBubble
            key={msg.id}
            msg={msg}
            highlighted={highlightedIds.has(msg.id)}
          />
        ))}
        <div ref={bottomRef} />
      </div>

      {/* Reply composer */}
      {canReply && (
        <div className="flex-shrink-0 border-t border-slate-200 bg-white">
          {showReply ? (
            <div className="p-3 space-y-2">
              <div className="flex items-center justify-between mb-1">
                <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">
                  Reply to vendor
                </p>
                <button
                  onClick={() => { setShowReply(false); setReplyText(''); }}
                  className="text-slate-300 hover:text-slate-500 transition-colors"
                >
                  <X size={13} />
                </button>
              </div>
              <textarea
                autoFocus
                rows={4}
                value={replyText}
                onChange={(e) => setReplyText(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) handleSend();
                }}
                placeholder="Type your reply to the vendor…"
                className="w-full rounded-lg border border-slate-200 px-3 py-2 text-[12.5px] outline-none resize-none focus:border-[#1b3a6b] focus:ring-2 focus:ring-[#1b3a6b]/10 transition-all text-slate-700 placeholder:text-slate-400"
              />
              <div className="flex items-center justify-between">
                <p className="text-[10.5px] text-slate-400">Ctrl+Enter to send</p>
                <button
                  onClick={handleSend}
                  disabled={!replyText.trim() || replyMutation.isPending}
                  className="flex items-center gap-1.5 bg-[#1b3a6b] text-white text-[12px] font-semibold px-3 py-1.5 rounded-lg hover:bg-[#162d56] transition-colors disabled:opacity-40"
                >
                  {replyMutation.isPending ? (
                    <><div className="h-3 w-3 rounded-full border-2 border-white border-t-transparent animate-spin" /> Sending…</>
                  ) : (
                    <><Send size={11} /> Send reply</>
                  )}
                </button>
              </div>
            </div>
          ) : (
            <div className="px-4 py-2.5">
              <button
                onClick={() => setShowReply(true)}
                className="w-full flex items-center justify-center gap-1.5 text-[12px] font-medium text-[#1b3a6b] border border-[#1b3a6b]/30 bg-[#1b3a6b]/5 hover:bg-[#1b3a6b]/10 rounded-lg py-2 transition-colors"
              >
                <Send size={12} /> Reply to vendor
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

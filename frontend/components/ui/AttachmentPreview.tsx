'use client';

import { useEffect, useState } from 'react';
import { X, ChevronLeft, Download } from 'lucide-react';
import { getStoredToken } from '@/lib/auth';
import { cn } from '@/lib/utils';
import type { Attachment } from '@/types';

const PREVIEWABLE = new Set([
  'application/pdf',
  'image/jpeg',
  'image/png',
  'image/gif',
  'image/webp',
  'image/svg+xml',
  'image/bmp',
  'text/plain',
  'text/csv',
]);

function isPreviewable(mimeType: string | null | undefined): boolean {
  if (!mimeType) return false;
  if (PREVIEWABLE.has(mimeType)) return true;
  if (mimeType.startsWith('image/')) return true;
  return false;
}

const API = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000';

function triggerDownload(blobUrl: string, fileName: string) {
  const a = document.createElement('a');
  a.href = blobUrl;
  a.download = fileName;
  a.click();
}

export function useAttachmentBlob(attachmentId: string | undefined) {
  const [blobUrl, setBlobUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError]     = useState(false);

  useEffect(() => {
    if (!attachmentId) { setBlobUrl(null); return; }
    let revoked = false;
    let url: string | null = null;

    setLoading(true);
    setError(false);

    const token = getStoredToken();
    fetch(`${API}/api/attachments/${attachmentId}`, {
      headers: token ? { Authorization: `Bearer ${token}` } : {},
    })
      .then((r) => {
        if (!r.ok) throw new Error('Failed');
        return r.blob();
      })
      .then((blob) => {
        if (revoked) return;
        url = URL.createObjectURL(blob);
        setBlobUrl(url);
        setLoading(false);
      })
      .catch(() => {
        if (!revoked) { setError(true); setLoading(false); }
      });

    return () => {
      revoked = true;
      if (url) URL.revokeObjectURL(url);
      setBlobUrl(null);
    };
  }, [attachmentId]);

  return { blobUrl, loading, error };
}

/* ── Sidebar-embedded viewer ────────────────────────────────────────────────
   Fills all available height within the sidebar. Shown instead of the
   email detail body when an attachment chip is clicked.
────────────────────────────────────────────────────────────────────────── */
interface SidebarViewProps {
  attachment: Attachment;
  onClose: () => void;
}

export function AttachmentSidebarView({ attachment, onClose }: SidebarViewProps) {
  const { blobUrl, loading, error } = useAttachmentBlob(attachment.id);
  const canPreview = isPreviewable(attachment.mimeType);

  return (
    <div className="flex flex-col flex-1 min-h-0 overflow-hidden">
      {/* Toolbar */}
      <div className="flex items-center gap-2 px-3 py-2.5 border-b border-ce-border bg-ce-bg flex-shrink-0">
        <button
          onClick={onClose}
          className="flex items-center gap-1 text-[12px] text-ce-muted hover:text-ce-navy transition-colors flex-shrink-0"
        >
          <ChevronLeft size={14} /> Back
        </button>
        <span className="flex-1 text-[12px] font-medium text-ce-text truncate text-center">
          {attachment.fileName}
        </span>
        {blobUrl && (
          <button
            onClick={() => triggerDownload(blobUrl, attachment.fileName)}
            className="flex-shrink-0 text-ce-hint hover:text-ce-navy transition-colors"
            title="Download"
          >
            <Download size={13} />
          </button>
        )}
        <button
          onClick={onClose}
          className="flex-shrink-0 text-ce-hint hover:text-ce-navy transition-colors"
          title="Close"
        >
          <X size={13} />
        </button>
      </div>

      {/* Preview area — fills remaining sidebar height */}
      <div className="flex-1 relative bg-ce-bg min-h-0">
        {loading && (
          <div className="absolute inset-0 flex items-center justify-center text-[12px] text-ce-muted">
            Loading…
          </div>
        )}
        {error && (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 text-[12px] text-red-500 px-4 text-center">
            Could not load file.
            <span className="text-ce-muted">The file may not be accessible.</span>
          </div>
        )}
        {blobUrl && canPreview && (
          <iframe
            src={blobUrl}
            className="w-full h-full border-0"
            title={attachment.fileName}
          />
        )}
        {blobUrl && !canPreview && (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 px-4">
            <div className="text-[13px] font-medium text-ce-text">{attachment.fileName}</div>
            <div className="text-[12px] text-ce-muted">This file type cannot be previewed in the browser.</div>
            <button
              onClick={() => triggerDownload(blobUrl, attachment.fileName)}
              className="flex items-center gap-2 bg-ce-navy text-white text-[13px] font-medium px-4 py-2 rounded-lg hover:bg-ce-navy2 transition-colors"
            >
              <Download size={14} /> Download file
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

/* ── Standalone preview (used in pop-out preview page) ───────────────────── */
interface StandaloneProps {
  attachment: Attachment;
  className?: string;
}

export function AttachmentViewer({ attachment, className }: StandaloneProps) {
  const { blobUrl, loading, error } = useAttachmentBlob(attachment.id);
  const canPreview = isPreviewable(attachment.mimeType);

  return (
    <div className={cn('flex-1 relative bg-ce-bg min-h-0', className)}>
      {loading && (
        <div className="absolute inset-0 flex items-center justify-center text-[13px] text-ce-muted">
          Loading…
        </div>
      )}
      {error && (
        <div className="absolute inset-0 flex items-center justify-center text-[13px] text-red-500">
          Could not load file
        </div>
      )}
      {blobUrl && canPreview && (
        <iframe
          src={blobUrl}
          className="w-full h-full border-0"
          title={attachment.fileName}
        />
      )}
      {blobUrl && !canPreview && (
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 px-6">
          <div className="text-[14px] font-medium text-ce-text">{attachment.fileName}</div>
          <div className="text-[13px] text-ce-muted">This file type cannot be previewed in the browser.</div>
          <button
            onClick={() => triggerDownload(blobUrl, attachment.fileName)}
            className="flex items-center gap-2 bg-ce-navy text-white text-[13px] font-medium px-4 py-2 rounded-lg hover:bg-ce-navy2 transition-colors"
          >
            <Download size={14} /> Download file
          </button>
        </div>
      )}
    </div>
  );
}

/* ── Attachment list chip ───────────────────────────────────────────────── */
interface ChipProps {
  att: Attachment;
  selected?: boolean;
  onClick: () => void;
}

export function AttachmentChip({ att, selected, onClick }: ChipProps) {
  const isPdf = att.mimeType === 'application/pdf' || att.fileName.toLowerCase().endsWith('.pdf');
  const canPrev = isPreviewable(att.mimeType);
  return (
    <button
      onClick={onClick}
      className={cn(
        'flex items-center gap-2 px-2.5 py-2 rounded-lg border text-[12.5px] text-left transition-all w-full',
        selected
          ? 'border-ce-navy bg-blue-50 text-ce-navy'
          : 'border-ce-border bg-ce-bg text-ce-text hover:border-ce-navy hover:bg-blue-50',
      )}
    >
      <span className="flex-shrink-0">{isPdf ? '📄' : '📎'}</span>
      <span className="flex-1 truncate">{att.fileName}</span>
      <span className="flex-shrink-0 text-[11px] text-ce-hint">{canPrev ? 'Preview' : 'Download'}</span>
    </button>
  );
}

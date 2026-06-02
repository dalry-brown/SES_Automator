'use client';

import { useState } from 'react';
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

// Builds a URL the browser can load directly — token in query param so it
// works in iframe src (which cannot send Authorization headers).
// ?dl=1 sets Content-Disposition: attachment to force a download.
function getAttachmentUrl(attachmentId: string, download = false): string {
  const token = getStoredToken();
  const params = new URLSearchParams();
  if (token) params.set('token', token);
  if (download) params.set('dl', '1');
  return `${API}/api/attachments/${attachmentId}?${params.toString()}`;
}

/* ── Sidebar-embedded viewer ─────────────────────────────────────────────────
   Fills all available height. Shown instead of the email detail body when
   an attachment chip is clicked.
────────────────────────────────────────────────────────────────────────────── */
interface SidebarViewProps {
  attachment: Attachment;
  onClose: () => void;
}

export function AttachmentSidebarView({ attachment, onClose }: SidebarViewProps) {
  const [loaded, setLoaded] = useState(false);
  const [errored, setErrored] = useState(false);
  const canPreview = isPreviewable(attachment.mimeType);
  const previewUrl = getAttachmentUrl(attachment.id);
  const downloadUrl = getAttachmentUrl(attachment.id, true);

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
        <a
          href={downloadUrl}
          className="flex-shrink-0 text-ce-hint hover:text-ce-navy transition-colors"
          title="Download"
        >
          <Download size={13} />
        </a>
        <button
          onClick={onClose}
          className="flex-shrink-0 text-ce-hint hover:text-ce-navy transition-colors"
          title="Close"
        >
          <X size={13} />
        </button>
      </div>

      {/* Preview area */}
      <div className="flex-1 relative bg-ce-bg min-h-0">
        {!loaded && !errored && canPreview && (
          <div className="absolute inset-0 flex items-center justify-center text-[12px] text-ce-muted pointer-events-none">
            Loading…
          </div>
        )}
        {errored && (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 text-[12px] text-red-500 px-4 text-center">
            Could not load file.
            <span className="text-ce-muted">The file may not be accessible.</span>
          </div>
        )}
        {canPreview ? (
          <iframe
            src={previewUrl}
            className="w-full h-full border-0"
            title={attachment.fileName}
            onLoad={() => setLoaded(true)}
            onError={() => setErrored(true)}
          />
        ) : (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 px-4">
            <div className="text-[13px] font-medium text-ce-text">{attachment.fileName}</div>
            <div className="text-[12px] text-ce-muted">This file type cannot be previewed in the browser.</div>
            <a
              href={downloadUrl}
              className="flex items-center gap-2 bg-ce-navy text-white text-[13px] font-medium px-4 py-2 rounded-lg hover:bg-ce-navy2 transition-colors"
            >
              <Download size={14} /> Download file
            </a>
          </div>
        )}
      </div>
    </div>
  );
}

/* ── Standalone viewer (pop-out preview page) ────────────────────────────── */
interface StandaloneProps {
  attachment: Attachment;
  className?: string;
}

export function AttachmentViewer({ attachment, className }: StandaloneProps) {
  const [loaded, setLoaded] = useState(false);
  const [errored, setErrored] = useState(false);
  const canPreview = isPreviewable(attachment.mimeType);
  const previewUrl = getAttachmentUrl(attachment.id);
  const downloadUrl = getAttachmentUrl(attachment.id, true);

  return (
    <div className={cn('flex-1 relative bg-ce-bg min-h-0', className)}>
      {!loaded && !errored && canPreview && (
        <div className="absolute inset-0 flex items-center justify-center text-[13px] text-ce-muted pointer-events-none">
          Loading…
        </div>
      )}
      {errored && (
        <div className="absolute inset-0 flex items-center justify-center text-[13px] text-red-500">
          Could not load file
        </div>
      )}
      {canPreview ? (
        <iframe
          src={previewUrl}
          className="w-full h-full border-0"
          title={attachment.fileName}
          onLoad={() => setLoaded(true)}
          onError={() => setErrored(true)}
        />
      ) : (
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 px-6">
          <div className="text-[14px] font-medium text-ce-text">{attachment.fileName}</div>
          <div className="text-[13px] text-ce-muted">This file type cannot be previewed in the browser.</div>
          <a
            href={downloadUrl}
            className="flex items-center gap-2 bg-ce-navy text-white text-[13px] font-medium px-4 py-2 rounded-lg hover:bg-ce-navy2 transition-colors"
          >
            <Download size={14} /> Download file
          </a>
        </div>
      )}
    </div>
  );
}

/* ── Attachment list chip ────────────────────────────────────────────────── */
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

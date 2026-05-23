'use client';

import { useState } from 'react';
import { ExternalLink, FileText } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { documentsApi } from '@/lib/api';

interface PdfViewerProps {
  attachmentId: string;
  className?: string;
}

export function PdfViewer({ attachmentId, className }: PdfViewerProps) {
  const [popout, setPopout] = useState(false);
  const url = documentsApi.previewUrl(attachmentId);

  const openPopout = () => {
    window.open(url, '_blank', 'width=900,height=1100,menubar=no,toolbar=no,location=no');
    setPopout(true);
  };

  return (
    <div className={`flex flex-col ${className ?? ''}`}>
      <div className="flex items-center justify-between border-b border-slate-200 bg-slate-50 px-3 py-2">
        <div className="flex items-center gap-2 text-xs text-slate-500">
          <FileText className="h-3.5 w-3.5" />
          <span>SES Document</span>
        </div>
        <Button size="xs" variant="ghost" onClick={openPopout} className="gap-1.5">
          <ExternalLink className="h-3 w-3" />
          Pop out
        </Button>
      </div>
      <iframe
        src={url}
        title="SES Document"
        className="flex-1 w-full border-0 bg-slate-100"
        style={{ minHeight: 500 }}
      />
    </div>
  );
}

export function NoPdfPlaceholder() {
  return (
    <div className="flex flex-1 flex-col items-center justify-center bg-slate-50 text-center p-8">
      <div className="mb-3 flex h-14 w-14 items-center justify-center rounded-full bg-slate-200">
        <FileText className="h-7 w-7 text-slate-400" />
      </div>
      <p className="text-sm font-semibold text-slate-600">No document available yet</p>
      <p className="mt-1 text-xs text-slate-400 max-w-xs">The Cost Engineering team will upload the merged SES document before requesting your approval.</p>
    </div>
  );
}

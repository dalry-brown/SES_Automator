'use client';

import { useRef, useState } from 'react';
import {
  Upload, GitMerge, ExternalLink, Maximize2, Minimize2,
  ChevronUp, ChevronDown, Trash2, FileText, Eye,
} from 'lucide-react';
import type { ImperativePanelHandle } from 'react-resizable-panels';
import { Button } from '@/components/ui/Button';
import { Spinner } from '@/components/ui/Spinner';
import { useToast } from '@/components/ui/Toast';
import { useFormAttachments, useFormAttachmentMutations, useUploadAttachment } from '@/lib/hooks/useAttachments';
import { documentsApi } from '@/lib/api';
import { fileSize } from '@/lib/utils';
import type { FormAttachment } from '@/types';

interface DocumentSidebarProps {
  formId: string;
  workflowId: string;
  panelRef: React.RefObject<ImperativePanelHandle>;
  onMerged: () => void;
}

export function DocumentSidebar({ formId, workflowId, panelRef, onMerged }: DocumentSidebarProps) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [expanded, setExpanded]     = useState(false);
  const [selected, setSelected]     = useState<FormAttachment | null>(null);
  const [merging, setMerging]       = useState(false);

  const { data: attachments = [], isLoading } = useFormAttachments(formId);
  const { add, reorder, remove }  = useFormAttachmentMutations(formId);
  const uploadMutation            = useUploadAttachment(workflowId);
  const { success, error }        = useToast();

  const toggleExpand = () => {
    if (expanded) {
      panelRef.current?.expand();
      setExpanded(false);
    } else {
      panelRef.current?.collapse();
      setExpanded(true);
    }
  };

  const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const { attachment } = await uploadMutation.mutateAsync(file);
      const rank = attachments.length;
      await add.mutateAsync({ attachmentId: attachment.id, rank });
      success(`"${file.name}" added.`);
    } catch (err: unknown) {
      error(err instanceof Error ? err.message : 'Upload failed');
    }
    e.target.value = '';
  };

  const move = async (att: FormAttachment, dir: -1 | 1) => {
    const idx = attachments.findIndex((a) => a.id === att.id);
    const swap = attachments[idx + dir];
    if (!swap) return;
    await reorder.mutateAsync([
      { attachmentId: att.attachmentId, rank: swap.rank },
      { attachmentId: swap.attachmentId, rank: att.rank },
    ]);
  };

  const handleMerge = async () => {
    setMerging(true);
    try {
      await documentsApi.merge(workflowId);
      success('Documents merged successfully.');
      onMerged();
    } catch (err: unknown) {
      error(err instanceof Error ? err.message : 'Merge failed');
    } finally {
      setMerging(false);
    }
  };

  const openPopout = (att: FormAttachment) => {
    const url = documentsApi.previewUrl(att.attachmentId);
    window.open(url, '_blank', 'width=900,height=1100,menubar=no,toolbar=no,location=no');
  };

  return (
    <div className="flex h-full flex-col bg-white border-l border-slate-200">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-slate-200 px-4 py-2.5">
        <span className="text-xs font-semibold text-slate-700">
          Documents{attachments.length > 0 && ` (${attachments.length})`}
        </span>
        <div className="flex items-center gap-1">
          <Button size="xs" variant="ghost" onClick={() => fileInputRef.current?.click()} loading={uploadMutation.isPending} title="Upload file">
            <Upload className="h-3.5 w-3.5" />
          </Button>
          <Button size="xs" variant="ghost" onClick={toggleExpand} title={expanded ? 'Restore panel' : 'Expand document view'}>
            {expanded ? <Minimize2 className="h-3.5 w-3.5" /> : <Maximize2 className="h-3.5 w-3.5" />}
          </Button>
        </div>
        <input ref={fileInputRef} type="file" accept=".pdf,.xlsx,.xls,.doc,.docx" className="hidden" onChange={handleUpload} />
      </div>

      {/* Document list */}
      <div className="border-b border-slate-200">
        {isLoading ? (
          <div className="flex justify-center py-6"><Spinner size="sm" /></div>
        ) : attachments.length === 0 ? (
          <p className="py-6 text-center text-xs text-slate-400">No documents yet — upload to get started</p>
        ) : (
          <ul className="divide-y divide-slate-100">
            {attachments.map((att, idx) => (
              <li
                key={att.id}
                onClick={() => setSelected(att)}
                className={`flex cursor-pointer items-center gap-2 px-4 py-2.5 transition-colors ${selected?.id === att.id ? 'bg-blue-50' : 'hover:bg-slate-50'}`}
              >
                <FileText className="h-3.5 w-3.5 flex-shrink-0 text-slate-400" />
                <span className="flex-1 truncate text-xs text-slate-700">{att.fileName}</span>
                <span className="flex-shrink-0 text-[10px] text-slate-400">{fileSize(att.size)}</span>
                <div className="flex flex-shrink-0 items-center gap-0.5" onClick={(e) => e.stopPropagation()}>
                  <button onClick={() => move(att, -1)} disabled={idx === 0} className="rounded p-0.5 text-slate-400 hover:text-slate-600 disabled:opacity-30">
                    <ChevronUp className="h-3 w-3" />
                  </button>
                  <button onClick={() => move(att, 1)} disabled={idx === attachments.length - 1} className="rounded p-0.5 text-slate-400 hover:text-slate-600 disabled:opacity-30">
                    <ChevronDown className="h-3 w-3" />
                  </button>
                  <button onClick={() => openPopout(att)} className="rounded p-0.5 text-slate-400 hover:text-slate-600">
                    <ExternalLink className="h-3 w-3" />
                  </button>
                  <button onClick={() => remove.mutate(att.id)} className="rounded p-0.5 text-slate-400 hover:text-red-500">
                    <Trash2 className="h-3 w-3" />
                  </button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>

      {/* Merge action */}
      <div className="border-b border-slate-200 px-4 py-3">
        <Button
          size="sm"
          variant="secondary"
          className="w-full justify-center"
          onClick={handleMerge}
          loading={merging}
          disabled={attachments.length === 0}
        >
          <GitMerge className="h-3.5 w-3.5" /> Merge into SES Document
        </Button>
      </div>

      {/* PDF Preview */}
      <div className="flex flex-1 flex-col overflow-hidden">
        {selected ? (
          <>
            <div className="flex items-center justify-between border-b border-slate-100 bg-slate-50 px-3 py-1.5">
              <span className="truncate text-[10px] text-slate-500">{selected.fileName}</span>
              <button onClick={() => openPopout(selected)} className="flex-shrink-0 text-slate-400 hover:text-slate-600">
                <ExternalLink className="h-3 w-3" />
              </button>
            </div>
            <iframe
              src={documentsApi.previewUrl(selected.attachmentId)}
              title={selected.fileName}
              className="flex-1 w-full border-0 bg-slate-100"
            />
          </>
        ) : (
          <div className="flex flex-1 flex-col items-center justify-center text-center p-6 bg-slate-50">
            <Eye className="mb-2 h-8 w-8 text-slate-300" />
            <p className="text-xs text-slate-400">Select a document to preview</p>
          </div>
        )}
      </div>
    </div>
  );
}

'use client';

import { useState, useMemo } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { ArrowLeft, FileText, ExternalLink, CheckCircle, AlertCircle, XCircle, SkipForward, Send } from 'lucide-react';
import { PageSpinner } from '@/components/ui/Spinner';
import { StatusPill } from '@/components/ui/StatusPill';
import { AuditTrail } from '@/components/approval/AuditTrail';
import { SignaturePanel } from '@/components/approval/SignaturePanel';
import { useApprovalData } from '@/lib/hooks/useApproval';
import { useAuth } from '@/components/providers/AuthProvider';
import { documentsApi, sesDocumentsApi } from '@/lib/api';
import { formatCurrency, formatDate, cn } from '@/lib/utils';
import type { SesDocument } from '@/types';

// ── Per-document decision ─────────────────────────────────────────────────────
type DocDecision = { action: 'approved' } | { action: 'skipped'; reason: string };

// ── Inline PDF viewer ─────────────────────────────────────────────────────────
function PdfFrame({ url, label, refreshKey }: { url: string; label?: string; refreshKey?: string | number }) {
  const src = refreshKey ? `${url}${url.includes('?') ? '&' : '?'}_t=${refreshKey}` : url;
  return (
    <div className="flex flex-col flex-1 overflow-hidden">
      <div className="flex items-center justify-between border-b border-slate-200 bg-slate-50 px-3 py-2 flex-shrink-0">
        <div className="flex items-center gap-2 text-xs text-slate-500">
          <FileText className="h-3.5 w-3.5" />
          <span>{label ?? 'SES Document'}</span>
        </div>
        <button
          onClick={() => window.open(url, '_blank', 'width=900,height=1100,menubar=no,toolbar=no')}
          className="flex items-center gap-1 text-[11px] text-slate-400 hover:text-slate-600 transition-colors"
        >
          <ExternalLink className="h-3 w-3" /> Pop out
        </button>
      </div>
      <iframe
        key={src}
        src={src}
        title="SES Document"
        className="flex-1 w-full border-0 bg-slate-100"
        style={{ minHeight: 400 }}
      />
    </div>
  );
}

function NoPdfPlaceholder() {
  return (
    <div className="flex flex-1 flex-col items-center justify-center bg-slate-50 text-center p-8">
      <div className="mb-3 flex h-14 w-14 items-center justify-center rounded-full bg-slate-200">
        <FileText className="h-7 w-7 text-slate-400" />
      </div>
      <p className="text-sm font-semibold text-slate-600">No document available yet</p>
      <p className="mt-1 text-xs text-slate-400 max-w-xs">
        Generate a preview from the SES form before submitting for approval.
      </p>
    </div>
  );
}

// ── Per-document decision panel ───────────────────────────────────────────────
function DocDecisionRow({
  formIdx, docLabel, decision, onChange, disabled,
}: {
  formIdx: number;
  docLabel: string;
  decision: DocDecision | undefined;
  onChange: (d: DocDecision | undefined) => void;
  disabled: boolean;
}) {
  const [showSkip, setShowSkip] = useState(false);
  const [skipReason, setSkipReason] = useState('');

  if (decision?.action === 'approved') {
    return (
      <div className="flex items-center gap-2.5 p-2.5 bg-emerald-50 border border-emerald-200 rounded-lg">
        <CheckCircle size={14} className="text-emerald-600 flex-shrink-0" />
        <span className="flex-1 text-[12.5px] font-medium text-emerald-800">{docLabel} — approved</span>
        {!disabled && (
          <button onClick={() => onChange(undefined)} className="text-[11px] text-emerald-600 hover:text-emerald-800 underline">
            undo
          </button>
        )}
      </div>
    );
  }

  if (decision?.action === 'skipped') {
    return (
      <div className="flex items-start gap-2.5 p-2.5 bg-amber-50 border border-amber-200 rounded-lg">
        <SkipForward size={14} className="text-amber-600 flex-shrink-0 mt-0.5" />
        <div className="flex-1 min-w-0">
          <p className="text-[12.5px] font-medium text-amber-800">{docLabel} — not signed</p>
          <p className="text-[11px] text-amber-600 truncate">{decision.reason}</p>
        </div>
        {!disabled && (
          <button onClick={() => onChange(undefined)} className="text-[11px] text-amber-600 hover:text-amber-800 underline flex-shrink-0">
            undo
          </button>
        )}
      </div>
    );
  }

  if (showSkip) {
    return (
      <div className="p-2.5 bg-amber-50 border border-amber-200 rounded-lg space-y-2">
        <p className="text-[12px] font-semibold text-amber-800">{docLabel} — reason for not signing</p>
        <textarea
          rows={2}
          value={skipReason}
          onChange={(e) => setSkipReason(e.target.value)}
          placeholder="e.g. Invoice amount mismatch — to be resolved separately"
          className="w-full rounded-lg border border-amber-200 bg-white px-2.5 py-1.5 text-[12px] outline-none resize-none focus:border-amber-400"
        />
        <div className="flex gap-2">
          <button
            onClick={() => { setShowSkip(false); setSkipReason(''); }}
            className="flex-1 py-1.5 rounded-lg border border-slate-200 text-[12px] text-slate-500 hover:bg-slate-50 transition-colors"
          >
            Cancel
          </button>
          <button
            disabled={!skipReason.trim()}
            onClick={() => { onChange({ action: 'skipped', reason: skipReason.trim() }); setShowSkip(false); }}
            className="flex-1 py-1.5 rounded-lg bg-amber-500 text-white text-[12px] font-medium hover:bg-amber-600 transition-colors disabled:opacity-40"
          >
            Confirm skip
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex items-center gap-2 p-2.5 bg-slate-50 border border-slate-200 rounded-lg">
      <AlertCircle size={14} className="text-slate-400 flex-shrink-0" />
      <span className="flex-1 text-[12.5px] text-slate-600">{docLabel} — pending review</span>
      {!disabled && (
        <div className="flex gap-1.5">
          <button
            onClick={() => onChange({ action: 'approved' })}
            className="px-2 py-1 rounded-md bg-emerald-50 border border-emerald-200 text-[11px] text-emerald-700 hover:bg-emerald-100 transition-colors font-medium"
          >
            Approve
          </button>
          <button
            onClick={() => setShowSkip(true)}
            className="px-2 py-1 rounded-md bg-amber-50 border border-amber-200 text-[11px] text-amber-700 hover:bg-amber-100 transition-colors font-medium"
          >
            Skip
          </button>
        </div>
      )}
    </div>
  );
}

// ── Page ───────────────────────────────────────────────────────────────────────
export default function ApprovalPage() {
  const { id } = useParams<{ id: string }>();
  const router  = useRouter();
  const { effectiveRole, user } = useAuth();
  const isChView = effectiveRole === 'user';

  const { data, isLoading, error, refetch } = useApprovalData(id);
  const [activeDocIdx, setActiveDocIdx]     = useState(0);
  const [decisions, setDecisions]           = useState<Map<number, DocDecision>>(new Map());
  const [pdfRefreshKey, setPdfRefreshKey]   = useState(0);

  if (isLoading) return <PageSpinner />;

  if (error || !data) {
    return (
      <div className="flex h-64 items-center justify-center">
        <p className="text-sm text-slate-400">{(error as Error)?.message ?? 'Workflow not found.'}</p>
      </div>
    );
  }

  const { workflow, mergedDoc, sesDocuments, events } = data;

  // ── Per-document decision logic ────────────────────────────────────────────
  const hasSesDocuments = sesDocuments && sesDocuments.length > 0;
  const isMultiDoc      = hasSesDocuments && sesDocuments.length > 1;
  const isSignable      = ['pending_approval', 'queried'].includes(workflow.status);

  // All docs must have a decision before signing; at least 1 must be 'approved'
  const allDecided = isMultiDoc
    ? sesDocuments.every((_, i) => decisions.has(i))
    : true;
  const anyApproved = isMultiDoc
    ? Array.from(decisions.values()).some((d) => d.action === 'approved')
    : true;
  const canSign = !isMultiDoc || (allDecided && anyApproved);

  const setDecision = (formIdx: number, d: DocDecision | undefined) => {
    setDecisions((prev) => {
      const next = new Map(prev);
      if (d === undefined) next.delete(formIdx);
      else next.set(formIdx, d);
      return next;
    });
  };

  // Which PDF to show in the viewer
  const activeSesDoc: SesDocument | undefined = hasSesDocuments ? sesDocuments[activeDocIdx] : undefined;
  const isApprovedOrSent = ['approved', 'sent'].includes(workflow.status);
  const pdfUrl = (() => {
    // After signing, always show the signed merged doc (the signature is embedded there)
    if (isApprovedOrSent && mergedDoc?.storageKey) return documentsApi.sesDocUrl(workflow.id);
    // Pre-signing: show the selected individual SES doc
    if (activeSesDoc) return sesDocumentsApi.previewUrl(activeSesDoc.id);
    if (mergedDoc?.storageKey) return documentsApi.sesDocUrl(workflow.id);
    return null;
  })();
  const pdfLabel = isApprovedOrSent && mergedDoc?.storageKey
    ? 'Signed SES Document'
    : (activeSesDoc?.fileName ?? 'SES Document');

  const hasDocument = !!pdfUrl || !!mergedDoc?.storageKey;

  const handleSigned = () => {
    setPdfRefreshKey((k) => k + 1);
    refetch();
  };

  return (
    <div className="flex h-full flex-col overflow-hidden">
      {/* Header */}
      <div className="border-b border-slate-200 bg-white px-4 py-3 flex-shrink-0">
        <div className="flex items-center gap-3">
          <button
            onClick={() => router.push('/pending-approval')}
            className="flex-shrink-0 rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-600 transition-colors"
          >
            <ArrowLeft className="h-4 w-4" />
          </button>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2.5 flex-wrap">
              <span className="font-mono text-sm font-bold text-slate-900">{workflow.id}</span>
              <StatusPill status={workflow.status} />
            </div>
            <div className="mt-1 flex flex-wrap gap-x-4 gap-y-0.5 text-xs text-slate-500">
              {workflow.supplierName && <span><span className="font-medium text-slate-700">Vendor:</span> {workflow.supplierName}</span>}
              {workflow.invoiceNumber && <span><span className="font-medium text-slate-700">Invoice:</span> {workflow.invoiceNumber}</span>}
              {workflow.poNumber && <span><span className="font-medium text-slate-700">PO:</span> {workflow.poNumber}</span>}
              {workflow.amount != null && <span><span className="font-medium text-slate-700">Amount:</span> {formatCurrency(workflow.amount, workflow.currency)}</span>}
              {workflow.contractHolderName && <span><span className="font-medium text-slate-700">CH:</span> {workflow.contractHolderName}</span>}
              {workflow.submittedAt && <span><span className="font-medium text-slate-700">Submitted:</span> {formatDate(workflow.submittedAt)}</span>}
            </div>
          </div>
        </div>

        {/* Document tabs */}
        {hasSesDocuments && sesDocuments.length > 1 && (
          <div className="mt-3 flex gap-1 overflow-x-auto no-scrollbar">
            {sesDocuments.map((doc, i) => {
              const dec = decisions.get(i);
              return (
                <button
                  key={doc.id}
                  onClick={() => setActiveDocIdx(i)}
                  className={cn(
                    'flex-shrink-0 px-3 py-1.5 rounded-lg text-[12px] font-medium border transition-all flex items-center gap-1.5',
                    activeDocIdx === i
                      ? 'bg-ce-navy text-white border-ce-navy'
                      : 'bg-white text-slate-500 border-slate-200 hover:border-slate-300'
                  )}
                >
                  Form {i + 1}
                  {dec?.action === 'approved' && <CheckCircle size={11} className="text-emerald-400" />}
                  {dec?.action === 'skipped'  && <XCircle size={11} className="text-amber-400" />}
                </button>
              );
            })}
          </div>
        )}
      </div>

      {/* Two-column layout */}
      <div className="flex flex-1 overflow-hidden">
        {/* Left panel */}
        <div className="flex w-[300px] flex-shrink-0 flex-col border-r border-slate-200 bg-white overflow-y-auto">

          {/* Invoice details */}
          <div className="border-b border-slate-100 px-5 py-4">
            <p className="mb-3 text-xs font-semibold uppercase tracking-wide text-slate-400">Invoice details</p>
            <dl className="space-y-2">
              {[
                ['PO Number',  workflow.poNumber],
                ['Amount',     workflow.amount != null ? formatCurrency(workflow.amount, workflow.currency) : null],
                ['Submitted',  workflow.submittedAt ? formatDate(workflow.submittedAt) : null],
                ['Approved',   workflow.approvedAt  ? formatDate(workflow.approvedAt)  : null],
              ].map(([label, value]) =>
                value ? (
                  <div key={String(label)} className="flex justify-between gap-2">
                    <dt className="text-xs text-slate-400">{label}</dt>
                    <dd className="text-xs font-medium text-slate-700 text-right">{value}</dd>
                  </div>
                ) : null
              )}
            </dl>
          </div>

          {/* Document integrity */}
          {mergedDoc?.docHash && (
            <div className="border-b border-slate-100 px-5 py-3">
              <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-slate-400">Document integrity</p>
              <p className="font-mono text-[9px] text-slate-400 break-all">{mergedDoc.docHash}</p>
            </div>
          )}

          {/* Multi-doc decision checklist */}
          {isMultiDoc && isSignable && (
            <div className="border-b border-slate-100 px-5 py-4">
              <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-400">Document decisions</p>
              <div className="space-y-2">
                {sesDocuments.map((doc, i) => (
                  <DocDecisionRow
                    key={doc.id}
                    formIdx={i}
                    docLabel={`Form ${i + 1}`}
                    decision={decisions.get(i)}
                    onChange={(d) => setDecision(i, d)}
                    disabled={!isChView && user?.role !== 'admin'}
                  />
                ))}
              </div>
              {isMultiDoc && !allDecided && (
                <p className="mt-2 text-[11px] text-slate-400 leading-snug">
                  Review each form tab and make a decision before signing.
                </p>
              )}
              {isMultiDoc && allDecided && !anyApproved && (
                <p className="mt-2 text-[11px] text-red-500 leading-snug">
                  At least one document must be approved to finalise.
                </p>
              )}
            </div>
          )}

          {/* Sign / action panel */}
          <div className="border-b border-slate-100 px-5 py-4">
            <p className="mb-3 text-xs font-semibold uppercase tracking-wide text-slate-400">Action</p>
            <SignaturePanel
              workflow={workflow}
              hasMergedDoc={hasDocument}
              canSign={canSign}
              skippedReasons={isMultiDoc
                ? sesDocuments
                    .map((_, i) => decisions.get(i))
                    .map((d, i) => d?.action === 'skipped' ? `Form ${i + 1}: ${d.reason}` : null)
                    .filter(Boolean) as string[]
                : []}
              onSigned={handleSigned}
            />
          </div>

          {/* Audit trail */}
          <div className="flex-1 px-5 py-4">
            <p className="mb-3 text-xs font-semibold uppercase tracking-wide text-slate-400">Activity</p>
            <AuditTrail events={events} />
          </div>
        </div>

        {/* Right panel — PDF viewer */}
        <div className="flex flex-1 flex-col overflow-hidden">
          {pdfUrl ? (
            <PdfFrame
              url={pdfUrl}
              label={pdfLabel}
              refreshKey={pdfRefreshKey}
            />
          ) : mergedDoc?.storageKey ? (
            <PdfFrame
              url={documentsApi.sesDocUrl(workflow.id)}
              label="Signed SES Document"
              refreshKey={pdfRefreshKey}
            />
          ) : (
            <NoPdfPlaceholder />
          )}
        </div>
      </div>
    </div>
  );
}

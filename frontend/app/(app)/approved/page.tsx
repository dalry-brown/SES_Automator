'use client';

import { useState, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import { Search, Eye, Send, Edit, FileText, CheckCircle, ChevronRight } from 'lucide-react';
import { useWorkflows } from '@/lib/hooks/useWorkflows';
import { useAuth } from '@/components/providers/AuthProvider';
import { SplitPanel, PanelHeader, PanelBody, PanelFooter, PanelSection, MetaRow, PanelEmpty } from '@/components/ui/SplitPanel';
import { PageSpinner } from '@/components/ui/Spinner';
import { formatDate, formatDateTime, daysSince, cn } from '@/lib/utils';
import { sesApi } from '@/lib/api';
import type { Workflow, SesForm } from '@/types';

type StoredRow  = { sesNumber: string; amount: string };
type StoredForm = { sesRows?: StoredRow[]; description?: string; vendorName?: string; poNumber?: string; invoiceAmount?: string | number; currency?: string; [k: string]: unknown };
type StoredFields = { forms?: StoredForm[]; [k: string]: unknown };

function firstForm(sesForm: SesForm | null): StoredForm | null {
  if (!sesForm?.fields) return null;
  const f = sesForm.fields as StoredFields;
  return f.forms?.[0] ?? (sesForm.fields as StoredForm);
}

// ── CH view side panel (read-only) ─────────────────────────────────────────────
function ChApprovedPanel({ workflow, onOpen }: { workflow: Workflow; onOpen: () => void }) {
  const { data, isLoading } = useQuery({
    queryKey: ['ses-form', 'workflow', workflow.id],
    queryFn:  () => sesApi.byWorkflow(workflow.id),
    enabled:  !!workflow.id,
  });

  const sesForm = data?.form ?? null;
  const f = firstForm(sesForm);
  const allForms = (sesForm?.fields as StoredFields | null)?.forms ?? (f ? [f] : []);
  const sesNumbers = allForms.flatMap((form) =>
    (form.sesRows ?? []).map((r) => r.sesNumber).filter(Boolean)
  );

  const amount   = f?.invoiceAmount;
  const currency = f?.currency || workflow.currency;
  const amountStr = amount != null
    ? `${currency || ''} ${Number(amount).toLocaleString()}`.trim()
    : (workflow.amount != null ? `${workflow.currency || ''} ${workflow.amount.toLocaleString()}`.trim() : undefined);

  return (
    <>
      <PanelHeader
        wfId={workflow.id}
        title={f?.vendorName || workflow.supplierName || 'Unknown vendor'}
        subtitle={workflow.invoiceNumber ? `Invoice ${workflow.invoiceNumber}` : undefined}
      />
      <PanelBody>
        <div className="flex items-center gap-2 bg-emerald-50 border border-emerald-200 rounded-lg px-3 py-2.5">
          <CheckCircle size={15} className="text-emerald-600 flex-shrink-0" />
          <div>
            <p className="text-[12px] font-semibold text-emerald-800">Approved &amp; signed</p>
            {workflow.approvedAt && (
              <p className="text-[11px] text-emerald-600">{formatDateTime(workflow.approvedAt)}</p>
            )}
          </div>
        </div>

        {isLoading ? (
          <div className="flex items-center justify-center h-24 text-[12px] text-ce-muted">Loading details…</div>
        ) : (
          <>
            <PanelSection label="Vendor & invoice">
              <MetaRow label="Vendor"  value={f?.vendorName || workflow.supplierName} />
              <MetaRow label="PO no."  value={f?.poNumber   || workflow.poNumber} />
              <MetaRow label="Amount"  value={amountStr} />
              <MetaRow label="Invoice" value={workflow.invoiceNumber} />
            </PanelSection>

            {sesNumbers.length > 0 && (
              <PanelSection label="SES numbers">
                <div className="flex flex-wrap gap-1.5">
                  {sesNumbers.map((sn, i) => (
                    <span key={i} className="bg-ce-bg border border-ce-border text-[12px] text-ce-text px-2 py-0.5 rounded-md font-mono">
                      {sn}
                    </span>
                  ))}
                </div>
              </PanelSection>
            )}

            {f?.description && (
              <PanelSection label="Scope of work">
                <p className="text-[13px] text-ce-text leading-relaxed">{f.description}</p>
              </PanelSection>
            )}
          </>
        )}
      </PanelBody>
      <PanelFooter>
        <button
          onClick={onOpen}
          className="w-full bg-ce-navy text-white text-[13px] font-semibold py-2.5 rounded-lg hover:bg-ce-navy2 transition-colors flex items-center justify-center gap-2"
        >
          <Eye size={14} /> View signed document
        </button>
      </PanelFooter>
    </>
  );
}

// ── Editor view side panel ─────────────────────────────────────────────────────
function EditorApprovedPanel({ workflow }: { workflow: Workflow }) {
  const router = useRouter();
  return (
    <>
      <PanelHeader
        wfId={workflow.id}
        title={workflow.supplierName || 'Unknown vendor'}
        subtitle={workflow.invoiceNumber ? `Invoice ${workflow.invoiceNumber}` : undefined}
      />
      <PanelBody>
        <PanelSection label="Approval details">
          <MetaRow label="Approved by" value={workflow.contractHolderName} />
          <MetaRow label="Date"        value={workflow.approvedAt ? formatDateTime(workflow.approvedAt) : undefined} />
          <MetaRow label="Invoice"     value={workflow.invoiceNumber} />
          <MetaRow label="Amount"      value={workflow.amount != null ? `${workflow.currency} ${workflow.amount.toLocaleString()}` : undefined} />
        </PanelSection>

        <div className="text-[13px] text-ce-muted leading-relaxed bg-ce-bg border border-ce-border rounded-lg p-2.5">
          Review the signed document before sending. Once sent the workflow moves to Sent &amp; Closed and cannot be edited.
        </div>
      </PanelBody>
      <PanelFooter>
        <button
          onClick={() => router.push(`/workflows/${workflow.id}/approval`)}
          className="w-full bg-white border border-ce-border text-[13px] font-medium py-2 rounded-lg text-ce-muted hover:bg-ce-bg transition-colors flex items-center justify-center gap-1.5"
        >
          <Eye size={13} /> View signed document
        </button>
        <button
          onClick={() => router.push(`/workflows/${workflow.id}/approval`)}
          className="w-full bg-ce-amber text-ce-navy3 text-[13px] font-medium py-2 rounded-lg hover:bg-ce-amber2 transition-colors flex items-center justify-center gap-1.5"
        >
          <Send size={13} /> Send to vendor
        </button>
        <button
          onClick={() => router.push(`/workflows/${workflow.id}`)}
          className="w-full bg-white border border-ce-border text-[13px] font-medium py-2 rounded-lg text-ce-muted hover:bg-ce-bg transition-colors flex items-center justify-center gap-1.5"
        >
          <Edit size={13} /> Edit form
        </button>
      </PanelFooter>
    </>
  );
}

// ── Page ──────────────────────────────────────────────────────────────────────
export default function ApprovedPage() {
  const router = useRouter();
  const { effectiveRole } = useAuth();
  const isChView = effectiveRole === 'user';

  const [search, setSearch]     = useState('');
  const [selected, setSelected] = useState<Workflow | null>(null);

  const { data: allWf, isLoading } = useWorkflows();

  const workflows = useMemo(() => {
    const list = (allWf ?? []).filter((w) => w.status === 'approved');
    if (!search.trim()) return list;
    const q = search.toLowerCase();
    return list.filter(
      (w) =>
        w.supplierName?.toLowerCase().includes(q) ||
        w.invoiceNumber?.toLowerCase().includes(q) ||
        w.contractHolderName?.toLowerCase().includes(q),
    );
  }, [allWf, search]);

  if (isLoading) return <PageSpinner />;

  const handleRowClick = (wf: Workflow) => {
    setSelected(wf);
  };

  return (
    <div className="flex flex-col flex-1 overflow-hidden">
      <SplitPanel
        main={
          <>
            <div className="px-5 py-3.5 border-b border-ce-border flex items-center justify-between flex-shrink-0 bg-white">
              <div>
                <div className="text-[16px] font-semibold text-ce-navy">Approved</div>
                <div className="text-[12.5px] text-ce-muted mt-0.5">
                  {workflows.length} item{workflows.length !== 1 ? 's' : ''}{isChView ? ' — digitally signed' : ' — signed, ready to send to vendor'}
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
              {isChView ? (
                // ── CH card list ────────────────────────────────────────────
                <div className="divide-y divide-ce-border">
                  {workflows.length === 0 && (
                    <div className="text-center text-ce-muted py-16 text-[13px]">
                      No approved workflows yet
                    </div>
                  )}
                  {workflows.map((wf) => (
                    <div
                      key={wf.id}
                      onClick={() => handleRowClick(wf)}
                      className={cn(
                        'flex items-center gap-4 px-5 py-4 cursor-pointer transition-colors group',
                        selected?.id === wf.id ? 'bg-ce-bg border-l-2 border-ce-navy' : 'hover:bg-ce-bg/60'
                      )}
                    >
                      <div className="flex-shrink-0 w-9 h-9 rounded-xl bg-emerald-50 flex items-center justify-center">
                        <CheckCircle size={16} className="text-emerald-600" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-1.5 mb-0.5 overflow-hidden">
                          <span className="text-[14px] font-semibold text-ce-text truncate min-w-0">
                            {wf.supplierName || 'Unknown vendor'}
                          </span>
                        </div>
                        <div className="text-[12px] text-ce-muted">
                          {[wf.invoiceNumber && `Invoice ${wf.invoiceNumber}`, wf.approvedAt && formatDate(wf.approvedAt, { day: 'numeric', month: 'short' })].filter(Boolean).join(' · ')}
                        </div>
                      </div>
                      <ChevronRight size={14} className="flex-shrink-0 text-ce-muted group-hover:text-ce-navy transition-colors" />
                    </div>
                  ))}
                </div>
              ) : (
                // ── Editor table ────────────────────────────────────────────
                <table className="w-full border-collapse" style={{ tableLayout: 'fixed', minWidth: 700 }}>
                  <thead className="ce-thead">
                    <tr>
                      <th style={{ width: 150 }}>Workflow ID</th>
                      <th>Vendor</th>
                      <th style={{ width: 92 }}>Inv. no.</th>
                      <th style={{ width: 84 }}>Amount</th>
                      <th>Contract holder</th>
                      <th style={{ width: 130 }}>Approved on</th>
                      <th style={{ width: 118 }}></th>
                    </tr>
                  </thead>
                  <tbody className="ce-tbody">
                    {workflows.length === 0 && (
                      <tr>
                        <td colSpan={7} className="text-center text-ce-muted py-16 text-[13px]">
                          No approved workflows yet
                        </td>
                      </tr>
                    )}
                    {workflows.map((wf) => (
                      <tr
                        key={wf.id}
                        className={cn('ce-row', selected?.id === wf.id && 'selected')}
                        onClick={() => handleRowClick(wf)}
                      >
                        <td className="font-semibold text-ce-navy">{wf.id}</td>
                        <td>{wf.supplierName || '—'}</td>
                        <td>{wf.invoiceNumber || '—'}</td>
                        <td>{wf.amount != null ? `${wf.currency} ${wf.amount.toLocaleString()}` : '—'}</td>
                        <td>{wf.contractHolderName || wf.contractHolderEmail || '—'}</td>
                        <td>
                          {wf.approvedAt ? (
                            <>
                              <div className="text-[13px]">{formatDate(wf.approvedAt, { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}</div>
                              <div className="text-[11.5px] text-ce-hint">{relTime(wf.approvedAt)}</div>
                            </>
                          ) : '—'}
                        </td>
                        <td>
                          <button
                            onClick={(e) => { e.stopPropagation(); router.push(`/workflows/${wf.id}/approval`); }}
                            className="inline-flex items-center gap-1 bg-ce-amber text-ce-navy3 border-ce-amber border text-[12px] font-medium py-1 px-2.5 rounded-lg hover:bg-ce-amber2 cursor-pointer transition-colors"
                          >
                            <Send size={11} /> Send to vendor
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          </>
        }
        side={
          !selected ? (
            <PanelEmpty message={isChView ? 'Select a workflow to view details' : 'Select a workflow to view approval details'} />
          ) : isChView ? (
            <ChApprovedPanel workflow={selected} onOpen={() => router.push(`/workflows/${selected.id}/approval`)} />
          ) : (
            <EditorApprovedPanel workflow={selected} />
          )
        }
      />
    </div>
  );
}

function relTime(d: string | null | undefined) {
  const days = daysSince(d);
  if (days === null) return '';
  if (days === 0) return 'Today';
  if (days === 1) return 'Yesterday';
  return `${days} days ago`;
}

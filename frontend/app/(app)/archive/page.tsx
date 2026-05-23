'use client';

import { useState, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import { Eye, RefreshCw, Lock } from 'lucide-react';
import { useWorkflows } from '@/lib/hooks/useWorkflows';
import { useQueryClient } from '@tanstack/react-query';
import { workflowsApi } from '@/lib/api';
import { SplitPanel, PanelHeader, PanelBody, PanelFooter, PanelSection, PanelEmpty } from '@/components/ui/SplitPanel';
import { StatusPill } from '@/components/ui/StatusPill';
import { PageSpinner } from '@/components/ui/Spinner';
import { useToast } from '@/components/ui/Toast';
import { formatDate, daysSince, cn } from '@/lib/utils';
import type { Workflow } from '@/types';

type TabKey = 'sent' | 'closed';

export default function ArchivePage() {
  const router = useRouter();
  const qc = useQueryClient();
  const { success, error: toastError } = useToast();
  const [tab, setTab]           = useState<TabKey>('sent');
  const [selected, setSelected] = useState<Workflow | null>(null);
  const [loading, setLoading]   = useState(false);

  const { data: allWf, isLoading } = useWorkflows();

  const sent = useMemo(
    () => (allWf ?? []).filter((w) => w.status === 'sent'),
    [allWf],
  );
  const closed = useMemo(
    () => (allWf ?? []).filter((w) => w.status === 'closed'),
    [allWf],
  );

  const visible = tab === 'sent' ? sent : closed;

  if (isLoading) return <PageSpinner />;

  const handleClose = async () => {
    if (!selected) return;
    setLoading(true);
    try {
      await workflowsApi.close(selected.id);
      success('Workflow closed.');
      qc.invalidateQueries({ queryKey: ['workflows'] });
      setSelected(null);
      setTab('closed');
    } catch (err) {
      toastError(err instanceof Error ? err.message : 'Failed to close workflow');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex flex-col flex-1 overflow-hidden">
      {/* Tabs */}
      <div className="flex px-5 bg-white border-b border-ce-border flex-shrink-0">
        {(['sent', 'closed'] as TabKey[]).map((t) => (
          <button
            key={t}
            onClick={() => { setTab(t); setSelected(null); }}
            className={cn(
              'px-4 py-3 text-[13.5px] font-medium border-b-2 -mb-px transition-all',
              tab === t ? 'text-ce-navy border-ce-navy' : 'text-ce-muted border-transparent',
            )}
          >
            {t === 'sent' ? 'Sent' : 'Closed'}
            <span className={cn(
              'ml-1.5 text-[10px] font-bold px-1.5 py-px rounded-full',
              tab === t ? 'bg-ce-amber text-ce-navy3' : 'bg-white/15 text-ce-muted border border-ce-border',
            )}>
              {t === 'sent' ? sent.length : closed.length}
            </span>
          </button>
        ))}
      </div>

      <SplitPanel
        main={
          <>
            <div className="px-5 py-3 border-b border-ce-border flex items-center gap-2 flex-shrink-0 bg-white">
              <Lock size={13} className="text-ce-muted flex-shrink-0" />
              <p className="text-[12px] text-ce-muted">
                Read-only — click <strong>View</strong> to open the SES record.
              </p>
            </div>

            <div className="flex-1 overflow-auto p-4">
              <div className="bg-white border border-ce-border rounded-xl overflow-hidden overflow-x-auto">
                <table className="w-full border-collapse" style={{ tableLayout: 'fixed', minWidth: 720 }}>
                  <thead className="ce-thead">
                    <tr>
                      <th style={{ width: 150 }}>Workflow ID</th>
                      <th>Vendor</th>
                      <th style={{ width: 92 }}>Inv. no.</th>
                      <th style={{ width: 84 }}>Amount</th>
                      <th>CH name</th>
                      <th style={{ width: 130 }}>Date</th>
                      <th style={{ width: 65 }}></th>
                    </tr>
                  </thead>
                  <tbody className="ce-tbody">
                    {visible.length === 0 && (
                      <tr>
                        <td colSpan={7} className="text-center text-ce-muted py-16 text-[13px]">
                          No {tab} items
                        </td>
                      </tr>
                    )}
                    {visible.map((wf) => (
                      <tr
                        key={wf.id}
                        className={cn('ce-row', selected?.id === wf.id && 'selected')}
                        onClick={() => setSelected(wf)}
                      >
                        <td className="font-semibold text-ce-navy">{wf.id}</td>
                        <td>{wf.supplierName || '—'}</td>
                        <td>{wf.invoiceNumber || '—'}</td>
                        <td>{wf.amount != null ? `${wf.currency} ${wf.amount.toLocaleString()}` : '—'}</td>
                        <td>{wf.contractHolderName || '—'}</td>
                        <td>
                          <div className="text-[13px]">{formatDate(wf.approvedAt ?? wf.updatedAt, { day: 'numeric', month: 'short' })}</div>
                          <div className="text-[11.5px] text-ce-hint">{relTime(wf.approvedAt ?? wf.updatedAt)}</div>
                        </td>
                        <td>
                          <button
                            onClick={(e) => { e.stopPropagation(); router.push(`/workflows/${wf.id}`); }}
                            className="inline-flex items-center gap-1 bg-white border border-ce-border text-[12px] text-ce-muted px-2 py-1 rounded-lg hover:bg-ce-bg cursor-pointer transition-colors"
                          >
                            <Eye size={11} /> View
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </>
        }
        side={
          selected ? (
            <>
              <PanelHeader
                wfId={selected.id}
                title={selected.supplierName || 'Unknown vendor'}
                onPopout={() => setSelected(null)}
              />
              <PanelBody>
                <PanelSection label="Status">
                  <StatusPill status={selected.status} small />
                </PanelSection>

                {selected.status === 'sent' && (
                  <button
                    onClick={handleClose}
                    disabled={loading}
                    className="w-full flex items-center justify-center gap-1.5 bg-white border border-ce-border text-[12.5px] font-medium text-ce-muted px-3 py-2 rounded-lg hover:border-ce-navy hover:text-ce-navy hover:bg-blue-50 transition-all disabled:opacity-50"
                  >
                    <RefreshCw size={13} /> {loading ? 'Closing…' : 'Move to Closed'}
                  </button>
                )}
              </PanelBody>
              <PanelFooter>
                <button
                  onClick={() => router.push(`/workflows/${selected.id}`)}
                  className="w-full bg-white border border-ce-border text-[13px] font-medium py-2 rounded-lg text-ce-muted hover:bg-ce-bg transition-colors flex items-center justify-center gap-1.5"
                >
                  <Eye size={13} /> View SES record
                </button>
              </PanelFooter>
            </>
          ) : (
            <PanelEmpty message="Select a row to manage status" />
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

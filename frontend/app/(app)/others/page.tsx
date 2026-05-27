'use client';

import { useState, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import { Search, ArrowUpDown, Check, RefreshCw, Tag } from 'lucide-react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { othersApi } from '@/lib/api';
import { SplitPanel, PanelHeader, PanelBody, PanelFooter, PanelSection, MetaRow, PanelEmpty } from '@/components/ui/SplitPanel';
import { PageSpinner } from '@/components/ui/Spinner';
import { formatDateTime, formatDate, daysSince, cn } from '@/lib/utils';
import type { ManualItem } from '@/types';

type TabKey = 'open' | 'closed';

// ── Category definitions ───────────────────────────────────────────────────────
const OTHERS_TYPES = [
  { key: 'pr',              label: 'PR',              color: 'bg-cyan-50 text-cyan-700 border-cyan-200' },
  { key: 'ap ses',          label: 'AP SES',          color: 'bg-orange-50 text-orange-700 border-orange-200' },
  { key: 'po top-up',       label: 'PO Top-up',       color: 'bg-blue-50 text-blue-700 border-blue-200' },
  { key: 'change order',    label: 'Change Order',    color: 'bg-purple-50 text-purple-700 border-purple-200' },
  { key: 'general enquiry', label: 'General Enquiry', color: 'bg-yellow-50 text-yellow-700 border-yellow-200' },
  { key: 'other',           label: 'Other',           color: 'bg-slate-50 text-slate-600 border-slate-200' },
] as const;

type OtherTypeKey = typeof OTHERS_TYPES[number]['key'];

function getTypeInfo(cat: string | null) {
  const key = (cat ?? 'other').toLowerCase() as OtherTypeKey;
  return OTHERS_TYPES.find((t) => t.key === key) ?? OTHERS_TYPES[OTHERS_TYPES.length - 1];
}

function CategoryTag({ cat }: { cat: string | null }) {
  const { label, color } = getTypeInfo(cat);
  return (
    <span className={cn('inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-semibold border', color)}>
      {label}
    </span>
  );
}

export default function OthersPage() {
  const router = useRouter();
  const qc     = useQueryClient();
  const [tab, setTab]               = useState<TabKey>('open');
  const [typeFilter, setTypeFilter] = useState<OtherTypeKey | 'all'>('all');
  const [search, setSearch]         = useState('');
  const [selected, setSelected]     = useState<ManualItem | null>(null);
  const [note, setNote]             = useState('');
  const [converting, setConverting] = useState(false);
  const [reclassifying, setReclassifying] = useState(false);

  const { data, isLoading } = useQuery({ queryKey: ['others'], queryFn: () => othersApi.list() });

  const invalidate = () => qc.invalidateQueries({ queryKey: ['others'] });

  const close  = useMutation({
    mutationFn: (id: string) => othersApi.close(id),
    onSuccess: () => { invalidate(); setSelected(null); },
  });
  const reopen = useMutation({
    mutationFn: (id: string) => othersApi.reopen(id),
    onSuccess: () => { invalidate(); setSelected(null); },
  });
  const reclassify = useMutation({
    mutationFn: ({ id, category }: { id: string; category: string }) =>
      othersApi.update(id, { category } as Partial<ManualItem>),
    onSuccess: (data) => {
      invalidate();
      setSelected((prev) => prev ? { ...prev, category: data.item.category } : prev);
      setReclassifying(false);
    },
  });

  const handleConvert = async () => {
    if (!selected || converting) return;
    setConverting(true);
    try {
      const { workflowId } = await othersApi.convert(selected.id);
      qc.invalidateQueries({ queryKey: ['others'] });
      qc.invalidateQueries({ queryKey: ['workflows'] });
      qc.invalidateQueries({ queryKey: ['emails'] });
      router.push(`/workflows/${workflowId}`);
    } catch {
      setConverting(false);
    }
  };

  const allItems = data?.items ?? [];
  const openCount   = allItems.filter((i) => i.status === 'open').length;
  const closedCount = allItems.filter((i) => i.status === 'closed').length;

  const countsByType = useMemo(() => {
    const base = allItems.filter((i) => i.status === tab);
    const counts: Record<string, number> = { all: base.length };
    for (const t of OTHERS_TYPES) {
      counts[t.key] = base.filter((i) => (i.category ?? 'other').toLowerCase() === t.key).length;
    }
    return counts;
  }, [allItems, tab]);

  const items = useMemo(() => {
    let list = allItems.filter((i) => i.status === tab);
    if (typeFilter !== 'all') {
      list = list.filter((i) => (i.category ?? 'other').toLowerCase() === typeFilter);
    }
    if (search.trim()) {
      const q = search.toLowerCase();
      list = list.filter(
        (i) =>
          i.senderEmail?.toLowerCase().includes(q) ||
          i.senderName?.toLowerCase().includes(q) ||
          i.subject?.toLowerCase().includes(q) ||
          i.category?.toLowerCase().includes(q) ||
          i.supplierName?.toLowerCase().includes(q),
      );
    }
    return list;
  }, [allItems, tab, typeFilter, search]);

  if (isLoading) return <PageSpinner />;

  return (
    <div className="flex flex-col flex-1 overflow-hidden">
      {/* Tab bar */}
      <div className="flex px-5 bg-white border-b border-ce-border flex-shrink-0">
        {(['open', 'closed'] as TabKey[]).map((t) => (
          <button
            key={t}
            onClick={() => { setTab(t); setSelected(null); setTypeFilter('all'); }}
            className={cn(
              'px-4 py-3 text-[13.5px] font-medium border-b-2 -mb-px transition-all capitalize',
              tab === t ? 'text-ce-navy border-ce-navy' : 'text-ce-muted border-transparent',
            )}
          >
            {t === 'open' ? 'Open' : 'Closed'}
            <span className={cn(
              'ml-1.5 text-[10px] font-bold px-1.5 py-px rounded-full',
              tab === t ? 'bg-ce-amber text-ce-navy3' : 'bg-ce-bg text-ce-muted border border-ce-border',
            )}>
              {t === 'open' ? openCount : closedCount}
            </span>
          </button>
        ))}
      </div>

      {/* Type filter chips */}
      <div className="flex items-center gap-2 px-5 py-2.5 border-b border-ce-border bg-white flex-shrink-0 overflow-x-auto no-scrollbar">
        <button
          onClick={() => setTypeFilter('all')}
          className={cn(
            'flex-shrink-0 px-3 py-1 rounded-full text-[12px] font-medium border transition-colors',
            typeFilter === 'all'
              ? 'bg-ce-navy text-white border-ce-navy'
              : 'bg-white text-ce-muted border-ce-border hover:border-ce-navy hover:text-ce-navy',
          )}
        >
          All {countsByType.all > 0 && <span className="ml-1 opacity-70">({countsByType.all})</span>}
        </button>
        {OTHERS_TYPES.map((t) => {
          const count = countsByType[t.key] ?? 0;
          if (count === 0 && typeFilter !== t.key) return null;
          return (
            <button
              key={t.key}
              onClick={() => setTypeFilter(typeFilter === t.key ? 'all' : t.key)}
              className={cn(
                'flex-shrink-0 px-3 py-1 rounded-full text-[12px] font-medium border transition-colors',
                typeFilter === t.key
                  ? 'bg-ce-navy text-white border-ce-navy'
                  : cn('bg-white border hover:border-ce-navy hover:text-ce-navy', t.color),
              )}
            >
              {t.label} {count > 0 && <span className="ml-1 opacity-70">({count})</span>}
            </button>
          );
        })}
      </div>

      <SplitPanel
        main={
          <>
            <div className="px-5 py-3.5 border-b border-ce-border flex items-center justify-between flex-shrink-0 bg-white">
              <div>
                <div className="text-[16px] font-semibold text-ce-navy">
                  Others — {tab === 'open' ? 'Open' : 'Closed'}
                </div>
                <div className="text-[12.5px] text-ce-muted mt-0.5">
                  {items.length} item{items.length !== 1 ? 's' : ''}
                  {typeFilter !== 'all' && ` · ${getTypeInfo(typeFilter).label}`}
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
              <table className="w-full border-collapse" style={{ tableLayout: 'fixed' }}>
                <thead className="ce-thead">
                  <tr>
                    <th style={{ width: 120 }}>Type</th>
                    <th style={{ width: 160 }}>From</th>
                    <th>Subject</th>
                    <th style={{ width: 130 }}>Received</th>
                    <th style={{ width: 72 }}>Days open</th>
                  </tr>
                </thead>
                <tbody className="ce-tbody">
                  {items.length === 0 && (
                    <tr>
                      <td colSpan={5} className="text-center text-ce-muted py-16 text-[13px]">
                        No {tab} items{typeFilter !== 'all' ? ` of type ${getTypeInfo(typeFilter).label}` : ''}
                      </td>
                    </tr>
                  )}
                  {items.map((item) => {
                    const days = daysSince(item.createdAt);
                    return (
                      <tr
                        key={item.id}
                        className={cn('ce-row', selected?.id === item.id && 'selected')}
                        onClick={() => { setSelected(item); setNote(''); setReclassifying(false); }}
                      >
                        <td><CategoryTag cat={item.category} /></td>
                        <td className="text-ce-muted text-[12px]">
                          {item.senderName || item.senderEmail || item.supplierName || '—'}
                        </td>
                        <td className="text-[13px]">
                          {item.subject || '(no subject)'}
                        </td>
                        <td>
                          <div className="text-[13px]">{formatDate(item.receivedAt ?? item.createdAt, { day: 'numeric', month: 'short' })}</div>
                          <div className="text-[11.5px] text-ce-hint">{formatDate(item.receivedAt ?? item.createdAt, { hour: '2-digit', minute: '2-digit' })}</div>
                        </td>
                        <td>
                          {days != null ? (
                            <span className={days >= 7 ? 'dur-over' : days >= 3 ? 'dur-warn' : 'dur-ok'}>
                              {days}d
                            </span>
                          ) : '—'}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </>
        }
        side={
          !selected ? (
            <PanelEmpty message="Select an item to view details" />
          ) : (
            <>
              <PanelHeader
                title={selected.senderName || selected.senderEmail || selected.supplierName || 'Unknown sender'}
                subtitle={selected.subject ?? undefined}
              />
              <PanelBody className="gap-3">
                <PanelSection label="Type">
                  <div className="flex items-center gap-2 flex-wrap">
                    <CategoryTag cat={selected.category} />
                    {selected.status === 'open' && (
                      <button
                        onClick={() => setReclassifying((v) => !v)}
                        className="inline-flex items-center gap-1 text-[11px] text-ce-muted hover:text-ce-navy border border-ce-border rounded-full px-2 py-0.5 hover:border-ce-navy transition-colors"
                      >
                        <Tag size={10} /> Re-classify
                      </button>
                    )}
                  </div>

                  {/* Re-classify type picker */}
                  {reclassifying && selected.status === 'open' && (
                    <div className="mt-2 flex flex-wrap gap-1.5">
                      {OTHERS_TYPES.map((t) => {
                        const isCurrent = (selected.category ?? 'other').toLowerCase() === t.key;
                        return (
                          <button
                            key={t.key}
                            disabled={isCurrent || reclassify.isPending}
                            onClick={() => reclassify.mutate({ id: selected.id, category: t.key })}
                            className={cn(
                              'px-2.5 py-1 rounded-full text-[11px] font-medium border transition-colors',
                              isCurrent
                                ? cn('cursor-default ring-2 ring-ce-navy/30', t.color)
                                : cn('hover:ring-2 hover:ring-ce-navy/20 cursor-pointer', t.color),
                              reclassify.isPending && 'opacity-50',
                            )}
                          >
                            {t.label}{isCurrent && ' ✓'}
                          </button>
                        );
                      })}
                    </div>
                  )}
                </PanelSection>

                <PanelSection label="Email details">
                  <MetaRow label="From"     value={selected.senderEmail} />
                  <MetaRow label="To"       value={selected.toRecipients?.map((r) => r.emailAddress.address).join(', ')} />
                  {selected.ccRecipients && selected.ccRecipients.length > 0 && (
                    <MetaRow label="CC"     value={selected.ccRecipients.map((r) => r.emailAddress.address).join(', ')} />
                  )}
                  <MetaRow label="Subject"  value={selected.subject} />
                  <MetaRow label="Received" value={formatDateTime(selected.receivedAt)} />
                </PanelSection>

                <PanelSection label="Notes">
                  <textarea
                    value={note}
                    onChange={(e) => setNote(e.target.value)}
                    placeholder="Add a note…"
                    className="w-full border border-ce-border rounded-lg p-2.5 text-[13px] text-ce-text font-sans resize-y h-20 outline-none transition-colors focus:border-ce-navy"
                  />
                </PanelSection>
              </PanelBody>

              <PanelFooter>
                {selected.status === 'open' ? (
                  <>
                    {selected.workflowId && (
                      <button
                        onClick={handleConvert}
                        disabled={converting}
                        className="w-full bg-ce-navy text-white text-[13px] font-medium py-2 rounded-lg hover:bg-ce-navy2 transition-colors flex items-center justify-center gap-1.5 disabled:opacity-50"
                      >
                        <ArrowUpDown size={13} />
                        {converting ? 'Converting…' : 'Convert to SES workflow'}
                      </button>
                    )}
                    <button
                      onClick={() => close.mutate(selected.id)}
                      disabled={close.isPending}
                      className="w-full bg-green-50 text-green-700 border border-green-200 text-[13px] font-medium py-2 rounded-lg hover:bg-green-100 transition-colors flex items-center justify-center gap-1.5 disabled:opacity-50"
                    >
                      <Check size={13} /> {close.isPending ? 'Closing…' : 'Mark as closed'}
                    </button>
                  </>
                ) : (
                  <button
                    onClick={() => reopen.mutate(selected.id)}
                    disabled={reopen.isPending}
                    className="w-full bg-ce-navy text-white text-[13px] font-medium py-2 rounded-lg hover:bg-ce-navy2 transition-colors flex items-center justify-center gap-1.5 disabled:opacity-50"
                  >
                    <RefreshCw size={13} /> {reopen.isPending ? 'Re-opening…' : 'Re-open item'}
                  </button>
                )}
              </PanelFooter>
            </>
          )
        }
      />
    </div>
  );
}

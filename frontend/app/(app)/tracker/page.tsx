'use client';

import { useState, useMemo } from 'react';
import { Search, Download, ChevronDown } from 'lucide-react';
import { useQuery } from '@tanstack/react-query';
import { trackerApi } from '@/lib/api';
import { StatusPill } from '@/components/ui/StatusPill';
import { PageSpinner } from '@/components/ui/Spinner';
import { formatDate, daysSince, cn } from '@/lib/utils';
import type { TrackerRecord } from '@/types';

function DurChip({ days }: { days: number | null }) {
  if (days == null) return <span className="text-ce-hint">—</span>;
  const cls = days >= 7 ? 'dur-over' : days >= 3 ? 'dur-warn' : 'dur-ok';
  return <span className={cls}>{days}d</span>;
}

type MonthOption = { label: string; value: string; submittedFrom: string; submittedTo: string } | { label: string; value: 'all' };

function buildMonthOptions(): MonthOption[] {
  const opts: MonthOption[] = [{ label: 'All time', value: 'all' }];
  const now = new Date();
  for (let m = 0; m < 13; m++) {
    const d = new Date(now.getFullYear(), now.getMonth() - m, 1);
    const from = new Date(d.getFullYear(), d.getMonth(), 1);
    const to   = new Date(d.getFullYear(), d.getMonth() + 1, 1);
    const label = d.toLocaleDateString('en-GB', { month: 'long', year: 'numeric' });
    const value = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
    opts.push({
      label,
      value,
      submittedFrom: from.toISOString().slice(0, 10),
      submittedTo:   to.toISOString().slice(0, 10),
    });
  }
  return opts;
}

const MONTH_OPTIONS = buildMonthOptions();

export default function TrackerPage() {
  const [search, setSearch]         = useState('');
  const [selectedMonth, setMonth]   = useState<string>(MONTH_OPTIONS[1].value); // current month

  const monthOpt = MONTH_OPTIONS.find((o) => o.value === selectedMonth);
  const dateParams: Record<string, string> | undefined =
    monthOpt && monthOpt.value !== 'all' && 'submittedFrom' in monthOpt
      ? { submittedFrom: monthOpt.submittedFrom, submittedTo: monthOpt.submittedTo }
      : undefined;

  const { data: listData, isLoading: listLoading } = useQuery({
    queryKey: ['tracker', 'list', selectedMonth],
    queryFn:  () => trackerApi.list(dateParams),
  });
  const { data: statsData, isLoading: statsLoading } = useQuery({
    queryKey: ['tracker', 'stats', selectedMonth],
    queryFn:  () => trackerApi.stats(dateParams),
  });

  const records = useMemo(() => {
    const all = listData?.records ?? [];
    if (!search.trim()) return all;
    const q = search.toLowerCase();
    return all.filter(
      (r) =>
        r.supplierName?.toLowerCase().includes(q) ||
        r.invoiceNumber?.toLowerCase().includes(q) ||
        r.contractHolderName?.toLowerCase().includes(q) ||
        r.contractHolderEmail?.toLowerCase().includes(q),
    );
  }, [listData, search]);

  if (listLoading || statsLoading) return <PageSpinner />;

  const stats     = statsData?.stats?.summary;
  const avgSign   = stats?.avgDaysToSign   ? parseFloat(stats.avgDaysToSign).toFixed(1)   : null;
  const avgSubmit = stats?.avgDaysToSubmit ? parseFloat(stats.avgDaysToSubmit).toFixed(1) : null;
  const total     = Number(stats?.total ?? 0);
  const monthLabel = monthOpt?.label ?? '';

  return (
    <div className="flex flex-col flex-1 overflow-hidden">
      {/* Stats bar */}
      <div className="border-b border-ce-border bg-white flex-shrink-0">
        <div className="flex items-center justify-between px-5 pt-4 pb-2">
          <div className="flex items-center gap-2">
            <span className="text-[13px] font-semibold text-ce-navy">Stats for</span>
            <div className="relative">
              <select
                value={selectedMonth}
                onChange={(e) => setMonth(e.target.value)}
                className="appearance-none border border-ce-border rounded-lg pl-3 pr-7 py-1.5 text-[13px] text-ce-navy bg-ce-bg outline-none focus:border-ce-navy cursor-pointer font-medium"
              >
                {MONTH_OPTIONS.map((o) => (
                  <option key={o.value} value={o.value}>{o.label}</option>
                ))}
              </select>
              <ChevronDown size={13} className="absolute right-2 top-1/2 -translate-y-1/2 text-ce-hint pointer-events-none" />
            </div>
          </div>
          <div className="text-[11px] text-ce-muted">Tracking from SES submission date</div>
        </div>
        <div className="grid grid-cols-3 gap-3 px-5 pb-4">
          <StatCard label="Avg. days to review" value={avgSubmit ?? '—'} unit={avgSubmit ? 'days' : undefined} hint="Email received → SES submitted" />
          <StatCard label="Avg. days to sign"   value={avgSign   ?? '—'} unit={avgSign   ? 'days' : undefined} hint="SES submitted → Approved" />
          <StatCard label="Total workflows"      value={String(total)} hint={selectedMonth === 'all' ? 'All time' : monthLabel} />
        </div>
      </div>

      {/* Table area */}
      <div className="flex-1 overflow-auto p-5">
        <div className="flex items-center justify-between mb-3">
          <div>
            <div className="text-[15px] font-semibold text-ce-navy">SES workflows</div>
            <div className="text-[12px] text-ce-muted mt-0.5">
              {selectedMonth === 'all' ? 'All tracked workflows' : `Submitted in ${monthLabel}`}
            </div>
          </div>
          <div className="flex gap-2">
            <div className="relative">
              <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-ce-hint pointer-events-none" />
              <input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search…"
                className="border border-ce-border rounded-lg pl-7 pr-3 py-[7px] text-[13px] text-ce-text bg-ce-bg outline-none w-44 focus:border-ce-navy focus:bg-white transition-colors"
              />
            </div>
            <button className="flex items-center gap-1.5 border border-ce-border rounded-lg px-3 py-[7px] text-[13px] text-ce-muted bg-white hover:bg-ce-bg transition-colors cursor-pointer">
              <Download size={13} /> Export
            </button>
          </div>
        </div>

        <div className="bg-white border border-ce-border rounded-xl overflow-hidden overflow-x-auto">
          <table className="w-full border-collapse" style={{ minWidth: 980 }}>
            <thead className="ce-thead-navy">
              <tr>
                <th style={{ width: 150 }}>ID</th>
                <th>Vendor</th>
                <th style={{ width: 95 }}>Invoice no.</th>
                <th>Contract holder</th>
                <th style={{ width: 85 }}>Submitted</th>
                <th style={{ width: 80 }}>Approved</th>
                <th style={{ width: 74 }}>To review</th>
                <th style={{ width: 70 }}>To sign</th>
                <th style={{ width: 82 }}>Pending</th>
                <th style={{ width: 82 }}>Status</th>
              </tr>
            </thead>
            <tbody className="ce-tbody">
              {records.length === 0 && (
                <tr>
                  <td colSpan={10} className="text-center text-ce-muted py-16 text-[13px]">
                    No records found
                  </td>
                </tr>
              )}
              {records.map((r) => {
                const daysPending = !r.approvedAt && r.submittedAt ? daysSince(r.submittedAt) : null;
                return (
                  <tr key={r.workflowId} className="ce-row">
                    <td className="font-semibold text-ce-navy">{r.workflowId}</td>
                    <td>{r.supplierName || '—'}</td>
                    <td>{r.invoiceNumber || '—'}</td>
                    <td>{r.contractHolderName || r.contractHolderEmail || '—'}</td>
                    <td className="text-ce-muted">{r.submittedAt ? formatDate(r.submittedAt, { day: 'numeric', month: 'short' }) : '—'}</td>
                    <td className="text-ce-muted">{r.approvedAt ? formatDate(r.approvedAt, { day: 'numeric', month: 'short' }) : '—'}</td>
                    <td><DurChip days={r.daysToSubmit} /></td>
                    <td><DurChip days={r.daysToSign} /></td>
                    <td>
                      {daysPending != null ? (
                        <span className={daysPending >= 7 ? 'dur-over' : daysPending >= 3 ? 'dur-warn' : 'dur-ok'}>
                          {daysPending}d
                        </span>
                      ) : <span className="text-ce-hint">—</span>}
                    </td>
                    <td><StatusPill status={r.status} small /></td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

function StatCard({ label, value, unit, hint }: { label: string; value: string; unit?: string; hint?: string }) {
  return (
    <div className="bg-ce-bg rounded-lg px-3.5 py-3">
      <div className="text-[11px] font-semibold text-ce-muted uppercase tracking-[0.5px]">{label}</div>
      <div className="mt-1 leading-none">
        <span className="text-[23px] font-semibold text-ce-navy">{value}</span>
        {unit && <span className="text-[12px] text-ce-muted font-normal ml-1">{unit}</span>}
      </div>
      {hint && <div className="text-[11px] text-ce-hint mt-1">{hint}</div>}
    </div>
  );
}

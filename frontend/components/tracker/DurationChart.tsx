'use client';

import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, Cell, ReferenceLine,
} from 'recharts';
import type { TrackerStats } from '@/types';

interface DurationChartProps {
  stats: TrackerStats;
}

function shortenEmail(email: string | null) {
  if (!email) return '—';
  return email.split('@')[0].replace('.', ' ');
}

export function DurationChart({ stats }: DurationChartProps) {
  const data = stats.byContractHolder
    .filter((r) => r.avgDaysToSign != null)
    .map((r) => ({
      name: shortenEmail(r.contractHolderEmail),
      days: Number(r.avgDaysToSign),
      total: Number(r.total),
    }))
    .sort((a, b) => b.days - a.days)
    .slice(0, 12);

  const avg = data.length ? data.reduce((s, d) => s + d.days, 0) / data.length : 0;

  if (data.length === 0) {
    return (
      <div className="flex h-48 items-center justify-center rounded-lg border border-slate-200 bg-white">
        <p className="text-xs text-slate-400">No approved workflows yet</p>
      </div>
    );
  }

  return (
    <div className="rounded-lg border border-slate-200 bg-white p-4">
      <p className="mb-1 text-xs font-semibold text-slate-700">Avg. Days to Sign — by Contract Holder</p>
      <p className="mb-4 text-[10px] text-slate-400">Submission date to approval date</p>
      <ResponsiveContainer width="100%" height={220}>
        <BarChart data={data} margin={{ top: 0, right: 8, left: -20, bottom: 0 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" vertical={false} />
          <XAxis dataKey="name" tick={{ fontSize: 10, fill: '#94a3b8' }} axisLine={false} tickLine={false} />
          <YAxis tick={{ fontSize: 10, fill: '#94a3b8' }} axisLine={false} tickLine={false} unit="d" />
          <Tooltip
            contentStyle={{ fontSize: 11, borderRadius: 8, border: '1px solid #e2e8f0', boxShadow: '0 4px 16px rgba(0,0,0,0.08)' }}
            formatter={(v: number) => [`${v.toFixed(1)} days`, 'Avg. to sign']}
          />
          <ReferenceLine y={avg} stroke="#f59e0b" strokeDasharray="4 3" label={{ value: `Avg ${avg.toFixed(1)}d`, position: 'right', fontSize: 9, fill: '#f59e0b' }} />
          <Bar dataKey="days" radius={[4, 4, 0, 0]} maxBarSize={40}>
            {data.map((entry, i) => (
              <Cell key={i} fill={entry.days > avg * 1.5 ? '#ef4444' : entry.days > avg ? '#f59e0b' : '#2563eb'} />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

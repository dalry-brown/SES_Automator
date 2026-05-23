'use client';

import { useRef, useCallback, useEffect, useState } from 'react';
import { cn } from '@/lib/utils';

interface SplitPanelProps {
  main:         React.ReactNode;
  side:         React.ReactNode;
  defaultSideW?: number; // px
  minSideW?:    number;
  maxSideW?:    number;
  className?:   string;
}

export function SplitPanel({
  main,
  side,
  defaultSideW = 340,
  minSideW     = 260,
  maxSideW     = 700,
  className,
}: SplitPanelProps) {
  const [sideW, setSideW] = useState(defaultSideW);
  const dragging = useRef(false);
  const startX   = useRef(0);
  const startW   = useRef(defaultSideW);
  const [isDragging, setIsDragging] = useState(false);

  const onMouseDown = useCallback((e: React.MouseEvent) => {
    dragging.current = true;
    startX.current   = e.clientX;
    startW.current   = sideW;
    setIsDragging(true);
    e.preventDefault();
  }, [sideW]);

  useEffect(() => {
    const onMove = (e: MouseEvent) => {
      if (!dragging.current) return;
      e.preventDefault();
      const diff = startX.current - e.clientX;
      setSideW(Math.min(maxSideW, Math.max(minSideW, startW.current + diff)));
    };
    const onUp = () => {
      if (dragging.current) { dragging.current = false; setIsDragging(false); }
    };
    window.addEventListener('mousemove', onMove, { passive: false });
    window.addEventListener('mouseup', onUp);
    return () => { window.removeEventListener('mousemove', onMove); window.removeEventListener('mouseup', onUp); };
  }, [minSideW, maxSideW]);

  return (
    <div className={cn('flex flex-1 min-h-0 overflow-hidden relative', className)}>
      {/* Main */}
      <div className="flex-1 flex flex-col min-w-0 bg-white overflow-hidden">{main}</div>

      {/* Side */}
      <div
        className="flex-shrink-0 border-l border-ce-border bg-white flex flex-col relative"
        style={{ width: sideW }}
      >
        {/* Resize handle */}
        <div
          onMouseDown={onMouseDown}
          className={cn(
            'absolute left-0 top-0 bottom-0 w-[5px] cursor-col-resize z-10 transition-colors',
            isDragging ? 'bg-ce-amber/60' : 'hover:bg-ce-amber/60',
          )}
        />
        {side}
      </div>
    </div>
  );
}

// ── Panel sub-components ──────────────────────────────────────────────────────

interface PanelHeaderProps {
  wfId?:    string;
  title:    string;
  subtitle?: string;
  onPopout?: () => void;
}

export function PanelHeader({ wfId, title, subtitle, onPopout }: PanelHeaderProps) {
  return (
    <div className="bg-ce-navy px-4 py-3.5 flex-shrink-0 flex items-start justify-between gap-2">
      <div className="min-w-0">
        {wfId && <div className="text-white/48 text-[11px] mb-0.5">{wfId}</div>}
        <div className="text-white text-[14px] font-semibold leading-snug">{title}</div>
        {subtitle && <div className="text-white/60 text-[12px] mt-0.5 leading-snug">{subtitle}</div>}
      </div>
      {onPopout && (
        <button
          onClick={onPopout}
          className="flex-shrink-0 bg-white/10 border-none text-white/75 cursor-pointer px-2 py-1 rounded-md text-[12px] flex items-center gap-1 hover:bg-white/20 hover:text-white transition-all"
        >
          ↗ Pop out
        </button>
      )}
    </div>
  );
}

export function PanelBody({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <div className={cn('flex-1 overflow-y-auto p-3.5 flex flex-col gap-3', className)}>
      {children}
    </div>
  );
}

export function PanelFooter({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex-shrink-0 border-t border-ce-border p-3 flex flex-col gap-2">
      {children}
    </div>
  );
}

export function PanelSection({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <div className="text-[11px] font-semibold text-ce-muted uppercase tracking-[0.5px] mb-1.5">{label}</div>
      {children}
    </div>
  );
}

export function MetaRow({ label, value }: { label: string; value?: React.ReactNode }) {
  return (
    <div className="flex gap-2 mb-1 text-[13px]">
      <span className="text-ce-muted min-w-[52px] font-medium flex-shrink-0">{label}</span>
      <span className="text-ce-text break-words leading-snug">{value ?? '—'}</span>
    </div>
  );
}

export function PanelEmpty({ message }: { message?: string }) {
  return (
    <div className="flex-1 flex items-center justify-center p-8 text-center">
      <p className="text-[13px] text-ce-muted">{message ?? 'Select a row to view details'}</p>
    </div>
  );
}

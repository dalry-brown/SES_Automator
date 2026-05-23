'use client';

import { useEffect, useRef, useState } from 'react';
import SignaturePad from 'signature_pad';
import { X, RotateCcw, PenLine, Type } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { User } from '@/types';

interface SignatureModalProps {
  open: boolean;
  user: User;
  loading?: boolean;
  onClose: () => void;
  onConfirm: (signatureDataUrl: string) => void;
}

type InputMode = 'draw' | 'type';

const SIGNATURE_FONTS = [
  { label: 'Signature', style: "'Times New Roman', Times, serif" },
  { label: 'Print',     style: "'Georgia', serif" },
  { label: 'Formal',    style: "'Courier New', Courier, monospace" },
];

export function SignatureModal({ open, user, loading, onClose, onConfirm }: SignatureModalProps) {
  const canvasRef   = useRef<HTMLCanvasElement>(null);
  const padRef      = useRef<SignaturePad | null>(null);
  const [mode, setMode]         = useState<InputMode>('draw');
  const [typedName, setTypedName] = useState('');
  const [fontIdx, setFontIdx]   = useState(0);
  const [isEmpty, setIsEmpty]   = useState(true);

  // ── Initialise / destroy SignaturePad ───────────────────────────────────────
  useEffect(() => {
    if (!open || mode !== 'draw') return;

    const canvas = canvasRef.current;
    if (!canvas) return;

    // High-DPI canvas
    const ratio = window.devicePixelRatio || 1;
    canvas.width  = canvas.offsetWidth  * ratio;
    canvas.height = canvas.offsetHeight * ratio;
    const ctx = canvas.getContext('2d')!;
    ctx.scale(ratio, ratio);

    const pad = new SignaturePad(canvas, {
      minWidth:    1.2,
      maxWidth:    2.8,
      penColor:    '#111111',
      backgroundColor: 'rgb(255,255,255)',
    });
    pad.addEventListener('endStroke', () => setIsEmpty(pad.isEmpty()));
    padRef.current = pad;

    return () => {
      pad.off();
      padRef.current = null;
    };
  }, [open, mode]);

  // ── Reset everything when modal opens/closes ────────────────────────────────
  useEffect(() => {
    if (open) {
      setMode('draw');
      setTypedName('');
      setFontIdx(0);
      setIsEmpty(true);
    }
  }, [open]);

  if (!open) return null;

  const handleClear = () => {
    padRef.current?.clear();
    setIsEmpty(true);
  };

  // ── Render typed signature to canvas data URL ───────────────────────────────
  const typedToDataUrl = (): string => {
    const offscreen = document.createElement('canvas');
    offscreen.width  = 440;
    offscreen.height = 120;
    const ctx = offscreen.getContext('2d')!;
    ctx.fillStyle = '#fff';
    ctx.fillRect(0, 0, offscreen.width, offscreen.height);
    ctx.fillStyle = '#111111';
    ctx.font      = `48px ${SIGNATURE_FONTS[fontIdx].style}`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(typedName, offscreen.width / 2, offscreen.height / 2);
    return offscreen.toDataURL('image/png');
  };

  const handleConfirm = () => {
    let dataUrl: string;
    if (mode === 'draw') {
      if (!padRef.current || padRef.current.isEmpty()) return;
      dataUrl = padRef.current.toDataURL('image/png');
    } else {
      if (!typedName.trim()) return;
      dataUrl = typedToDataUrl();
    }
    onConfirm(dataUrl);
  };

  const canConfirm = mode === 'draw' ? !isEmpty : typedName.trim().length > 0;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-[500px] overflow-hidden">

        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100">
          <div>
            <h2 className="text-[15px] font-semibold text-slate-800">Sign to approve this document</h2>
            <p className="text-[12px] text-slate-400 mt-0.5">Authenticated as {user.email}</p>
          </div>
          <button
            onClick={onClose}
            disabled={loading}
            className="rounded-lg p-1.5 text-slate-400 hover:text-slate-600 hover:bg-slate-100 transition-colors"
          >
            <X size={16} />
          </button>
        </div>

        {/* Mode tabs */}
        <div className="flex border-b border-slate-100">
          {([['draw', 'Draw signature', PenLine], ['type', 'Type name', Type]] as const).map(
            ([m, label, Icon]) => (
              <button
                key={m}
                onClick={() => setMode(m)}
                className={cn(
                  'flex-1 flex items-center justify-center gap-2 py-3 text-[13px] font-medium border-b-2 transition-all',
                  mode === m
                    ? 'text-slate-900 border-slate-900'
                    : 'text-slate-400 border-transparent hover:text-slate-600'
                )}
              >
                <Icon size={14} /> {label}
              </button>
            )
          )}
        </div>

        <div className="px-6 py-5 space-y-4">

          {/* ── Draw mode ── */}
          {mode === 'draw' && (
            <>
              <div
                className="relative border border-slate-300 rounded-xl overflow-hidden bg-white"
                style={{ height: 140 }}
              >
                {/* baseline guide */}
                <div className="absolute left-4 right-4 bottom-8 border-b border-slate-200 pointer-events-none" />
                <canvas
                  ref={canvasRef}
                  className="absolute inset-0 w-full h-full touch-none"
                />
                {isEmpty && (
                  <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                    <p className="text-[13px] text-slate-300 select-none">Draw your signature here</p>
                  </div>
                )}
              </div>
              <button
                type="button"
                onClick={handleClear}
                disabled={isEmpty}
                className="flex items-center gap-1.5 text-[12px] text-slate-400 hover:text-slate-600 transition-colors disabled:opacity-40"
              >
                <RotateCcw size={12} /> Clear
              </button>
            </>
          )}

          {/* ── Type mode ── */}
          {mode === 'type' && (
            <>
              <input
                type="text"
                placeholder="Type your full name"
                value={typedName}
                onChange={(e) => setTypedName(e.target.value)}
                className="w-full border border-slate-200 rounded-xl px-4 py-2.5 text-[13px] outline-none focus:border-slate-500 focus:ring-2 focus:ring-slate-500/10"
              />
              {/* Preview */}
              {typedName.trim() && (
                <div className="border border-slate-200 rounded-xl px-4 py-4 bg-slate-50 flex items-center justify-center min-h-[100px]">
                  <p
                    style={{ fontFamily: SIGNATURE_FONTS[fontIdx].style, fontSize: 38, color: '#111111', lineHeight: 1.3, letterSpacing: '0.01em' }}
                    className="text-center leading-none"
                  >
                    {typedName}
                  </p>
                </div>
              )}
              {/* Font picker */}
              <div className="flex gap-2">
                {SIGNATURE_FONTS.map((f, i) => (
                  <button
                    key={f.label}
                    onClick={() => setFontIdx(i)}
                    className={cn(
                      'flex-1 py-1.5 rounded-lg text-[11px] border transition-all',
                      fontIdx === i
                        ? 'bg-slate-900 text-white border-slate-900'
                        : 'border-slate-200 text-slate-500 hover:border-slate-400'
                    )}
                  >
                    {f.label}
                  </button>
                ))}
              </div>
            </>
          )}

          {/* Consent notice */}
          <p className="text-[11.5px] text-slate-400 leading-relaxed bg-slate-50 rounded-xl p-3">
            By signing, you confirm that you approve this document as{' '}
            <strong className="text-slate-600">{user.name}</strong>, authenticated via your
            Microsoft 365 account. Your name, email, and a timestamp will be embedded in the PDF.
            This action cannot be undone.
          </p>
        </div>

        {/* Footer */}
        <div className="flex gap-3 px-6 py-4 border-t border-slate-100">
          <button
            onClick={onClose}
            disabled={loading}
            className="flex-1 py-2.5 rounded-xl border border-slate-200 text-[13px] font-medium text-slate-600 hover:bg-slate-50 transition-colors disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            onClick={handleConfirm}
            disabled={!canConfirm || loading}
            className="flex-1 py-2.5 rounded-xl bg-slate-900 text-white text-[13px] font-semibold hover:bg-slate-800 transition-colors disabled:opacity-40"
          >
            {loading ? 'Signing…' : 'Confirm & Sign'}
          </button>
        </div>
      </div>
    </div>
  );
}

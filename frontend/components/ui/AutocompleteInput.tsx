'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { cn } from '@/lib/utils';

const inputBase = 'border border-ce-border rounded-lg px-2.5 py-[7px] text-[13px] text-ce-text outline-none w-full transition-colors font-[inherit]';

interface Suggestion {
  value:       string;
  linkedField: string | null;
  linkedValue: string | null;
}

interface AutocompleteInputProps {
  field:            string;
  value:            string;
  onChange:         (value: string) => void;
  onLinkedValue?:   (field: string, value: string) => void;
  placeholder?:     string;
  auto?:            boolean;
  ro?:              boolean;
  className?:       string;
  type?:            string;
  disabled?:        boolean;
}

export function AutocompleteInput({
  field, value, onChange, onLinkedValue,
  placeholder, auto, ro, className, type = 'text', disabled,
}: AutocompleteInputProps) {
  const [suggestions, setSuggestions]   = useState<Suggestion[]>([]);
  const [open, setOpen]                 = useState(false);
  const [activeIdx, setActiveIdx]       = useState(-1);
  const debounceRef   = useRef<ReturnType<typeof setTimeout> | null>(null);
  const containerRef  = useRef<HTMLDivElement>(null);
  const API = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000';

  // Close on outside click
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  const fetchSuggestions = useCallback(async (q: string) => {
    if (q.length < 1) { setSuggestions([]); setOpen(false); return; }
    try {
      const token = typeof window !== 'undefined'
        ? localStorage.getItem('auth_token') || sessionStorage.getItem('auth_token') || ''
        : '';
      const res = await fetch(
        `${API}/api/suggestions?field=${encodeURIComponent(field)}&q=${encodeURIComponent(q)}`,
        { headers: token ? { Authorization: `Bearer ${token}` } : {} }
      );
      if (!res.ok) return;
      const data = await res.json();
      setSuggestions(data.suggestions || []);
      setOpen((data.suggestions || []).length > 0);
      setActiveIdx(-1);
    } catch { /* silent */ }
  }, [field, API]);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const v = e.target.value;
    onChange(v);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => fetchSuggestions(v), 280);
  };

  const handleSelect = (s: Suggestion) => {
    onChange(s.value);
    if (s.linkedField && s.linkedValue && onLinkedValue) {
      onLinkedValue(s.linkedField, s.linkedValue);
    }
    setOpen(false);
    setActiveIdx(-1);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (!open || suggestions.length === 0) return;
    if (e.key === 'ArrowDown') { e.preventDefault(); setActiveIdx((i) => Math.min(i + 1, suggestions.length - 1)); }
    if (e.key === 'ArrowUp')   { e.preventDefault(); setActiveIdx((i) => Math.max(i - 1, -1)); }
    if (e.key === 'Enter' && activeIdx >= 0) { e.preventDefault(); handleSelect(suggestions[activeIdx]); }
    if (e.key === 'Escape') setOpen(false);
  };

  return (
    <div ref={containerRef} className="relative">
      <input
        type={type}
        value={value}
        onChange={handleChange}
        onKeyDown={handleKeyDown}
        onFocus={() => { if (suggestions.length > 0) setOpen(true); }}
        placeholder={placeholder}
        readOnly={ro}
        disabled={disabled}
        autoComplete="off"
        className={cn(
          inputBase,
          auto && 'bg-[#f0f5ff] border-[#b8cfe8]',
          ro   && 'bg-ce-bg text-ce-muted cursor-not-allowed',
          !auto && !ro && 'bg-white focus:border-ce-navy focus:shadow-[0_0_0_3px_rgba(24,47,84,0.07)]',
          className,
        )}
      />
      {open && suggestions.length > 0 && (
        <div className="absolute z-50 top-full left-0 right-0 mt-0.5 bg-white border border-ce-border rounded-lg shadow-lg overflow-hidden max-h-44 overflow-y-auto">
          {suggestions.map((s, i) => (
            <button
              key={i}
              type="button"
              onMouseDown={() => handleSelect(s)}
              className={cn(
                'w-full text-left px-3 py-2 text-[13px] text-ce-text transition-colors flex items-center gap-2',
                i === activeIdx ? 'bg-[#eff6ff]' : 'hover:bg-[#f8fafc]',
              )}
            >
              <span className="flex-1">{s.value}</span>
              {s.linkedValue && (
                <span className="text-[11px] text-ce-muted flex-shrink-0">
                  {s.linkedField === 'supplierNumber' ? `Supplier: ${s.linkedValue}`
                    : s.linkedField === 'contractHolderEmail' ? s.linkedValue
                    : s.linkedValue}
                </span>
              )}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

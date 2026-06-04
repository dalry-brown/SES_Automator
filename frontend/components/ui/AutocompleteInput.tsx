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

// linkedValue may be a plain string (legacy) or a JSON array of strings
function parseLinkedValues(raw: string | null): string[] {
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed)) return parsed.filter(Boolean);
    return [raw];
  } catch {
    return [raw];
  }
}

export function AutocompleteInput({
  field, value, onChange, onLinkedValue,
  placeholder, auto, ro, className, type = 'text', disabled,
}: AutocompleteInputProps) {
  const [suggestions, setSuggestions] = useState<Suggestion[]>([]);
  const [open, setOpen]               = useState(false);
  const [activeIdx, setActiveIdx]     = useState(-1);
  // emailPicker: shown when a contract holder has multiple known emails
  const [emailPicker, setEmailPicker] = useState<{ name: string; field: string; emails: string[] } | null>(null);
  const debounceRef  = useRef<ReturnType<typeof setTimeout> | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const API = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000';

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
        setEmailPicker(null);
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
    setEmailPicker(null);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => fetchSuggestions(v), 280);
  };

  const handleSelect = (s: Suggestion) => {
    onChange(s.value);
    if (s.linkedField && s.linkedValue && onLinkedValue) {
      const emails = parseLinkedValues(s.linkedValue);
      if (emails.length === 1) {
        onLinkedValue(s.linkedField, emails[0]);
        setOpen(false);
        setEmailPicker(null);
      } else {
        // Multiple emails — replace dropdown with an email picker
        setEmailPicker({ name: s.value, field: s.linkedField, emails });
      }
    } else {
      setOpen(false);
      setEmailPicker(null);
    }
    setActiveIdx(-1);
  };

  const handleEmailPick = (email: string) => {
    if (emailPicker) onLinkedValue?.(emailPicker.field, email);
    setEmailPicker(null);
    setOpen(false);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (!open || emailPicker) return;
    if (suggestions.length === 0) return;
    if (e.key === 'ArrowDown') { e.preventDefault(); setActiveIdx((i) => Math.min(i + 1, suggestions.length - 1)); }
    if (e.key === 'ArrowUp')   { e.preventDefault(); setActiveIdx((i) => Math.max(i - 1, -1)); }
    if (e.key === 'Enter' && activeIdx >= 0) { e.preventDefault(); handleSelect(suggestions[activeIdx]); }
    if (e.key === 'Escape') { setOpen(false); setEmailPicker(null); }
  };

  const showDropdown = open && (emailPicker !== null || suggestions.length > 0);

  return (
    <div ref={containerRef} className="relative">
      <input
        type={type}
        value={value}
        onChange={handleChange}
        onKeyDown={handleKeyDown}
        onFocus={() => { if (suggestions.length > 0 && !emailPicker) setOpen(true); }}
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
      {showDropdown && (
        <div className="absolute z-50 top-full left-0 right-0 mt-0.5 bg-white border border-ce-border rounded-lg shadow-lg overflow-hidden max-h-52 overflow-y-auto">
          {emailPicker ? (
            <>
              <div className="px-3 py-1.5 text-[11px] font-semibold text-ce-muted border-b border-ce-border bg-ce-bg select-none">
                Which email for {emailPicker.name}?
              </div>
              {emailPicker.emails.map((email) => (
                <button
                  key={email}
                  type="button"
                  onMouseDown={() => handleEmailPick(email)}
                  className="w-full text-left px-3 py-2 text-[13px] text-ce-text hover:bg-[#eff6ff] transition-colors"
                >
                  {email}
                </button>
              ))}
              <button
                type="button"
                onMouseDown={() => { setEmailPicker(null); setOpen(false); }}
                className="w-full text-left px-3 py-1.5 text-[11.5px] text-ce-muted hover:bg-[#f8fafc] transition-colors border-t border-ce-border"
              >
                Type email manually
              </button>
            </>
          ) : (
            suggestions.map((s, i) => {
              const linkedEmails = parseLinkedValues(s.linkedValue);
              const linkedLabel = s.linkedField === 'supplierNumber'
                ? `Supplier: ${s.linkedValue}`
                : s.linkedField === 'contractHolderEmail'
                  ? linkedEmails.length > 1 ? `${linkedEmails.length} emails` : linkedEmails[0]
                  : s.linkedValue;
              return (
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
                  {linkedLabel && (
                    <span className="text-[11px] text-ce-muted flex-shrink-0">{linkedLabel}</span>
                  )}
                </button>
              );
            })
          )}
        </div>
      )}
    </div>
  );
}

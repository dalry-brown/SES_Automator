'use client';

import { useState, useEffect, useRef, forwardRef } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useForm } from 'react-hook-form';
import {
  ArrowLeft, Sparkles, Save, RotateCcw, Trash2, Send, Eye,
  Plus, X, FileText, GripVertical, CloudUpload, Lock, FileSearch,
  ChevronRight, ExternalLink,
} from 'lucide-react';
import { cn, formatDateTime, formatDate } from '@/lib/utils';
import { useSesMutations, useSesVersions } from '@/lib/hooks/useSES';
import { useToast } from '@/components/ui/Toast';
import { AttachmentChip, AttachmentSidebarView } from '@/components/ui/AttachmentPreview';
import { AutocompleteInput } from '@/components/ui/AutocompleteInput';
import { suggestionsApi, documentsApi, sesDocumentsApi } from '@/lib/api';
import type { SesForm, Workflow, ThreadMessage, Attachment, FormVersion, SesDocument } from '@/types';

// ── Types ──────────────────────────────────────────────────────────────────────
interface SesRow { sesNumber: string; amount: string; }

interface FormValues {
  vendorName?: string;
  supplierNumber?: string;
  invoiceDate?: string;
  invoiceNumber?: string;
  invoiceAmount?: number | string;
  currency?: string;
  contractNumber?: string;
  poNumber?: string;
  licence?: string;
  wbsElement?: string;
  costCode?: string;
  contractHolderName?: string;
  contractHolderEmail?: string;
  ceName?: string;
  enteredBy?: string;
  drivePath?: string;
  description?: string;
  periodFrom?: string;
  periodTo?: string;
}

// Fields auto-filled from previous vendor data or previous form in batch (§4.4)
const AUTO_FILL_KEYS: (keyof FormValues)[] = [
  'vendorName', 'supplierNumber', 'invoiceDate', 'currency',
  'contractNumber', 'poNumber', 'licence', 'wbsElement', 'costCode',
  'contractHolderName', 'contractHolderEmail', 'ceName', 'enteredBy',
  'drivePath', 'description', 'periodFrom', 'periodTo',
];

type RefTab = 'email' | 'audit' | 'preview';
const CURRENCIES      = ['USD', 'EUR', 'GBP', 'GHS'];
const LICENCE_OPTIONS = ['TEN', 'Jubilee'] as const;
const DESCRIPTION_MAX_WORDS = 15;

function countWords(text: string): number {
  return text ? text.trim().split(/\s+/).filter(Boolean).length : 0;
}

const REQUIRED_FIELDS: (keyof FormValues)[] = [
  'vendorName', 'supplierNumber', 'invoiceDate', 'invoiceNumber',
  'invoiceAmount', 'currency', 'poNumber', 'licence',
  'wbsElement', 'contractHolderName', 'contractHolderEmail', 'description',
];

const FIELD_LABELS: Partial<Record<keyof FormValues, string>> = {
  vendorName:          'Vendor name',
  supplierNumber:      'Supplier number',
  invoiceDate:         'Invoice date',
  invoiceNumber:       'Invoice number',
  invoiceAmount:       'Invoice value',
  currency:            'Currency',
  poNumber:            'PO number',
  licence:             'Licence',
  wbsElement:          'WBS / Cost code',
  contractHolderName:  'Contract holder name',
  contractHolderEmail: 'Contract holder email',
  description:         'Scope description',
  enteredBy:           'Entered into SAP by',
};

// ── Helpers ───────────────────────────────────────────────────────────────────
type StoredForm = FormValues & { sesRows?: SesRow[]; removedAttachments?: string[]; attOrder?: string[] };
type StoredFields = { forms?: StoredForm[]; formCount?: number } & Record<string, unknown>;

function loadTabValues(sesForm: SesForm | null): FormValues[] {
  if (!sesForm?.fields) return [{}];
  const f = sesForm.fields as StoredFields;
  if (f.forms?.length) {
    return f.forms.map(({ sesRows: _, removedAttachments: __, ...vals }) => vals);
  }
  // Backward compat: old single-form flat fields
  return [extractSingleForm(sesForm)];
}

function loadSesRows(sesForm: SesForm | null): SesRow[][] {
  if (!sesForm?.fields) return [[{ sesNumber: '', amount: '' }]];
  const f = sesForm.fields as StoredFields;
  if (f.forms?.length) {
    return f.forms.map((form) =>
      form.sesRows?.length ? form.sesRows : [{ sesNumber: '', amount: '' }]
    );
  }
  const rows = (sesForm.fields as { sesRows?: SesRow[] }).sesRows;
  return [rows?.length ? rows : [{ sesNumber: '', amount: '' }]];
}

function loadAttOrders(sesForm: SesForm | null): (string[] | null)[] {
  if (!sesForm?.fields) return [null];
  const f = sesForm.fields as StoredFields;
  if (f.forms?.length) return f.forms.map((form) => form.attOrder ?? null);
  return [null];
}

function loadRemovedSets(sesForm: SesForm | null): Set<string>[] {
  if (!sesForm?.fields) return [new Set()];
  const f = sesForm.fields as StoredFields;
  if (f.forms?.length) {
    return f.forms.map((form) => new Set<string>(form.removedAttachments ?? []));
  }
  return [new Set()];
}

function extractSingleForm(sesForm: SesForm | null): FormValues {
  if (!sesForm?.fields) return {};
  const f = sesForm.fields as Record<string, unknown>;
  return {
    vendorName:          f.vendorName          as string | undefined,
    supplierNumber:      f.supplierNumber      as string | undefined,
    invoiceDate:         f.invoiceDate         as string | undefined,
    invoiceNumber:       f.invoiceNumber       as string | undefined,
    invoiceAmount:       f.invoiceAmount       as number | undefined,
    currency:            f.currency            as string | undefined,
    contractNumber:      f.contractNumber      as string | undefined,
    poNumber:            f.poNumber            as string | undefined,
    licence:             f.licence             as string | undefined,
    wbsElement:          f.wbsElement          as string | undefined,
    costCode:            f.costCode            as string | undefined,
    contractHolderName:  f.contractHolderName  as string | undefined,
    contractHolderEmail: f.contractHolderEmail as string | undefined,
    ceName:              f.ceName              as string | undefined,
    enteredBy:           f.enteredBy           as string | undefined,
    drivePath:           f.drivePath           as string | undefined,
    description:         f.description         as string | undefined,
    periodFrom:          f.periodFrom          as string | undefined,
    periodTo:            f.periodTo            as string | undefined,
  };
}

// ── Small UI helpers ───────────────────────────────────────────────────────────
function FF({ label, full, children }: { label: string; full?: boolean; children: React.ReactNode }) {
  return (
    <div className={cn('flex flex-col gap-0.5', full && 'col-span-2')}>
      <label className="text-[11px] font-semibold text-ce-muted uppercase tracking-[0.3px]">{label}</label>
      {children}
    </div>
  );
}

const inputBase = 'border border-ce-border rounded-lg px-2.5 py-[7px] text-[13px] text-ce-text outline-none w-full transition-colors font-[inherit]';

const FI = forwardRef<HTMLInputElement, React.InputHTMLAttributes<HTMLInputElement> & { auto?: boolean; ro?: boolean }>(
  function FI({ auto, ro, className, ...p }, ref) {
    return (
      <input
        ref={ref}
        {...p}
        readOnly={ro || p.readOnly}
        className={cn(
          inputBase,
          auto && 'bg-[#f0f5ff] border-[#b8cfe8]',
          ro   && 'bg-ce-bg text-ce-muted cursor-not-allowed',
          !auto && !ro && 'bg-white focus:border-ce-navy focus:shadow-[0_0_0_3px_rgba(24,47,84,0.07)]',
          className,
        )}
      />
    );
  }
);

const FSel = forwardRef<HTMLSelectElement, React.SelectHTMLAttributes<HTMLSelectElement> & { auto?: boolean }>(
  function FSel({ auto, className, ...p }, ref) {
    return (
      <select
        ref={ref}
        {...p}
        className={cn(inputBase, 'cursor-pointer', auto && 'bg-[#f0f5ff] border-[#b8cfe8]', !auto && 'bg-white focus:border-ce-navy', className)}
      />
    );
  }
);

const FTA = forwardRef<HTMLTextAreaElement, React.TextareaHTMLAttributes<HTMLTextAreaElement> & { auto?: boolean }>(
  function FTA({ auto, className, ...p }, ref) {
    return (
      <textarea
        ref={ref}
        {...p}
        className={cn(inputBase, 'resize-y', auto && 'bg-[#f0f5ff] border-[#b8cfe8]', !auto && 'bg-white focus:border-ce-navy focus:shadow-[0_0_0_3px_rgba(24,47,84,0.07)]', className)}
      />
    );
  }
);

function Card({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="bg-white border border-ce-border rounded-xl p-[18px] mb-3">
      <div className="text-[11px] font-bold text-ce-muted uppercase tracking-[0.6px] pb-2.5 border-b border-ce-border mb-3">
        {title}
      </div>
      {children}
    </div>
  );
}

function RefMetaRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex gap-2 mb-1 text-[13px]">
      <span className="text-ce-muted min-w-[52px] font-medium flex-shrink-0">{label}</span>
      <span className="text-ce-text break-words leading-snug">{value}</span>
    </div>
  );
}

// ── Props ─────────────────────────────────────────────────────────────────────
export interface SesFormPanelProps {
  workflowId: string;
  workflow: Workflow;
  sesForm: SesForm | null;
  emailThread: ThreadMessage | null;
  attachments: Attachment[];
  isReadOnly: boolean;
  lockedByName?: string;
  creating?: boolean;
  onCreateForm: (count: number) => void;
  onSubmitted: () => void;
  onBack: () => void;
}

// ── Main component ────────────────────────────────────────────────────────────
export function SesFormPanel({
  workflowId, workflow, sesForm, emailThread, attachments,
  isReadOnly, lockedByName, creating, onCreateForm, onSubmitted, onBack,
}: SesFormPanelProps) {
  const { success, error: toastError, warning } = useToast();
  const { update, submit, autofill } = useSesMutations(sesForm?.id);
  const { data: versionsData } = useSesVersions(sesForm?.id ?? '');
  const versions: FormVersion[] = versionsData ?? [];

  const { data: sesDocsData, refetch: refetchSesDocs } = useQuery({
    queryKey: ['ses-documents', workflowId],
    queryFn:  () => sesDocumentsApi.listByWorkflow(workflowId),
    enabled:  !!workflowId,
  });
  const sesDocuments: SesDocument[] = sesDocsData?.documents ?? [];

  // ── "No form" screen count ────────────────────────────────────────────────
  const [initCount, setInitCount] = useState(1);

  // ── Multi-tab state ───────────────────────────────────────────────────────
  const [activeTab, setActiveTab]           = useState(0);
  const [tabValues, setTabValues]           = useState<FormValues[]>([{}]);
  const [sesRowsByTab, setSesRowsByTab]     = useState<SesRow[][]>([[{ sesNumber: '', amount: '' }]]);
  const [removedByTab, setRemovedByTab]     = useState<Set<string>[]>([new Set()]);

  // ── UI state ──────────────────────────────────────────────────────────────
  const [refTab, setRefTab]                 = useState<RefTab>('email');
  const [showAutofillBanner, setShowAutofillBanner] = useState(false);
  const [autoFilled, setAutoFilled]         = useState(false);
  const [showResetModal, setShowResetModal] = useState(false);
  const [previewAtt, setPreviewAtt]         = useState<Attachment | null>(null);
  const [showCustomLicence, setShowCustomLicence] = useState(false);
  const [mergedPreviewId, setMergedPreviewId]     = useState<string | null>(null);
  const [generatingPreview, setGeneratingPreview] = useState(false);
  const [validationErrors, setValidationErrors]   = useState<string[]>([]);
  const [attOrderByTab, setAttOrderByTab]   = useState<(string[] | null)[]>([null]);
  const dragAttIdx  = useRef<number | null>(null);
  const [dragOverIdx, setDragOverIdx]       = useState<number | null>(null);

  // ── Resizable right panel ─────────────────────────────────────────────────
  const [rightWidth, setRightWidth]         = useState(300);
  const dragState = useRef({ active: false, startX: 0, startW: 300 });

  useEffect(() => {
    const onMove = (e: MouseEvent) => {
      if (!dragState.current.active) return;
      const delta = dragState.current.startX - e.clientX;
      setRightWidth(Math.min(560, Math.max(240, dragState.current.startW + delta)));
    };
    const onUp = () => { dragState.current.active = false; };
    document.addEventListener('mousemove', onMove);
    document.addEventListener('mouseup', onUp);
    return () => { document.removeEventListener('mousemove', onMove); document.removeEventListener('mouseup', onUp); };
  }, []);

  const { register, handleSubmit, reset, watch, setValue, getValues, formState: { isDirty, isSubmitting } } =
    useForm<FormValues>({ defaultValues: {} });

  // ── Load from DB ──────────────────────────────────────────────────────────
  useEffect(() => {
    const forms = loadTabValues(sesForm);
    const rows  = loadSesRows(sesForm);
    setTabValues(forms);
    setSesRowsByTab(rows);
    setRemovedByTab(loadRemovedSets(sesForm));
    setAttOrderByTab(loadAttOrders(sesForm));
    setActiveTab(0);
    reset(forms[0] ?? {});
    setAutoFilled(false);
    setShowAutofillBanner(false);
    const lic = forms[0]?.licence;
    setShowCustomLicence(!!lic && !LICENCE_OPTIONS.includes(lic as typeof LICENCE_OPTIONS[number]));
    setMergedPreviewId(null);
    setValidationErrors([]);
  }, [sesForm?.id, sesForm?.currentVersion, reset]);

  // Sync mergedPreviewId with the stored ses_document for the active tab
  useEffect(() => {
    const doc = sesDocuments.find((d) => d.formIndex === activeTab);
    setMergedPreviewId(doc?.id ?? null);
  }, [sesDocuments, activeTab]);

  const tabCount     = tabValues.length;
  const isLastTab    = activeTab === tabCount - 1;
  const currentRows    = sesRowsByTab[activeTab] ?? [{ sesNumber: '', amount: '' }];
  const currentRemoved = removedByTab[activeTab] ?? new Set<string>();
  const currentAttOrder = attOrderByTab[activeTab] ?? null;
  const visibleAtts = (() => {
    const base = attachments.filter((a) => !currentRemoved.has(a.id));
    if (!currentAttOrder) return base;
    const pos = new Map(currentAttOrder.map((id, i) => [id, i]));
    return [...base].sort((a, b) => (pos.get(a.id) ?? 9999) - (pos.get(b.id) ?? 9999));
  })();

  const vendorName          = watch('vendorName') || '';
  const supplierNumber      = watch('supplierNumber') || '';
  const contractHolderName  = watch('contractHolderName') || '';
  const contractHolderEmail = watch('contractHolderEmail') || '';
  const ceName              = watch('ceName') || '';
  const enteredBy           = watch('enteredBy') || '';
  const licenceValue        = watch('licence') || '';
  const description         = watch('description') || '';
  const descWordCount        = countWords(description);

  // ── Validate all tab data before final submit ────────────────────────────
  function validateAllTabs(): string[] {
    const { vals } = snapshot();
    const errors: string[] = [];

    vals.forEach((tab, i) => {
      const label = vals.length > 1 ? ` (Form ${i + 1})` : '';
      REQUIRED_FIELDS.forEach((f) => {
        if (!tab[f]) errors.push(`${FIELD_LABELS[f] || f}${label} is required`);
      });
      const tabDesc = tab.description || '';
      if (tabDesc && countWords(tabDesc) > DESCRIPTION_MAX_WORDS) {
        errors.push(`Scope description${label} must be ${DESCRIPTION_MAX_WORDS} words or fewer`);
      }
      const tabRows = sesRowsByTab[i] ?? [];
      const hasSesNum = tabRows.some((r) => r.sesNumber);
      if (hasSesNum && !tab.enteredBy) {
        errors.push(`"Entered into SAP by"${label} is required when SES numbers are present`);
      }
    });

    return errors;
  }

  // ── Save suggestions after a successful save ─────────────────────────────
  async function persistSuggestions(data: FormValues) {
    const items: { fieldName: string; value: string; linkedField?: string; linkedValue?: string }[] = [];
    if (data.vendorName) {
      items.push({ fieldName: 'vendorName', value: data.vendorName,
        linkedField: data.supplierNumber ? 'supplierNumber' : undefined,
        linkedValue: data.supplierNumber  || undefined });
    }
    if (data.supplierNumber) items.push({ fieldName: 'supplierNumber', value: data.supplierNumber });
    if (data.contractHolderName) {
      items.push({ fieldName: 'contractHolderName', value: data.contractHolderName,
        linkedField: data.contractHolderEmail ? 'contractHolderEmail' : undefined,
        linkedValue: data.contractHolderEmail  || undefined });
    }
    if (data.contractHolderEmail) items.push({ fieldName: 'contractHolderEmail', value: data.contractHolderEmail });
    if (data.ceName)    items.push({ fieldName: 'ceName',    value: data.ceName });
    if (data.enteredBy) items.push({ fieldName: 'enteredBy', value: data.enteredBy });
    try { await suggestionsApi.save(items); } catch { /* silent */ }
  }

  // ── Snapshot current tab values before switching ──────────────────────────
  function snapshot(): { vals: FormValues[]; rows: SesRow[][] } {
    const vals = [...tabValues];
    const rows = [...sesRowsByTab];
    vals[activeTab] = getValues();
    rows[activeTab] = currentRows;
    return { vals, rows };
  }

  // ── Switch tab ────────────────────────────────────────────────────────────
  function switchTab(idx: number) {
    if (idx === activeTab) return;
    const { vals, rows } = snapshot();
    setTabValues(vals);
    setSesRowsByTab(rows);
    setActiveTab(idx);
    reset(vals[idx] ?? {});
    setAutoFilled(false);
    setMergedPreviewId(null);
    const isEmpty = !vals[idx]?.vendorName && !vals[idx]?.invoiceNumber;
    setShowAutofillBanner(isEmpty && idx > 0 && !!vals[idx - 1]?.vendorName);
    const lic = vals[idx]?.licence;
    setShowCustomLicence(!!lic && !LICENCE_OPTIONS.includes(lic as typeof LICENCE_OPTIONS[number]));
  }

  // ── Add form tab ──────────────────────────────────────────────────────────
  function addTab() {
    const { vals, rows } = snapshot();
    const prevVendor = vals[activeTab]?.vendorName;
    vals.push({});
    rows.push([{ sesNumber: '', amount: '' }]);
    const newRemoved = [...removedByTab, new Set<string>()];
    const newIdx = vals.length - 1;
    setTabValues(vals);
    setSesRowsByTab(rows);
    setRemovedByTab(newRemoved);
    setAttOrderByTab((prev) => [...prev, null]);
    setActiveTab(newIdx);
    reset({});
    setAutoFilled(false);
    setShowAutofillBanner(!!prevVendor);
  }

  // ── Delete a tab ──────────────────────────────────────────────────────────
  function deleteTab(idx: number) {
    if (tabCount <= 1) return;
    const { vals, rows } = snapshot();
    const newVals    = vals.filter((_, i) => i !== idx);
    const newRows    = rows.filter((_, i) => i !== idx);
    const newRemoved = removedByTab.filter((_, i) => i !== idx);
    setAttOrderByTab((prev) => prev.filter((_, i) => i !== idx));
    const newActive  = idx < activeTab ? activeTab - 1 : Math.min(activeTab, newVals.length - 1);
    setTabValues(newVals);
    setSesRowsByTab(newRows);
    setRemovedByTab(newRemoved);
    setActiveTab(newActive);
    if (idx === activeTab || idx < activeTab) {
      reset(newVals[newActive] ?? {});
      setAutoFilled(false);
      setShowAutofillBanner(false);
    }
  }

  // ── Refresh current tab (clear per-invoice fields only) ───────────────────
  function refreshTab() {
    reset({ ...getValues(), invoiceNumber: '', invoiceAmount: '' });
    setSesRowsByTab((prev) => {
      const next = [...prev];
      next[activeTab] = [{ sesNumber: '', amount: '' }];
      return next;
    });
  }

  // ── Auto-fill from previous form in batch ─────────────────────────────────
  function applyBatchAutofill() {
    const { vals } = snapshot();
    const prev = vals[activeTab - 1] ?? {};
    AUTO_FILL_KEYS.forEach((k) => {
      const v = prev[k];
      if (v) setValue(k, v as string, { shouldDirty: true });
    });
    setAutoFilled(true);
    setShowAutofillBanner(false);
    success(`Fields copied from Form ${activeTab}.`);
  }

  // ── Auto-fill from DB (vendor history) ───────────────────────────────────
  const handleDbAutofill = async () => {
    if (!vendorName) { warning('Enter a vendor name first.'); return; }
    const data = await autofill.mutateAsync({ vendorName, poNumber: watch('poNumber') });
    if (!data) { warning('No previous data found for this vendor.'); return; }
    Object.entries(data).forEach(([k, v]) => {
      if (AUTO_FILL_KEYS.includes(k as keyof FormValues) && v) {
        setValue(k as keyof FormValues, v as string, { shouldDirty: true });
      }
    });
    setAutoFilled(true);
    success('Fields prefilled from last approved submission.');
  };

  // ── SES row helpers ───────────────────────────────────────────────────────
  function updateSesRows(fn: (r: SesRow[]) => SesRow[]) {
    setSesRowsByTab((prev) => {
      const next = [...prev];
      next[activeTab] = fn(next[activeTab] ?? []);
      return next;
    });
  }

  // ── Attachment helpers ────────────────────────────────────────────────────
  function removeAtt(id: string) {
    setRemovedByTab((prev) => {
      const next = [...prev];
      next[activeTab] = new Set([...(next[activeTab] ?? new Set()), id]);
      return next;
    });
  }

  function restoreAllAtts() {
    setRemovedByTab((prev) => {
      const next = [...prev];
      next[activeTab] = new Set<string>();
      return next;
    });
  }

  function handleAttDrop(toIdx: number) {
    const fromIdx = dragAttIdx.current;
    dragAttIdx.current = null;
    setDragOverIdx(null);
    if (fromIdx === null || fromIdx === toIdx) return;
    const reordered = [...visibleAtts];
    const [item] = reordered.splice(fromIdx, 1);
    reordered.splice(toIdx, 0, item);
    setAttOrderByTab((prev) => {
      const next = [...prev];
      next[activeTab] = reordered.map((a) => a.id);
      return next;
    });
  }

  // ── Save (all tabs) ───────────────────────────────────────────────────────
  const handleSave = handleSubmit(async (data) => {
    if (!sesForm) return;
    const allVals = [...tabValues];
    allVals[activeTab] = data;
    const allRows = [...sesRowsByTab];
    allRows[activeTab] = currentRows;

    const forms: StoredForm[] = allVals.map((v, i) => ({
      ...v,
      sesRows:            allRows[i] ?? [],
      removedAttachments: [...(removedByTab[i] ?? new Set<string>())],
      attOrder:           attOrderByTab[i] ?? undefined,
    }));

    try {
      await update.mutateAsync({
        id: sesForm.id,
        fields: { forms, formCount: forms.length } as Record<string, unknown>,
      });
      setTabValues(allVals);
      setSesRowsByTab(allRows);
      reset(data);
      success('Form saved.');
      persistSuggestions(data);
    } catch (err) {
      toastError(err instanceof Error ? err.message : 'Save failed');
    }
  });

  // ── Submit for approval (last tab) ───────────────────────────────────────
  const handleSubmitForApproval = async () => {
    if (!sesForm) return;
    if (isDirty) { warning('You have unsaved changes — save before submitting.'); return; }
    const errors = validateAllTabs();
    if (errors.length > 0) {
      setValidationErrors(errors);
      return;
    }
    setValidationErrors([]);
    try {
      await submit.mutateAsync(sesForm.id);
      success('Submitted for approval.');
      onSubmitted();
    } catch (err) {
      toastError(err instanceof Error ? err.message : 'Submit failed');
    }
  };

  // ── Preview merge: generate SES PDF + merge with ordered attachments ────────
  const handlePreviewMerge = async () => {
    if (!sesForm) return;
    if (isDirty) {
      warning('Save the form first before generating a preview.');
      return;
    }
    setGeneratingPreview(true);
    try {
      const { document } = await documentsApi.generatePreview(
        sesForm.id,
        activeTab,
        visibleAtts.map((a) => a.id),
      );
      setMergedPreviewId(document.id);
      setRefTab('preview');
      refetchSesDocs();
      success('Preview generated — check the Preview docs tab.');
    } catch (err) {
      toastError(err instanceof Error ? err.message : 'Preview generation failed');
    } finally {
      setGeneratingPreview(false);
    }
  };

  // ── Submit button: next tab or final submit ───────────────────────────────
  const handleSubmitOrNext = () => {
    if (!isLastTab) {
      switchTab(activeTab + 1);
    } else {
      handleSubmitForApproval();
    }
  };

  // ── Shared reference panel ───────────────────────────────────────────────────
  const previewAttId = previewAtt?.id ?? null;
  const rightPanel = (
    <div
      className="flex-shrink-0 border-l border-ce-border bg-white flex flex-col overflow-hidden relative"
      style={{ width: rightWidth }}
    >
      {/* Drag handle */}
      <div
        onMouseDown={(e) => {
          dragState.current = { active: true, startX: e.clientX, startW: rightWidth };
          e.preventDefault();
        }}
        className="absolute left-0 top-0 bottom-0 w-[5px] cursor-col-resize z-10 group"
      >
        <div className="absolute inset-0 group-hover:bg-ce-amber group-active:bg-ce-amber opacity-0 group-hover:opacity-40 transition-opacity" />
      </div>

      {/* Panel content */}
      {previewAtt ? (
        <AttachmentSidebarView
          attachment={previewAtt}
          onClose={() => setPreviewAtt(null)}
        />
      ) : (
        <>
          {/* Tab strip */}
          <div className="flex border-b border-ce-border flex-shrink-0 pl-1 items-center">
            {(['email', 'audit', 'preview'] as RefTab[]).map((t) => (
              <button
                key={t}
                onClick={() => setRefTab(t)}
                className={cn(
                  'flex-1 py-2.5 text-[12px] font-medium border-b-2 -mb-px transition-all',
                  refTab === t
                    ? 'text-ce-navy border-ce-navy'
                    : 'text-ce-muted border-transparent hover:text-ce-text',
                )}
              >
                {t === 'email' ? 'Email' : t === 'audit' ? 'Audit trail' : 'Preview docs'}
              </button>
            ))}
            <button
              onClick={() => window.open(`/reference/${workflowId}`, '_blank', 'width=960,height=720,resizable=yes,scrollbars=yes')}
              title="Pop out reference panel"
              className="flex-shrink-0 px-2 py-2 text-ce-hint hover:text-ce-navy transition-colors mb-px"
            >
              <ExternalLink size={13} />
            </button>
          </div>

          {/* Tab body */}
          <div className="flex-1 overflow-y-auto p-3">

            {/* ── Email tab ── */}
            {refTab === 'email' && (
              emailThread ? (
                <div className="flex flex-col gap-3">
                  <div className="bg-ce-bg border border-ce-border rounded-lg p-2.5 flex flex-col gap-1">
                    <RefMetaRow label="From"    value={emailThread.senderEmail ?? '—'} />
                    <RefMetaRow label="To"      value={emailThread.toRecipients?.map((r) => r.emailAddress.address).join(', ') ?? '—'} />
                    <RefMetaRow label="Subject" value={emailThread.subject ?? '—'} />
                    <RefMetaRow label="Date"    value={emailThread.receivedAt ? formatDateTime(emailThread.receivedAt) : '—'} />
                  </div>
                  {attachments.length > 0 && (
                    <div>
                      <div className="text-[11px] font-semibold text-ce-muted uppercase tracking-[0.5px] mb-1.5">
                        Attachments
                      </div>
                      <div className="flex flex-col gap-1.5">
                        {attachments.map((att) => (
                          <AttachmentChip
                            key={att.id}
                            att={att}
                            selected={previewAttId === att.id}
                            onClick={() => setPreviewAtt(att)}
                          />
                        ))}
                      </div>
                    </div>
                  )}
                  <div>
                    <div className="text-[11px] font-semibold text-ce-muted uppercase tracking-[0.5px] mb-1.5">Body</div>
                    <div className="bg-ce-bg border border-ce-border rounded-lg p-2.5 text-[13px] text-ce-text leading-relaxed max-h-[200px] overflow-y-auto whitespace-pre-wrap">
                      {emailThread.bodyPreview ?? '(no body preview available)'}
                    </div>
                  </div>
                </div>
              ) : (
                <div className="flex flex-col items-center justify-center h-full py-10 gap-2 text-ce-muted">
                  <FileText size={24} className="text-ce-hint" />
                  <p className="text-[13px]">No email thread found for this workflow.</p>
                </div>
              )
            )}

            {/* ── Audit trail tab ── */}
            {refTab === 'audit' && (
              <div>
                {versions.length > 0 ? (
                  <div className="relative">
                    <div className="absolute left-[4px] top-0 bottom-0 w-px bg-ce-border" />
                    {versions.map((v) => (
                      <div key={v.id} className="flex gap-3 mb-4 relative">
                        <div className="w-2.5 h-2.5 rounded-full bg-ce-amber border-2 border-white flex-shrink-0 mt-1 z-10" />
                        <div className="min-w-0">
                          <div className="text-[13px] font-semibold text-ce-navy">Version {v.versionNumber}</div>
                          <div className="text-[11.5px] text-ce-muted mt-0.5">{v.createdByName}</div>
                          <div className="text-[11px] text-ce-hint mt-0.5">
                            {v.createdAt ? formatDate(v.createdAt, { day: 'numeric', month: 'short', year: 'numeric' }) : ''}
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="flex flex-col items-center justify-center h-full py-10 gap-2 text-ce-muted">
                    <FileSearch size={24} className="text-ce-hint" />
                    <p className="text-[13px]">No prior versions yet.</p>
                  </div>
                )}
              </div>
            )}

            {/* ── Preview docs tab ── */}
            {refTab === 'preview' && (
              mergedPreviewId ? (
                <div className="flex flex-col h-full min-h-0 -m-3">
                  <div className="flex items-center justify-between px-3 py-2 border-b border-ce-border flex-shrink-0">
                    <span className="text-[12px] font-medium text-ce-navy">Merged preview</span>
                    <button
                      onClick={() => setMergedPreviewId(null)}
                      className="text-ce-hint hover:text-ce-navy transition-colors"
                      title="Clear preview"
                    >
                      <X size={13} />
                    </button>
                  </div>
                  <iframe
                    src={sesDocumentsApi.previewUrl(mergedPreviewId)}
                    className="flex-1 w-full border-0"
                    title="Merged SES preview"
                  />
                </div>
              ) : (
                <div className="flex flex-col items-center justify-center h-full py-10 gap-2 text-ce-muted">
                  <FileSearch size={28} className="text-ce-hint" />
                  <p className="text-[13px] text-center leading-relaxed max-w-[180px]">
                    Save the form, then click <strong className="text-ce-text">Preview merge</strong> to see the combined document.
                  </p>
                </div>
              )
            )}
          </div>
        </>
      )}
    </div>
  );

  // ── No form yet ───────────────────────────────────────────────────────────
  if (!sesForm) {
    return (
      <div className="flex flex-col flex-1 overflow-hidden bg-ce-bg">
        {/* Top bar */}
        <div className="bg-white border-b border-ce-border px-5 py-3 flex items-center gap-3 flex-shrink-0">
          <button
            onClick={onBack}
            className="flex items-center gap-1.5 border border-ce-border bg-white text-ce-muted rounded-lg px-2.5 py-[7px] text-[12.5px] font-medium hover:bg-ce-bg hover:text-ce-navy transition-colors"
          >
            <ArrowLeft size={13} /> Back
          </button>
          <div>
            <div className="text-[15.5px] font-semibold text-ce-navy leading-snug">Create SES Form</div>
            <div className="text-[12px] text-ce-muted mt-0.5">
              {workflowId} · Received {formatDateTime(workflow.createdAt)}
            </div>
          </div>
        </div>

        {/* Split: create UI + reference panel */}
        <div className="flex flex-1 min-h-0 overflow-hidden border-t border-ce-border">
          <div className="flex-1 flex flex-col items-center justify-center gap-5 bg-ce-bg overflow-y-auto py-8 px-6">
            <div className="flex items-center gap-3 rounded-xl border border-ce-border bg-white p-6 shadow-sm w-full max-w-md">
              <FileText size={32} className="text-ce-hint flex-shrink-0" />
              <div>
                <p className="font-semibold text-ce-navy">No SES form created yet</p>
                <p className="mt-0.5 text-[13px] text-ce-muted">How many invoices does this email contain?</p>
              </div>
            </div>

            {/* Count stepper */}
            <div className="flex items-center gap-3 bg-white border border-ce-border rounded-xl px-5 py-3.5 shadow-sm w-full max-w-md flex-wrap">
              <span className="text-[13px] font-medium text-ce-text">Number of SES forms:</span>
              <div className="flex border border-ce-border rounded-lg overflow-hidden">
                <button
                  onClick={() => setInitCount((c) => Math.max(1, c - 1))}
                  className="w-8 h-8 bg-ce-bg text-ce-muted hover:bg-ce-border flex items-center justify-center text-[18px] transition-colors"
                >
                  −
                </button>
                <span className="px-4 h-8 flex items-center font-semibold text-[14px] text-ce-navy border-x border-ce-border min-w-[48px] justify-center">
                  {initCount}
                </span>
                <button
                  onClick={() => setInitCount((c) => Math.min(10, c + 1))}
                  className="w-8 h-8 bg-ce-bg text-ce-muted hover:bg-ce-border flex items-center justify-center text-[18px] transition-colors"
                >
                  +
                </button>
              </div>
              <span className="text-[12px] text-ce-muted">For batch invoices from the same email</span>
            </div>

            <button
              onClick={() => onCreateForm(initCount)}
              disabled={creating}
              className="flex items-center gap-2 bg-ce-navy text-white px-5 py-2.5 rounded-lg text-[13px] font-medium hover:bg-ce-navy2 transition-colors disabled:opacity-60 w-full max-w-md justify-center"
            >
              <Plus size={14} />
              {creating ? 'Creating…' : initCount > 1 ? `Create ${initCount} SES Forms` : 'Create SES Form'}
            </button>
          </div>

          {rightPanel}
        </div>
      </div>
    );
  }

  // ── Form ──────────────────────────────────────────────────────────────────
  const topVendorName = tabValues[0]?.vendorName || sesForm.fields?.vendorName as string | undefined || 'New Form';

  return (
    <div className="flex flex-col flex-1 overflow-hidden bg-ce-bg">

      {/* ── Top bar ──────────────────────────────────────────────────────── */}
      <div className="bg-white border-b border-ce-border px-5 py-3 flex items-center gap-3 flex-shrink-0 flex-wrap">
        <button
          onClick={onBack}
          className="flex items-center gap-1.5 border border-ce-border bg-white text-ce-muted rounded-lg px-2.5 py-[7px] text-[12.5px] font-medium hover:bg-ce-bg hover:text-ce-navy transition-colors"
        >
          <ArrowLeft size={13} /> Back
        </button>

        <div className="min-w-0">
          <div className="flex items-center gap-1.5 flex-wrap">
            <span className="text-[15.5px] font-semibold text-ce-navy leading-snug">
              SES Form — {String(topVendorName)}
            </span>
            <span className="bg-ce-navy text-white text-[10px] font-bold px-1.5 py-px rounded-full">
              v{sesForm.currentVersion}
            </span>
            {tabCount > 1 && (
              <span className="text-[11px] text-ce-muted">{tabCount} forms in batch</span>
            )}
          </div>
          <div className="text-[12px] text-ce-muted mt-0.5">
            {workflowId} · Received {formatDateTime(workflow.createdAt)}
          </div>
        </div>

        {lockedByName && (
          <div className="flex items-center gap-1.5 rounded-lg bg-red-50 border border-red-200 px-2.5 py-1.5 text-[12px] font-medium text-red-700">
            <Lock size={12} /> Being edited by {lockedByName}
          </div>
        )}

        {!isReadOnly && (
          <div className="ml-auto flex gap-1.5 flex-shrink-0 flex-wrap">
            <button
              onClick={handleSave}
              disabled={!isDirty || update.isPending || isSubmitting}
              className="flex items-center gap-1.5 border border-ce-border bg-white text-ce-muted rounded-lg px-2.5 py-[7px] text-[12.5px] font-medium hover:bg-ce-bg hover:text-ce-navy transition-colors disabled:opacity-40"
            >
              <Save size={13} /> Save draft
            </button>
            <button
              onClick={() => setShowResetModal(true)}
              className="flex items-center gap-1.5 border border-ce-border bg-white text-ce-muted rounded-lg px-2.5 py-[7px] text-[12.5px] font-medium hover:bg-ce-bg transition-colors"
            >
              <RotateCcw size={13} /> Reset
            </button>
            <button
              onClick={onBack}
              className="flex items-center gap-1.5 border border-red-200 bg-red-50 text-red-700 rounded-lg px-2.5 py-[7px] text-[12.5px] font-medium hover:bg-red-100 transition-colors"
            >
              <Trash2 size={13} /> Discard
            </button>
          </div>
        )}
      </div>

      {/* ── Banners ───────────────────────────────────────────────────────── */}
      {showAutofillBanner && activeTab > 0 && (
        <div className="mx-5 mt-3 flex items-center gap-3 bg-[#eff6ff] border border-[#bfdbfe] rounded-lg px-3 py-2.5 text-[12.5px] flex-shrink-0">
          <Sparkles size={13} className="text-[#1e4db7] flex-shrink-0" />
          <span className="flex-1 text-[#1e4db7]">
            Previous data found for this vendor — populate form?
          </span>
          <button
            onClick={applyBatchAutofill}
            className="text-[12px] font-semibold text-[#1e4db7] hover:underline flex-shrink-0"
          >
            Accept
          </button>
          <button
            onClick={() => setShowAutofillBanner(false)}
            className="text-[12px] text-ce-muted hover:text-ce-text flex-shrink-0"
          >
            Dismiss
          </button>
        </div>
      )}

      {autoFilled && !showAutofillBanner && (
        <div className="mx-5 mt-3 flex items-center gap-2 bg-[#eef3fb] border border-[#b8cfe8] rounded-lg px-3 py-2 text-[12.5px] text-[#1e4db7] flex-shrink-0">
          <Sparkles size={13} className="flex-shrink-0" />
          Auto-filled from {activeTab > 0 ? `Form ${activeTab}` : `last ${vendorName ?? ''} submission`} — review and update as needed.
        </div>
      )}

      {validationErrors.length > 0 && (
        <div className="mx-5 mt-3 bg-red-50 border border-red-200 rounded-lg px-3 py-2.5 flex-shrink-0">
          <div className="flex items-center justify-between mb-1">
            <span className="text-[12.5px] font-semibold text-red-700">Fix the following before submitting:</span>
            <button onClick={() => setValidationErrors([])} className="text-red-400 hover:text-red-600 transition-colors">
              <X size={13} />
            </button>
          </div>
          <ul className="list-disc list-inside space-y-0.5">
            {validationErrors.map((e, i) => (
              <li key={i} className="text-[12px] text-red-600">{e}</li>
            ))}
          </ul>
        </div>
      )}

      {/* ── Tab strip ─────────────────────────────────────────────────────── */}
      <div className="flex items-center gap-0 px-5 pt-3 flex-shrink-0 flex-wrap">
        {/* Tabs */}
        <div className="flex gap-1 flex-wrap">
          {tabValues.map((_, i) => (
            <button
              key={i}
              onClick={() => switchTab(i)}
              className={cn(
                'flex items-center gap-1.5 px-3 py-[6px] rounded-t-lg text-[12.5px] font-medium border border-b-0 transition-all',
                i === activeTab
                  ? 'bg-white text-ce-navy border-ce-border shadow-[0_-1px_0_0_white]'
                  : 'bg-ce-bg text-ce-muted border-transparent hover:border-ce-border hover:bg-white/70',
              )}
            >
              Form {i + 1}
              {tabCount > 1 && !isReadOnly && (
                <span
                  onClick={(e) => { e.stopPropagation(); deleteTab(i); }}
                  className="text-ce-hint hover:text-red-500 transition-colors leading-none cursor-pointer"
                >
                  <X size={11} />
                </span>
              )}
            </button>
          ))}
        </div>

        {/* Per-tab controls */}
        {!isReadOnly && (
          <div className="flex items-center gap-1 ml-2">
            <button
              onClick={addTab}
              title="Add a new form tab"
              className="flex items-center gap-1 px-2 py-[6px] rounded-lg text-[12px] text-ce-muted border border-ce-border bg-white hover:border-ce-navy hover:text-ce-navy transition-colors"
            >
              <Plus size={12} /> Add
            </button>
            <button
              onClick={refreshTab}
              title="Clear invoice-specific fields on this form"
              className="flex items-center gap-1 px-2 py-[6px] rounded-lg text-[12px] text-ce-muted border border-ce-border bg-white hover:border-ce-navy hover:text-ce-navy transition-colors"
            >
              <RotateCcw size={12} /> Refresh
            </button>
            {tabCount > 1 && (
              <button
                onClick={() => deleteTab(activeTab)}
                title="Delete this form"
                className="flex items-center gap-1 px-2 py-[6px] rounded-lg text-[12px] text-red-600 border border-red-200 bg-red-50 hover:bg-red-100 transition-colors"
              >
                <Trash2 size={12} /> Delete
              </button>
            )}
          </div>
        )}
      </div>

      {/* ── Main split (below tab strip) ──────────────────────────────────── */}
      <div className="flex flex-1 min-h-0 overflow-hidden border-t border-ce-border">

        {/* ── Left: form cards ─────────────────────────────────────────── */}
        <div className="flex-1 overflow-y-auto px-5 py-4 min-w-0 bg-ce-bg">

          {/* DB autofill button (only Form 1 when not already filled) */}
          {!autoFilled && !isReadOnly && activeTab === 0 && (
            <div className="flex justify-end mb-3">
              <button
                onClick={handleDbAutofill}
                disabled={autofill.isPending}
                className="flex items-center gap-1.5 text-[12.5px] text-[#1e4db7] border border-[#bfdbfe] bg-[#eff6ff] rounded-lg px-2.5 py-[7px] font-medium hover:bg-[#dbeafe] transition-colors disabled:opacity-60"
              >
                <Sparkles size={12} /> {autofill.isPending ? 'Filling…' : 'Autofill from previous'}
              </button>
            </div>
          )}

          {/* Vendor card */}
          <Card title="Vendor">
            <div className="grid grid-cols-2 gap-2.5">
              <FF label="Vendor name *">
                <AutocompleteInput
                  field="vendorName"
                  value={vendorName}
                  onChange={(v) => setValue('vendorName', v, { shouldDirty: true })}
                  onLinkedValue={(f, v) => setValue(f as keyof FormValues, v, { shouldDirty: true })}
                  placeholder="e.g. Acme Drilling Ltd"
                  ro={isReadOnly}
                />
              </FF>
              <FF label="Supplier number *">
                <AutocompleteInput
                  field="supplierNumber"
                  value={supplierNumber}
                  onChange={(v) => setValue('supplierNumber', v, { shouldDirty: true })}
                  placeholder="e.g. SUP-00441"
                  auto={autoFilled}
                  ro={isReadOnly}
                />
              </FF>
              <FF label="Invoice date *">
                <FI {...register('invoiceDate')} type="date" auto={autoFilled} disabled={isReadOnly} />
              </FF>
              <FF label="Date received *">
                <FI
                  value={workflow.createdAt
                    ? formatDate(workflow.createdAt, { day: '2-digit', month: 'short', year: 'numeric' })
                    : '—'}
                  ro readOnly
                />
              </FF>
            </div>
          </Card>

          {/* Invoice details card */}
          <Card title={tabCount > 1 ? `Invoice details — Form ${activeTab + 1}` : 'Invoice details'}>
            <fieldset disabled={isReadOnly} className="grid grid-cols-2 gap-2.5">
              <FF label="Invoice number *">
                <FI {...register('invoiceNumber')} placeholder="e.g. INV-2025-004" />
              </FF>
              <FF label="Invoice value *">
                <FI {...register('invoiceAmount')} type="number" step="0.01" placeholder="0.00" />
              </FF>
              <FF label="Currency *">
                <FSel {...register('currency')} auto>
                  {CURRENCIES.map((c) => <option key={c}>{c}</option>)}
                </FSel>
              </FF>
              <FF label="Contract number">
                <FI {...register('contractNumber')} auto placeholder="e.g. CT-2204-B" />
              </FF>
              <FF label="PO number">
                <FI {...register('poNumber')} auto placeholder="e.g. PO-8821" />
              </FF>
            </fieldset>

            {/* SES number rows */}
            <div className="mt-3">
              <div className="text-[11px] font-bold text-ce-muted uppercase tracking-[0.6px] pb-2 border-b border-ce-border mb-2">
                SES numbers
              </div>
              <div className="flex flex-col gap-1.5">
                {currentRows.map((row, i) => (
                  <div key={i} className="grid grid-cols-[1fr_1fr_28px] gap-1.5 items-center">
                    <FI
                      value={row.sesNumber}
                      onChange={(e) => updateSesRows((r) => r.map((x, j) => j === i ? { ...x, sesNumber: e.target.value } : x))}
                      placeholder="SES number"
                      disabled={isReadOnly}
                    />
                    <FI
                      value={row.amount}
                      onChange={(e) => updateSesRows((r) => r.map((x, j) => j === i ? { ...x, amount: e.target.value } : x))}
                      placeholder="Amount"
                      disabled={isReadOnly}
                    />
                    <button
                      type="button"
                      onClick={() => currentRows.length > 1 && updateSesRows((r) => r.filter((_, j) => j !== i))}
                      disabled={isReadOnly || currentRows.length <= 1}
                      className="w-6 h-6 border border-ce-border rounded-md flex items-center justify-center text-ce-muted hover:bg-red-50 hover:text-red-600 hover:border-red-200 transition-all disabled:opacity-30"
                    >
                      <X size={12} />
                    </button>
                  </div>
                ))}
              </div>
              {!isReadOnly && (
                <button
                  type="button"
                  onClick={() => updateSesRows((r) => [...r, { sesNumber: '', amount: '' }])}
                  className="mt-2 w-full flex items-center justify-center gap-1.5 border border-dashed border-ce-border2 rounded-lg py-1.5 text-[12px] text-ce-muted hover:border-ce-navy hover:text-ce-navy hover:bg-ce-bg transition-all"
                >
                  <Plus size={12} /> Add SES row
                </button>
              )}
            </div>
          </Card>

          {/* Contract & assignment card */}
          <Card title="Contract & assignment">
            <div className="grid grid-cols-2 gap-2.5">
              {/* Licence — combo: TEN / Jubilee / custom */}
              <FF label="Licence *">
                {showCustomLicence ? (
                  <div className="flex gap-1">
                    <FI
                      {...register('licence')}
                      placeholder="Enter licence name"
                      className="flex-1"
                      disabled={isReadOnly}
                    />
                    {!isReadOnly && (
                      <button
                        type="button"
                        onClick={() => { setShowCustomLicence(false); setValue('licence', 'TEN', { shouldDirty: true }); }}
                        className="px-2 py-[7px] border border-ce-border bg-ce-bg rounded-lg text-[11px] text-ce-muted hover:text-ce-navy transition-colors flex-shrink-0"
                        title="Switch back to standard options"
                      >
                        ← Standard
                      </button>
                    )}
                  </div>
                ) : (
                  <FSel
                    value={LICENCE_OPTIONS.includes(licenceValue as typeof LICENCE_OPTIONS[number]) ? licenceValue : 'TEN'}
                    onChange={(e) => {
                      if (e.target.value === '__other__') {
                        setShowCustomLicence(true);
                        setValue('licence', '', { shouldDirty: true });
                      } else {
                        setValue('licence', e.target.value, { shouldDirty: true });
                      }
                    }}
                    disabled={isReadOnly}
                    auto={autoFilled}
                  >
                    {LICENCE_OPTIONS.map((opt) => <option key={opt} value={opt}>{opt}</option>)}
                    <option value="__other__">Other (specify)…</option>
                  </FSel>
                )}
              </FF>

              <FF label="WBS / Cost code *">
                <FI {...register('wbsElement')} auto={autoFilled} placeholder="e.g. WBS-4410-221" disabled={isReadOnly} />
              </FF>
              <FF label="Contract holder name *">
                <AutocompleteInput
                  field="contractHolderName"
                  value={contractHolderName}
                  onChange={(v) => setValue('contractHolderName', v, { shouldDirty: true })}
                  onLinkedValue={(f, v) => setValue(f as keyof FormValues, v, { shouldDirty: true })}
                  placeholder="Full name"
                  auto={autoFilled}
                  ro={isReadOnly}
                />
              </FF>
              <FF label="Contract holder email *">
                <AutocompleteInput
                  field="contractHolderEmail"
                  value={contractHolderEmail}
                  onChange={(v) => setValue('contractHolderEmail', v, { shouldDirty: true })}
                  placeholder="email@tullow.com"
                  auto={autoFilled}
                  ro={isReadOnly}
                />
              </FF>
              <FF label="Cost engineer">
                <AutocompleteInput
                  field="ceName"
                  value={ceName}
                  onChange={(v) => setValue('ceName', v, { shouldDirty: true })}
                  placeholder="Cost engineer name"
                  auto={autoFilled}
                  ro={isReadOnly}
                />
              </FF>
              <FF label="Entered into SAP by">
                <AutocompleteInput
                  field="enteredBy"
                  value={enteredBy}
                  onChange={(v) => setValue('enteredBy', v, { shouldDirty: true })}
                  placeholder="Name"
                  ro={isReadOnly}
                />
              </FF>
              <FF label="Drive path" full>
                <FI {...register('drivePath')} auto={autoFilled} placeholder="/CostEngineering/SES/2026/..." disabled={isReadOnly} />
              </FF>
              <FF label={`Scope description * (${descWordCount}/${DESCRIPTION_MAX_WORDS} words)`} full>
                <FTA
                  {...register('description')}
                  auto={autoFilled}
                  rows={3}
                  placeholder="Scope of services rendered…"
                  disabled={isReadOnly}
                  className={cn(descWordCount > DESCRIPTION_MAX_WORDS && 'border-red-400 focus:border-red-500')}
                  onKeyDown={(e) => {
                    if (descWordCount >= DESCRIPTION_MAX_WORDS) {
                      const allowed = ['Backspace','Delete','ArrowLeft','ArrowRight','ArrowUp','ArrowDown','Home','End','Tab'];
                      if (!allowed.includes(e.key) && !e.ctrlKey && !e.metaKey) e.preventDefault();
                    }
                  }}
                />
                {descWordCount > DESCRIPTION_MAX_WORDS && (
                  <p className="text-[11px] text-red-500 mt-0.5">
                    Exceeds {DESCRIPTION_MAX_WORDS}-word limit — please shorten
                  </p>
                )}
              </FF>
              <FF label="Period from" >
                <FI {...register('periodFrom')} type="date" auto={autoFilled} disabled={isReadOnly} />
              </FF>
              <FF label="Period to">
                <FI {...register('periodTo')} type="date" auto={autoFilled} disabled={isReadOnly} />
              </FF>
            </div>
          </Card>

          {/* Supporting documents card */}
          <Card title="Supporting documents">
            <div className="flex items-center justify-between mb-2">
              <span className="text-[12px] text-ce-muted">Drag to reorder · Click × to remove from this form</span>
            </div>

            <div className="flex flex-col gap-1.5 mb-3">
              {/* Pinned Excel — always first */}
              <div className="flex items-center gap-2 px-2.5 py-2 bg-ce-bg border border-ce-border rounded-lg text-[13px]">
                <GripVertical size={14} className="text-ce-hint opacity-30" />
                <span className="text-green-600 text-sm">📊</span>
                <span className="flex-1 text-ce-text">Excel register (auto-generated)</span>
                <span className="text-[10px] font-bold bg-[#fdf6ec] text-[#92400e] px-1.5 py-px rounded-full border border-[#fcd34d]">
                  Always first
                </span>
              </div>

              {/* Email attachments */}
              {visibleAtts.map((att, i) => (
                <div
                  key={att.id}
                  draggable={!isReadOnly}
                  onDragStart={() => { dragAttIdx.current = i; }}
                  onDragOver={(e) => { e.preventDefault(); setDragOverIdx(i); }}
                  onDragLeave={() => setDragOverIdx(null)}
                  onDrop={(e) => { e.preventDefault(); handleAttDrop(i); }}
                  onDragEnd={() => { dragAttIdx.current = null; setDragOverIdx(null); }}
                  className={cn(
                    'flex items-center gap-2 px-2.5 py-2 border rounded-lg text-[13px] transition-all',
                    !isReadOnly && 'cursor-grab active:cursor-grabbing',
                    dragOverIdx === i
                      ? 'border-ce-navy bg-[#eff6ff] shadow-sm'
                      : 'bg-ce-bg border-ce-border',
                  )}
                >
                  <GripVertical size={14} className={cn('flex-shrink-0 transition-colors', isReadOnly ? 'text-ce-hint opacity-30' : 'text-ce-muted')} />
                  <span className="text-red-500 text-sm flex-shrink-0">📄</span>
                  <span className="flex-1 text-ce-text truncate">{att.fileName}</span>
                  {!isReadOnly && (
                    <button
                      type="button"
                      onClick={() => removeAtt(att.id)}
                      className="text-ce-hint hover:text-red-600 transition-colors p-0.5 flex-shrink-0"
                    >
                      <X size={13} />
                    </button>
                  )}
                </div>
              ))}

              {/* Removed notice */}
              {currentRemoved.size > 0 && (
                <div className="text-[12px] text-ce-muted px-2">
                  {currentRemoved.size} file{currentRemoved.size > 1 ? 's' : ''} removed from this form.{' '}
                  <button type="button" className="text-ce-navy underline" onClick={restoreAllAtts}>
                    Restore all
                  </button>
                </div>
              )}
            </div>

            {/* Drop zone */}
            {!isReadOnly && (
              <div className="border-[1.5px] border-dashed border-ce-border2 rounded-lg p-3.5 text-center cursor-pointer hover:border-ce-navy hover:bg-[#f0f5ff] transition-all mb-3">
                <CloudUpload size={22} className="text-ce-hint mx-auto mb-1.5" />
                <p className="text-[12px] text-ce-muted">Drag & drop or click to upload external files</p>
              </div>
            )}

            {/* Submit / Next / Preview */}
            {!isReadOnly && (
              <div className="flex gap-2 mt-1">
                <button
                  type="button"
                  onClick={handleSubmitOrNext}
                  disabled={submit.isPending}
                  className="flex-1 flex items-center justify-center gap-1.5 bg-ce-amber text-ce-navy3 border border-ce-amber rounded-lg py-2.5 px-3 text-[13px] font-medium hover:bg-ce-amber2 transition-colors disabled:opacity-60"
                >
                  {isLastTab ? (
                    <><Send size={13} /> {submit.isPending ? 'Submitting…' : 'Submit & send for approval'}</>
                  ) : (
                    <><ChevronRight size={13} /> Save & proceed to Form {activeTab + 2}</>
                  )}
                </button>
                <button
                  type="button"
                  onClick={handlePreviewMerge}
                  disabled={generatingPreview || isDirty}
                  title={isDirty ? 'Save draft first' : 'Generate merged preview'}
                  className="flex items-center justify-center gap-1.5 border border-ce-border bg-white text-ce-muted rounded-lg py-2.5 px-3 text-[13px] font-medium hover:bg-ce-bg transition-colors disabled:opacity-50"
                >
                  <Eye size={13} /> {generatingPreview ? 'Generating…' : 'Preview merge'}
                </button>
              </div>
            )}
          </Card>
        </div>

        {rightPanel}
      </div>

      {/* ── Reset modal ───────────────────────────────────────────────────── */}
      {showResetModal && (
        <div
          className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center"
          onClick={() => setShowResetModal(false)}
        >
          <div
            className="bg-white rounded-xl p-6 w-[400px] shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="text-[15px] font-semibold text-ce-navy mb-2">Reset form</div>
            <div className="text-[13px] text-ce-muted mb-5 leading-relaxed">
              Choose how to reset Form {activeTab + 1}. Manually entered data will be cleared.
            </div>
            <div className="flex flex-col gap-2">
              <button
                onClick={() => { handleDbAutofill(); setShowResetModal(false); }}
                className="flex items-center justify-center gap-2 bg-ce-navy text-white rounded-lg py-2 text-[13px] font-medium hover:bg-ce-navy2 transition-colors"
              >
                <Sparkles size={13} /> Fill with previous vendor data
              </button>
              <button
                onClick={() => {
                  reset({});
                  setSesRowsByTab((prev) => {
                    const next = [...prev];
                    next[activeTab] = [{ sesNumber: '', amount: '' }];
                    return next;
                  });
                  setAutoFilled(false);
                  setShowResetModal(false);
                }}
                className="flex items-center justify-center gap-2 bg-red-50 text-red-700 border border-red-200 rounded-lg py-2 text-[13px] font-medium hover:bg-red-100 transition-colors"
              >
                <Trash2 size={13} /> Clear all contents
              </button>
              <button
                onClick={() => setShowResetModal(false)}
                className="flex items-center justify-center border border-ce-border bg-white text-ce-muted rounded-lg py-2 text-[13px] font-medium hover:bg-ce-bg transition-colors"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

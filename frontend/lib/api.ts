import { getStoredToken, clearToken } from './auth';
import type {
  Workflow, WorkflowStats, SesForm, SesFields, FormVersion,
  Attachment, FormAttachment, ApprovalPageData, ApprovalEvent,
  TrackerRecord, TrackerStats, ManualItem, AdminUser, InboxSummary,
  ThreadMessage, SesDocument,
} from '@/types';

const API = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000';

// ── Base fetch ────────────────────────────────────────────────────────────────
interface ApiFetchOptions extends RequestInit {
  timeoutMs?: number; // default 30 s; use 0 to disable
}

async function apiFetch<T>(path: string, options: ApiFetchOptions = {}): Promise<T> {
  const { timeoutMs = 30_000, ...fetchOptions } = options;
  const token = getStoredToken();
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...(fetchOptions.headers as Record<string, string>),
  };
  if (token) headers['Authorization'] = `Bearer ${token}`;

  const controller = new AbortController();
  let timerId: ReturnType<typeof setTimeout> | undefined;
  if (timeoutMs > 0) {
    timerId = setTimeout(() => controller.abort('timeout'), timeoutMs);
  }

  let res: Response;
  try {
    res = await fetch(`${API}${path}`, { ...fetchOptions, headers, signal: controller.signal });
  } catch (err: unknown) {
    if ((err as Error)?.name === 'AbortError' || String(err).includes('timeout')) {
      throw new Error('Request timed out — the server is still processing. Please wait a moment and refresh.');
    }
    throw err;
  } finally {
    if (timerId) clearTimeout(timerId);
  }

  if (res.status === 401) {
    clearToken();
    if (typeof window !== 'undefined') window.location.href = '/login';
    throw new Error('Session expired');
  }

  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body?.error?.message || `API error ${res.status}`);
  }

  if (res.status === 204) return undefined as T;
  return res.json();
}

// ── Auth ──────────────────────────────────────────────────────────────────────
export const authApi = {
  me:     () => apiFetch<{ user: { userId: string; email: string; name: string; role: string } }>('/api/auth/me'),
  logout: () => apiFetch<void>('/api/auth/logout', { method: 'POST' }),
};

// ── Workflows ─────────────────────────────────────────────────────────────────
export const workflowsApi = {
  list:           () => apiFetch<{ workflows: Workflow[] }>('/api/workflows'),
  stats:          () => apiFetch<{ stats: WorkflowStats }>('/api/workflows/stats'),
  get:            (id: string) => apiFetch<{ workflow: Workflow }>(`/api/workflows/${id}`),
  getChildren:    (id: string) => apiFetch<{ children: Workflow[] }>(`/api/workflows/${id}/children`),
  setStatus:      (id: string, status: string) => apiFetch<{ workflow: Workflow }>(`/api/workflows/${id}/status`, { method: 'PATCH', body: JSON.stringify({ status }) }),
  setCategory:    (id: string, category: string) => apiFetch<{ workflow: Workflow }>(`/api/workflows/${id}/category`, { method: 'PATCH', body: JSON.stringify({ category }) }),
  acquireLock:    (id: string) => apiFetch<{ message: string }>(`/api/workflows/${id}/lock`, { method: 'POST' }),
  releaseLock:    (id: string) => apiFetch<{ message: string }>(`/api/workflows/${id}/lock`, { method: 'DELETE' }),
  markSent:       (id: string) => apiFetch<{ workflow: Workflow }>(`/api/workflows/${id}/mark-sent`, { method: 'POST' }),
  close:          (id: string) => apiFetch<{ workflow: Workflow }>(`/api/workflows/${id}/close`, { method: 'POST' }),
  getMessages:    (id: string) => apiFetch<{ messages: ThreadMessage[] }>(`/api/workflows/${id}/messages`),
  markRead:       (id: string) => apiFetch<{ ok: boolean }>(`/api/workflows/${id}/mark-read`, { method: 'POST' }),
  replyToVendor:  (id: string, comment: string) => apiFetch<{ message: string }>(`/api/workflows/${id}/reply`, { method: 'POST', body: JSON.stringify({ comment }) }),
};

// ── Emails / Inbox ────────────────────────────────────────────────────────────
export const emailsApi = {
  list:      (params?: Record<string, string>) => apiFetch<{ emails: ThreadMessage[] }>(`/api/emails${params ? '?' + new URLSearchParams(params) : ''}`),
  inboxData: () => apiFetch<{ summary: InboxSummary; recentWorkflows: Workflow[] }>('/api/emails/inbox'),
};

// ── SES Forms ─────────────────────────────────────────────────────────────────
export const sesApi = {
  create:      (workflowId: string, fields?: SesFields) => apiFetch<{ form: SesForm; version: FormVersion }>('/api/ses', { method: 'POST', body: JSON.stringify({ workflowId, fields }) }),
  get:         (id: string) => apiFetch<{ form: SesForm }>(`/api/ses/${id}`),
  byWorkflow:  (workflowId: string) => apiFetch<{ form: SesForm }>(`/api/ses/workflow/${workflowId}`),
  update:   (id: string, fields: SesFields) => apiFetch<{ form: SesForm; version: FormVersion }>(`/api/ses/${id}`, { method: 'PUT', body: JSON.stringify({ fields }) }),
  versions: (id: string) => apiFetch<{ versions: FormVersion[] }>(`/api/ses/${id}/versions`),
  submit:   (id: string) => apiFetch<{ message: string; workflowId: string }>(`/api/ses/${id}/submit`, { method: 'POST' }),
  autofill: (vendorName: string, poNumber?: string) => apiFetch<{ data: SesFields | null }>('/api/ses/autofill', { method: 'POST', body: JSON.stringify({ vendorName, poNumber }) }),
};

// ── Attachments ───────────────────────────────────────────────────────────────
export const attachmentsApi = {
  byWorkflow: (workflowId: string) => apiFetch<{ attachments: Attachment[] }>(`/api/attachments/workflow/${workflowId}`),
  uploadUrl:  (workflowId: string) => `${API}/api/attachments/upload?workflowId=${workflowId}`,
  serveUrl:   (id: string) => `${API}/api/attachments/${id}`,

  upload: (workflowId: string, file: File) => {
    const token = getStoredToken();
    const form = new FormData();
    form.append('file', file);
    form.append('workflowId', workflowId);
    return fetch(`${API}/api/attachments/upload`, {
      method:  'POST',
      headers: token ? { Authorization: `Bearer ${token}` } : {},
      body:    form,
    }).then((r) => r.json() as Promise<{ attachment: Attachment }>);
  },
};

// ── Form Attachments ──────────────────────────────────────────────────────────
export const formAttachmentsApi = {
  list:    (formId: string) => apiFetch<{ attachments: FormAttachment[] }>(`/api/form-attachments/form/${formId}`),
  add:     (formId: string, attachmentId: string, rank: number) => apiFetch<{ record: FormAttachment }>('/api/form-attachments', { method: 'POST', body: JSON.stringify({ formId, attachmentId, rank }) }),
  reorder: (formId: string, order: { attachmentId: string; rank: number }[]) => apiFetch<void>('/api/form-attachments/reorder', { method: 'PATCH', body: JSON.stringify({ formId, order }) }),
  remove:  (id: string) => apiFetch<void>(`/api/form-attachments/${id}`, { method: 'DELETE' }),
};

// ── Documents ─────────────────────────────────────────────────────────────────
export const documentsApi = {
  prefillExcel:     (formId: string, formIndex?: number) => apiFetch<{ attachment: Attachment }>('/api/documents/prefill-excel', { method: 'POST', body: JSON.stringify({ formId, formIndex }) }),
  savePdf:          (body: { workflowId: string; formId?: string; htmlContent: string; fileName?: string }) => apiFetch<{ attachment: Attachment }>('/api/documents/save-pdf', { method: 'POST', body: JSON.stringify(body) }),
  generateSesPdf:   (formId: string, formIndex?: number) => apiFetch<{ attachment: Attachment }>('/api/documents/generate-ses-pdf', { method: 'POST', body: JSON.stringify({ formId, formIndex }) }),
  generatePreview:  (formId: string, formIndex: number, attachmentIds: string[]) => apiFetch<{ document: SesDocument; docHash: string }>('/api/documents/generate-preview', { method: 'POST', body: JSON.stringify({ formId, formIndex, attachmentIds }) }),
  merge:            (workflowId: string, attachmentIds?: string[]) => apiFetch<{ attachment: Attachment; docHash: string }>('/api/documents/merge', { method: 'POST', body: JSON.stringify({ workflowId, attachmentIds }) }),
  previewUrl:       (attachmentId: string) => {
    const token = getStoredToken();
    return `${API}/api/documents/preview/${attachmentId}${token ? `?token=${encodeURIComponent(token)}` : ''}`;
  },
  sesDocUrl: (workflowId: string) => {
    const token = getStoredToken();
    return `${API}/api/documents/ses-doc/${workflowId}${token ? `?token=${encodeURIComponent(token)}` : ''}`;
  },
};

// ── SES Documents (merged PDFs — separate from attachments) ──────────────────
export const sesDocumentsApi = {
  listByWorkflow: (workflowId: string) =>
    apiFetch<{ documents: SesDocument[] }>(`/api/ses-documents/workflow/${workflowId}`),
  previewUrl: (id: string) => {
    const token = getStoredToken();
    return `${API}/api/ses-documents/${id}${token ? `?token=${encodeURIComponent(token)}` : ''}`;
  },
};

// ── Notifications ─────────────────────────────────────────────────────────────
import type { AppNotification } from '@/types';
export const notificationsApi = {
  list:       () => apiFetch<{ notifications: AppNotification[] }>('/api/notifications'),
  markRead:   (id: number) => apiFetch<{ ok: boolean }>(`/api/notifications/${id}/read`, { method: 'PATCH' }),
  markAllRead: () => apiFetch<{ ok: boolean }>('/api/notifications/read-all', { method: 'PATCH' }),
  dismiss:    (id: number) => apiFetch<{ ok: boolean }>(`/api/notifications/${id}`, { method: 'DELETE' }),
};

// ── Suggestions (field autocomplete) ─────────────────────────────────────────
export const suggestionsApi = {
  search: (field: string, q: string) =>
    apiFetch<{ suggestions: { value: string; linkedField: string | null; linkedValue: string | null }[] }>(
      `/api/suggestions?field=${encodeURIComponent(field)}&q=${encodeURIComponent(q)}`
    ),
  save: (items: { fieldName: string; value: string; linkedField?: string; linkedValue?: string }[]) =>
    apiFetch<{ saved: boolean }>('/api/suggestions', { method: 'POST', body: JSON.stringify({ items }) }),
};

// ── Approval ──────────────────────────────────────────────────────────────────
export const approvalApi = {
  pageData: (workflowId: string) =>
    apiFetch<ApprovalPageData>(`/api/approval/${workflowId}`),

  sign: (workflowId: string, signatureDataUrl?: string) =>
    apiFetch<{ message: string; workflowId: string; docHash: string }>(
      `/api/approval/${workflowId}/sign`,
      { method: 'POST', body: JSON.stringify({ confirmed: true, signatureDataUrl: signatureDataUrl ?? null }), timeoutMs: 180_000 }
    ),

  comment: (workflowId: string, comment: string) =>
    apiFetch<{ event: ApprovalEvent }>(
      `/api/approval/${workflowId}/comment`,
      { method: 'POST', body: JSON.stringify({ comment }) }
    ),

  query: (workflowId: string, comment: string) =>
    apiFetch<{ event: ApprovalEvent }>(
      `/api/approval/${workflowId}/query`,
      { method: 'POST', body: JSON.stringify({ comment }) }
    ),

  return: (workflowId: string, comment: string) =>
    apiFetch<{ event: ApprovalEvent }>(
      `/api/approval/${workflowId}/return`,
      { method: 'POST', body: JSON.stringify({ comment }) }
    ),

  reroute: (workflowId: string, email: string, name: string) =>
    apiFetch<{ message: string; workflowId: string }>(
      `/api/approval/${workflowId}/reroute`,
      { method: 'POST', body: JSON.stringify({ email, name }) }
    ),

  reply: (workflowId: string, comment: string) =>
    apiFetch<{ event: ApprovalEvent }>(
      `/api/approval/${workflowId}/reply`,
      { method: 'POST', body: JSON.stringify({ comment }) }
    ),

  getRecipients: (workflowId: string) =>
    apiFetch<{ toRecipients: { name: string; address: string }[]; ccRecipients: { name: string; address: string }[]; defaultBody: string }>(
      `/api/approval/${workflowId}/recipients`
    ),

  sendToVendor: (workflowId: string, params: { toRecipients: { name: string; address: string }[]; ccRecipients: { name: string; address: string }[]; body?: string }) =>
    apiFetch<{ message: string; workflowId: string }>(
      `/api/approval/${workflowId}/send-to-vendor`,
      { method: 'POST', body: JSON.stringify(params), timeoutMs: 180_000 }
    ),

  sendChild: (parentId: string, childId: string, params: { toRecipients: { name: string; address: string }[]; ccRecipients: { name: string; address: string }[]; body?: string }) =>
    apiFetch<{ message: string }>(
      `/api/approval/${parentId}/send-child/${childId}`,
      { method: 'POST', body: JSON.stringify(params), timeoutMs: 180_000 }
    ),

  sendAllApproved: (parentId: string, params: { toRecipients: { name: string; address: string }[]; ccRecipients: { name: string; address: string }[]; body?: string }) =>
    apiFetch<{ message: string; sent: number }>(
      `/api/approval/${parentId}/send-all-approved`,
      { method: 'POST', body: JSON.stringify(params), timeoutMs: 180_000 }
    ),

  complete: (parentId: string) =>
    apiFetch<{ message: string }>(
      `/api/approval/${parentId}/complete`,
      { method: 'POST' }
    ),
};

// ── Tracker ───────────────────────────────────────────────────────────────────
export const trackerApi = {
  list:         (params?: Record<string, string>) => apiFetch<{ records: TrackerRecord[] }>(`/api/tracker${params ? '?' + new URLSearchParams(params) : ''}`),
  stats:        (params?: Record<string, string>) => apiFetch<{ stats: TrackerStats }>(`/api/tracker/stats${params ? '?' + new URLSearchParams(params) : ''}`),
  monthlyCount: () => apiFetch<{ count: number }>('/api/tracker/monthly-count'),
};

// ── Others (manual items) ─────────────────────────────────────────────────────
export const othersApi = {
  list:    () => apiFetch<{ items: ManualItem[] }>('/api/others'),
  create:  (body: Partial<ManualItem>) => apiFetch<{ item: ManualItem }>('/api/others', { method: 'POST', body: JSON.stringify(body) }),
  update:  (id: string, body: Partial<ManualItem>) => apiFetch<{ item: ManualItem }>(`/api/others/${id}`, { method: 'PATCH', body: JSON.stringify(body) }),
  close:   (id: string) => apiFetch<{ message: string }>(`/api/others/${id}/close`, { method: 'POST' }),
  reopen:  (id: string) => apiFetch<{ message: string }>(`/api/others/${id}/reopen`, { method: 'POST' }),
  convert: (id: string) => apiFetch<{ workflowId: string }>(`/api/others/${id}/convert`, { method: 'POST' }),
  delete:  (id: string) => apiFetch<void>(`/api/others/${id}`, { method: 'DELETE' }),
};

// ── Admin ─────────────────────────────────────────────────────────────────────
export const adminApi = {
  listUsers:  () => apiFetch<{ users: AdminUser[] }>('/api/admin/users'),
  assignRole: (userId: string, role: string) => apiFetch<{ user: AdminUser }>(`/api/admin/users/${userId}/role`, { method: 'PATCH', body: JSON.stringify({ role }) }),
  deleteUser: (userId: string) => apiFetch<{ message: string }>(`/api/admin/users/${userId}`, { method: 'DELETE' }),
};

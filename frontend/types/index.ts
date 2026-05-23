// ── Users & Auth ──────────────────────────────────────────────────────────────
export type Role = 'user' | 'editor' | 'admin';

export interface User {
  userId: string;
  email: string;
  name: string;
  role: Role;
  msObjectId: string;
}

export interface AuthState {
  token: string | null;
  user: User | null;
  isAuthenticated: boolean;
  isLoading: boolean;
}

// ── Workflows ──────────────────────────────────────────────────────────────────
export type WorkflowStatus =
  | 'received'
  | 'in_progress'
  | 'pending_approval'
  | 'approved'
  | 'sent'
  | 'closed'
  | 'other'
  | 'queried'
  | 'returned'
  | 'cancelled';

export interface Workflow {
  id: string;
  conversationId: string | null;
  supplierName: string | null;
  invoiceNumber: string | null;
  invoiceDate: string | null;
  poNumber: string | null;
  amount: number | null;
  currency: string;
  contractHolderEmail: string | null;
  contractHolderName: string | null;
  category: string | null;
  status: WorkflowStatus;
  statusLabel: string;
  submittedAt: string | null;
  approvedAt: string | null;
  lockedBy: string | null;
  lockedByName: string | null;
  lockedByEmail: string | null;
  lockedAt: string | null;
  reroutedToEmail: string | null;
  reroutedToName: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface WorkflowStats {
  total: string;
  pendingCount: string;
  approvedCount: string;
  actionRequiredCount: string;
  overdueCount: string;
  avgDaysToSign: string | null;
}

// ── SES Forms ─────────────────────────────────────────────────────────────────
export interface SesForm {
  id: string;
  workflowId: string;
  createdBy: string;
  createdAt: string;
  fields: SesFields;
  currentVersion: number;
}

export interface SesFields {
  vendorName?: string;
  poNumber?: string;
  contractNumber?: string;
  invoiceNumber?: string;
  invoiceDate?: string;
  periodFrom?: string;
  periodTo?: string;
  currency?: string;
  invoiceAmount?: number;
  description?: string;
  costCode?: string;
  wbsElement?: string;
  contractHolderName?: string;
  contractHolderEmail?: string;
  ceName?: string;
  [key: string]: unknown;
}

export interface FormVersion {
  id: string;
  formId: string;
  versionNumber: number;
  data: SesFields;
  createdBy: string;
  createdByName: string;
  createdAt: string;
}

// ── Attachments ───────────────────────────────────────────────────────────────
export type AttachmentSource = 'email' | 'upload' | 'generated';

export interface Attachment {
  id: string;
  workflowId: string | null;
  fileName: string;
  storageKey: string;
  mimeType: string | null;
  size: number | null;
  source: AttachmentSource;
  createdAt: string;
}

export interface FormAttachment {
  id: string;
  formId: string;
  attachmentId: string;
  rank: number;
  fileName: string;
  mimeType: string | null;
  storageKey: string;
  size: number | null;
}

// ── Approval ──────────────────────────────────────────────────────────────────
export type ApprovalEventType = 'signed' | 'comment' | 'queried' | 'returned' | 'submitted' | 'rerouted';

export interface ApprovalEvent {
  id: string;
  workflowId: string;
  type: ApprovalEventType;
  userId: string;
  userName: string;
  userEmail: string;
  comment: string | null;
  docHash: string | null;
  reroutedToEmail: string | null;
  reroutedToName: string | null;
  createdAt: string;
}

export interface SesDoc {
  id: string;
  workflowId: string;
  attachmentId: string | null;
  storageKey: string;
  docHash: string;
  createdAt: string;
}

export interface SesDocument {
  id: string;
  workflowId: string;
  formIndex: number;
  fileName: string;
  storageKey: string;
  docHash: string;
  size: number | null;
  createdAt: string;
}

export interface ApprovalPageData {
  workflow: Workflow;
  mergedDoc: SesDoc | null;
  sesDocuments: SesDocument[];
  events: ApprovalEvent[];
  lockedByUser: { name: string; email: string } | null;
}

// ── Tracker ───────────────────────────────────────────────────────────────────
export interface TrackerRecord {
  workflowId: string;
  supplierName: string | null;
  invoiceNumber: string | null;
  poNumber: string | null;
  amount: number | null;
  currency: string;
  contractHolderEmail: string | null;
  contractHolderName: string | null;
  status: WorkflowStatus;
  statusLabel: string;
  receivedAt: string | null;
  submittedAt: string | null;
  approvedAt: string | null;
  daysToSign: number | null;
  daysToSubmit: number | null;
}

export interface TrackerStats {
  summary: {
    total: string;
    approved: string;
    pending: string;
    overdue: string;
    avgDaysToSign: string | null;
    avgDaysToSubmit: string | null;
  };
  byContractHolder: {
    contractHolderEmail: string;
    contractHolderName: string | null;
    total: string;
    avgDaysToSign: string | null;
  }[];
  byVendor: {
    supplierName: string | null;
    total: string;
    avgDaysToSign: string | null;
  }[];
}

// ── Manual Items (Others) ──────────────────────────────────────────────────────
export type ManualItemStatus = 'open' | 'closed';

export interface ManualItem {
  id: string;
  workflowId: string | null;
  category: string | null;
  description: string;
  supplierName: string | null;
  contractHolderEmail: string | null;
  status: ManualItemStatus;
  createdBy: string | null;
  createdAt: string;
  updatedAt: string;
  // joined from thread_messages via workflow_id
  senderEmail: string | null;
  senderName: string | null;
  subject: string | null;
  receivedAt: string | null;
  toRecipients: { emailAddress: { address: string; name?: string } }[] | null;
  ccRecipients: { emailAddress: { address: string; name?: string } }[] | null;
}

// ── Inbox ─────────────────────────────────────────────────────────────────────
export interface InboxSummary {
  totalWorkflows: string;
  unprocessed: string;
  inProgress: string;
  pendingApproval: string;
  approved: string;
  overdue: string;
}

export interface ThreadMessage {
  id: string;
  workflowId: string;
  messageId: string;
  conversationId: string;
  senderEmail: string | null;
  senderName: string | null;
  subject: string | null;
  bodyPreview: string | null;
  bodyHtml: string | null;
  toRecipients: { emailAddress: { name: string; address: string } }[] | null;
  ccRecipients: { emailAddress: { name: string; address: string } }[] | null;
  receivedAt: string | null;
  supplierName: string | null;
  status: WorkflowStatus;
  statusLabel: string;
}

// ── Admin ─────────────────────────────────────────────────────────────────────
export interface AdminUser {
  id: string;
  name: string;
  email: string;
  role: Role;
  createdAt: string;
}

// ── API responses ─────────────────────────────────────────────────────────────
export interface ApiError {
  error: { message: string; details?: { field: string; message: string }[] };
}

export interface LockResult {
  success: boolean;
  message?: string;
  lockedBy?: string;
}

// ── UI helpers ────────────────────────────────────────────────────────────────
export type ViewMode = 'editor' | 'contract-holder';

export interface NavItem {
  label: string;
  href: string;
  icon: string;
  roles: Role[];
}

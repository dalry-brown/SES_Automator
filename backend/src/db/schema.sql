


















































-- =============================================================================
-- Tullow CE SES Automator — Database Schema
-- =============================================================================

-- Enable UUID generation
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- =============================================================================
-- USERS
-- =============================================================================
CREATE TABLE IF NOT EXISTS users (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ms_object_id   TEXT NOT NULL UNIQUE,
  name           TEXT NOT NULL,
  email          TEXT NOT NULL UNIQUE,
  role           TEXT NOT NULL DEFAULT 'user'
                   CHECK (role IN ('user', 'editor', 'admin')),
  created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- =============================================================================
-- STATUSES  (lookup — seeded below)
-- =============================================================================
CREATE TABLE IF NOT EXISTS statuses (
  code        TEXT PRIMARY KEY,
  label       TEXT NOT NULL,
  description TEXT
);

-- =============================================================================
-- SES NUMBER SEQUENCES  (one row per calendar month, auto-incrementing)
-- =============================================================================
CREATE TABLE IF NOT EXISTS ses_numbers (
  id       SERIAL PRIMARY KEY,
  year     INT  NOT NULL,
  month    INT  NOT NULL,
  sequence INT  NOT NULL DEFAULT 0,
  UNIQUE (year, month)
);

-- =============================================================================
-- WORKFLOWS
-- =============================================================================
CREATE TABLE IF NOT EXISTS workflows (
  id                     TEXT PRIMARY KEY,          -- CE-YYYYMM-NNN
  conversation_id        TEXT UNIQUE,               -- MS Graph conversationId for thread matching
  supplier_name          TEXT,
  invoice_number         TEXT,
  invoice_date           DATE,
  po_number              TEXT,
  amount                 NUMERIC(18, 2),
  currency               TEXT NOT NULL DEFAULT 'USD',
  contract_holder_email  TEXT,                      -- used for role-scoped filtering
  contract_holder_name   TEXT,
  category               TEXT,
  status                 TEXT NOT NULL DEFAULT 'received'
                           REFERENCES statuses(code),
  submitted_at           TIMESTAMPTZ,
  approved_at            TIMESTAMPTZ,
  -- WIP locking
  locked_by              UUID REFERENCES users(id) ON DELETE SET NULL,
  locked_at              TIMESTAMPTZ,
  created_at             TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at             TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_workflows_status           ON workflows(status);
CREATE INDEX IF NOT EXISTS idx_workflows_contract_holder  ON workflows(contract_holder_email);
CREATE INDEX IF NOT EXISTS idx_workflows_conversation_id  ON workflows(conversation_id);
CREATE INDEX IF NOT EXISTS idx_workflows_locked_at        ON workflows(locked_at) WHERE locked_at IS NOT NULL;

-- =============================================================================
-- SES FORMS
-- =============================================================================
CREATE TABLE IF NOT EXISTS ses_forms (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workflow_id  TEXT NOT NULL REFERENCES workflows(id) ON DELETE CASCADE,
  created_by   UUID NOT NULL REFERENCES users(id),
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (workflow_id)
);

-- =============================================================================
-- FORM VERSIONS  (immutable — each save appends a new version)
-- =============================================================================
CREATE TABLE IF NOT EXISTS form_versions (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  form_id        UUID NOT NULL REFERENCES ses_forms(id) ON DELETE CASCADE,
  version_number INT  NOT NULL,
  data           JSONB NOT NULL,                    -- full SES form field snapshot
  created_by     UUID NOT NULL REFERENCES users(id),
  created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (form_id, version_number)
);

CREATE INDEX IF NOT EXISTS idx_form_versions_form_id ON form_versions(form_id);

-- =============================================================================
-- ATTACHMENTS
-- =============================================================================
CREATE TABLE IF NOT EXISTS attachments (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workflow_id  TEXT REFERENCES workflows(id) ON DELETE CASCADE,
  file_name    TEXT NOT NULL,
  storage_key  TEXT NOT NULL,                       -- relative path (local) or blob name (Azure)
  mime_type    TEXT,
  size         BIGINT,
  source       TEXT NOT NULL DEFAULT 'upload'
                 CHECK (source IN ('email', 'upload', 'generated')),
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_attachments_workflow_id ON attachments(workflow_id);

-- =============================================================================
-- FORM ATTACHMENTS  (ordered list of PDFs attached to a SES form for merging)
-- =============================================================================
CREATE TABLE IF NOT EXISTS form_attachments (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  form_id        UUID NOT NULL REFERENCES ses_forms(id) ON DELETE CASCADE,
  attachment_id  UUID NOT NULL REFERENCES attachments(id) ON DELETE CASCADE,
  rank           INT  NOT NULL DEFAULT 0,
  UNIQUE (form_id, attachment_id)
);

CREATE INDEX IF NOT EXISTS idx_form_attachments_form_id ON form_attachments(form_id);

-- =============================================================================
-- SES DOCS  (final merged/signed document per workflow)
-- Named: ses_{vendor_name}_{po_number} in storage
-- =============================================================================
CREATE TABLE IF NOT EXISTS ses_docs (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workflow_id  TEXT NOT NULL REFERENCES workflows(id) ON DELETE CASCADE,
  attachment_id UUID REFERENCES attachments(id),
  storage_key  TEXT NOT NULL,
  doc_hash     TEXT NOT NULL,                       -- SHA-256 of merged PDF
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_ses_docs_workflow_id ON ses_docs(workflow_id);

-- =============================================================================
-- TRACKER  (timestamps for duration analytics)
-- =============================================================================
CREATE TABLE IF NOT EXISTS tracker (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workflow_id   TEXT NOT NULL REFERENCES workflows(id) ON DELETE CASCADE,
  received_at   TIMESTAMPTZ,
  submitted_at  TIMESTAMPTZ,
  approved_at   TIMESTAMPTZ,
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (workflow_id)
);

-- =============================================================================
-- MANUAL ITEMS  (non-SES / "others" tracked manually by cost engineers)
-- =============================================================================
CREATE TABLE IF NOT EXISTS manual_items (
  id                     UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  description            TEXT NOT NULL,
  supplier_name          TEXT,
  invoice_number         TEXT,
  amount                 NUMERIC(18, 2),
  currency               TEXT NOT NULL DEFAULT 'USD',
  contract_holder_email  TEXT,
  status                 TEXT NOT NULL DEFAULT 'open'
                           CHECK (status IN ('open', 'closed')),
  created_by             UUID REFERENCES users(id),
  created_at             TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at             TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- =============================================================================
-- THREAD MESSAGES  (all emails in a conversation thread, linked to workflow)
-- =============================================================================
CREATE TABLE IF NOT EXISTS thread_messages (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workflow_id      TEXT NOT NULL REFERENCES workflows(id) ON DELETE CASCADE,
  message_id       TEXT NOT NULL UNIQUE,             -- MS Graph message ID
  conversation_id  TEXT NOT NULL,
  sender_email     TEXT,
  sender_name      TEXT,
  subject          TEXT,
  received_at      TIMESTAMPTZ,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_thread_messages_workflow_id      ON thread_messages(workflow_id);
CREATE INDEX IF NOT EXISTS idx_thread_messages_conversation_id  ON thread_messages(conversation_id);

-- =============================================================================
-- APPROVAL EVENTS  (audit trail: signed, commented, queried, returned)
-- =============================================================================
CREATE TABLE IF NOT EXISTS approval_events (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workflow_id  TEXT NOT NULL REFERENCES workflows(id) ON DELETE CASCADE,
  type         TEXT NOT NULL
                 CHECK (type IN ('signed', 'comment', 'queried', 'returned', 'submitted')),
  user_id      UUID NOT NULL REFERENCES users(id),
  comment      TEXT,
  doc_hash     TEXT,                                 -- SHA-256 snapshot at time of signing
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_approval_events_workflow_id ON approval_events(workflow_id);

-- =============================================================================
-- SEED: statuses lookup
-- =============================================================================
INSERT INTO statuses (code, label, description) VALUES
  ('received',         'Pending Review',    'Email received, SES form not yet submitted'),
  ('in_progress',      'In Progress',       'Cost engineer is filling out SES form'),
  ('pending_approval', 'Pending Approval',  'SES submitted, awaiting contract holder signature'),
  ('approved',         'Approved',          'Signed by contract holder'),
  ('sent',             'Sent',              'Approved SES document sent to vendor'),
  ('closed',           'Closed',            'Workflow closed'),
  ('queried',          'Queried',           'Contract holder has raised a query'),
  ('returned',         'Returned',          'Returned to cost engineer for correction'),
  ('cancelled',        'Cancelled',         'Workflow cancelled')
ON CONFLICT (code) DO UPDATE
  SET label = EXCLUDED.label, description = EXCLUDED.description;

-- =============================================================================
-- FUNCTION: auto-increment ses_numbers and return next CE-YYYYMM-NNN
-- =============================================================================
CREATE OR REPLACE FUNCTION next_workflow_id(p_date DATE DEFAULT CURRENT_DATE)
RETURNS TEXT LANGUAGE plpgsql AS $$
DECLARE
  v_year  INT := EXTRACT(YEAR  FROM p_date);
  v_month INT := EXTRACT(MONTH FROM p_date);
  v_seq   INT;
BEGIN
  INSERT INTO ses_numbers (year, month, sequence)
  VALUES (v_year, v_month, 1)
  ON CONFLICT (year, month)
  DO UPDATE SET sequence = ses_numbers.sequence + 1
  RETURNING sequence INTO v_seq;

  RETURN 'CE-' || v_year || LPAD(v_month::TEXT, 2, '0') || '-' || LPAD(v_seq::TEXT, 3, '0');
END;
$$;

-- =============================================================================
-- MIGRATIONS  (safe to re-run — ADD COLUMN IF NOT EXISTS)
-- =============================================================================
ALTER TABLE thread_messages ADD COLUMN IF NOT EXISTS body_preview    TEXT;
ALTER TABLE thread_messages ADD COLUMN IF NOT EXISTS body_html       TEXT;
ALTER TABLE thread_messages ADD COLUMN IF NOT EXISTS to_recipients   JSONB;
ALTER TABLE thread_messages ADD COLUMN IF NOT EXISTS cc_recipients   JSONB;

-- Reset any in_progress workflows back to received (in_progress is not a real status)
UPDATE workflows SET status = 'received' WHERE status = 'in_progress';

-- Add sent/closed to the status CHECK constraint (drop old, recreate)
ALTER TABLE workflows DROP CONSTRAINT IF EXISTS workflows_status_check;
ALTER TABLE workflows ADD CONSTRAINT workflows_status_check
  CHECK (status IN ('received','in_progress','pending_approval','approved','sent','closed','queried','returned','cancelled'));

-- =============================================================================
-- SES DOCUMENTS  (generated merged PDFs per form tab — separate from attachments)
-- Named: "SES {vendor} - {PO} - {invoice}.pdf" in storage
-- =============================================================================
CREATE TABLE IF NOT EXISTS ses_documents (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workflow_id  TEXT NOT NULL REFERENCES workflows(id) ON DELETE CASCADE,
  form_index   INT  NOT NULL DEFAULT 0,
  file_name    TEXT NOT NULL,
  storage_key  TEXT NOT NULL,
  doc_hash     TEXT NOT NULL,
  size         BIGINT,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (workflow_id, form_index)
);

CREATE INDEX IF NOT EXISTS idx_ses_documents_workflow_id ON ses_documents(workflow_id);

-- =============================================================================
-- APPROVAL FLOW MIGRATIONS
-- =============================================================================

-- Extend approval_events to include 'rerouted' action type
ALTER TABLE approval_events DROP CONSTRAINT IF EXISTS approval_events_type_check;
ALTER TABLE approval_events ADD CONSTRAINT approval_events_type_check
  CHECK (type IN ('signed', 'comment', 'queried', 'returned', 'submitted', 'rerouted'));

-- Store who a signing was re-routed to (on the event itself)
ALTER TABLE approval_events ADD COLUMN IF NOT EXISTS rerouted_to_email TEXT;
ALTER TABLE approval_events ADD COLUMN IF NOT EXISTS rerouted_to_name  TEXT;

-- Track the active contract holder even after re-routing
ALTER TABLE workflows ADD COLUMN IF NOT EXISTS rerouted_to_email TEXT;
ALTER TABLE workflows ADD COLUMN IF NOT EXISTS rerouted_to_name  TEXT;

const { fetchEmail, fetchAttachmentList, downloadAttachment } = require('../graph/mail');
const { save } = require('./storageService');
const { insertAttachment } = require('../db/queries/attachments');
const { findWorkflowByConversationId, appendThreadMessage } = require('./threadService');
const { generateWfId } = require('./workflowService');
const { emit } = require('./sseService');
const pool = require('../db/pool');

// Prevent concurrent ingestion of the same message (Graph can fire duplicate webhook notifications)
const _inProgressMessageIds = new Set();

async function ingestEmail(messageId) {
  if (_inProgressMessageIds.has(messageId)) {
    console.log(`[EmailService] Skipping duplicate in-flight notification for messageId: ${messageId}`);
    return null;
  }
  _inProgressMessageIds.add(messageId);
  try {
    return await _ingestEmailInner(messageId);
  } finally {
    _inProgressMessageIds.delete(messageId);
  }
}

async function _ingestEmailInner(messageId) {
  console.log(`[EmailService] Ingesting messageId: ${messageId}`);

  const email = await fetchEmail(messageId);
  const { subject, from, conversationId, receivedDateTime, bodyPreview, body, toRecipients, ccRecipients } = email;
  const senderEmail = from?.emailAddress?.address;
  const senderName  = from?.emailAddress?.name;

  // Skip emails sent FROM the monitored account itself — these are system
  // notification emails (approval alerts, etc.) not vendor messages.
  const monitoredAddress = (process.env.USER_EMAIL || '').toLowerCase();
  if (monitoredAddress && senderEmail?.toLowerCase() === monitoredAddress) {
    console.log(`[EmailService] Skipping self-sent email (from monitored account): ${subject}`);
    return null;
  }

  const invoiceNumber = _parseInvoiceNumber(subject);
  const supplierName  = senderName;
  const receivedAt    = new Date(receivedDateTime);

  // ── Thread match ──────────────────────────────────────────────────────────
  const existingWf = await findWorkflowByConversationId(conversationId);
  let workflowId;

  let isNewMessage = false;
  if (existingWf) {
    workflowId = existingWf.id;
    isNewMessage = true; // vendor reply on an existing thread
    console.log(`[EmailService] Thread match → workflow ${workflowId}`);

    // Status is intentionally NOT changed on vendor replies — only the first
    // inbound email sets the workflow to 'received'. Subsequent replies thread
    // into the existing workflow without affecting its status.
  } else {
    // Duplicate invoice warning (same supplier + invoice number)
    if (invoiceNumber && supplierName) {
      const { rows: dupes } = await pool.query(
        `SELECT id FROM workflows
         WHERE supplier_name ILIKE $1 AND invoice_number = $2
         LIMIT 1`,
        [supplierName, invoiceNumber]
      );
      if (dupes.length) {
        console.warn(
          `[EmailService] Duplicate invoice warning: "${supplierName}" / "${invoiceNumber}" already exists in workflow ${dupes[0].id}`
        );
      }
    }

    // Create new workflow
    workflowId = await generateWfId(receivedAt);
    await pool.query(
      `INSERT INTO workflows
         (id, conversation_id, supplier_name, invoice_number, status, created_at, updated_at)
       VALUES ($1, $2, $3, $4, 'received', $5, $5)`,
      [workflowId, conversationId, supplierName, invoiceNumber, receivedAt]
    );

    await pool.query(
      `INSERT INTO tracker (workflow_id, received_at)
       VALUES ($1, $2)
       ON CONFLICT (workflow_id) DO NOTHING`,
      [workflowId, receivedAt]
    );

    console.log(`[EmailService] Created workflow ${workflowId}`);
  }

  // ── Thread message ────────────────────────────────────────────────────────
  // appendThreadMessage returns null if message_id already exists (ON CONFLICT DO NOTHING).
  // If null, a prior call already processed this message — skip attachments entirely.
  const insertedMessage = await appendThreadMessage(workflowId, {
    messageId,
    conversationId,
    senderEmail,
    senderName,
    subject,
    receivedAt,
    bodyPreview:  bodyPreview ?? null,
    bodyHtml:     body?.contentType === 'html' ? body.content : null,
    toRecipients: toRecipients ?? null,
    ccRecipients: ccRecipients ?? null,
    isNew:        isNewMessage,
    isOutbound:   false,
  });

  if (!insertedMessage) {
    console.log(`[EmailService] messageId ${messageId} already stored — skipping attachments`);
    return workflowId;
  }

  // ── Attachments ───────────────────────────────────────────────────────────
  const attachmentList = await fetchAttachmentList(messageId);
  for (const att of attachmentList) {
    if (att['@odata.type'] !== '#microsoft.graph.fileAttachment') continue;

    const { name, contentType, buffer } = await downloadAttachment(messageId, att.id);
    const { storageKey } = await save(buffer, name, workflowId);

    await insertAttachment({
      workflowId,
      fileName:   name,
      storageKey,
      mimeType:   contentType,
      size:       buffer.length,
      source:     'email',
    });

    console.log(`[EmailService] Saved attachment "${name}" for workflow ${workflowId}`);
  }

  // Push real-time update to all connected browser clients
  emit('email.new', { workflowId, isNewThread: !existingWf });

  return workflowId;
}

function _parseInvoiceNumber(subject) {
  if (!subject) return null;
  const match = subject.match(/INV[-\s#]?(\w[\w-]*)/i);
  return match ? match[1].toUpperCase() : null;
}

module.exports = { ingestEmail };

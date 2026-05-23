const { fetchEmail, fetchAttachmentList, downloadAttachment } = require('../graph/mail');
const { save } = require('./storageService');
const { insertAttachment } = require('../db/queries/attachments');
const { findWorkflowByConversationId, appendThreadMessage } = require('./threadService');
const { generateWfId } = require('./workflowService');
const pool = require('../db/pool');

async function ingestEmail(messageId) {
  console.log(`[EmailService] Ingesting messageId: ${messageId}`);

  const email = await fetchEmail(messageId);
  const { subject, from, conversationId, receivedDateTime, bodyPreview, body, toRecipients, ccRecipients } = email;
  const senderEmail = from?.emailAddress?.address;
  const senderName  = from?.emailAddress?.name;

  const invoiceNumber = _parseInvoiceNumber(subject);
  const supplierName  = senderName;
  const receivedAt    = new Date(receivedDateTime);

  // ── Thread match ──────────────────────────────────────────────────────────
  const existingWf = await findWorkflowByConversationId(conversationId);
  let workflowId;

  if (existingWf) {
    workflowId = existingWf.id;
    console.log(`[EmailService] Thread match → workflow ${workflowId}`);
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
  await appendThreadMessage(workflowId, {
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
  });

  // ── Attachments ───────────────────────────────────────────────────────────
  const attachmentList = await fetchAttachmentList(messageId);
  for (const att of attachmentList) {
    if (att['@odata.type'] !== '#microsoft.graph.fileAttachment') continue;

    // Avoid duplicates if the same message is ingested more than once
    const { rows: existing } = await pool.query(
      `SELECT id FROM attachments WHERE workflow_id = $1 AND file_name = $2 AND source = 'email' LIMIT 1`,
      [workflowId, att.name]
    );
    if (existing.length) continue;

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

  return workflowId;
}

function _parseInvoiceNumber(subject) {
  if (!subject) return null;
  const match = subject.match(/INV[-\s#]?(\w[\w-]*)/i);
  return match ? match[1].toUpperCase() : null;
}

module.exports = { ingestEmail };

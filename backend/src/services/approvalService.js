'use strict';

const crypto = require('crypto');
const { PDFDocument, rgb, StandardFonts } = require('pdf-lib');
const pool = require('../db/pool');
const { camelizeRow, camelize } = require('../db/camelize');
const { read, save } = require('./storageService');
const { insertAttachment } = require('../db/queries/attachments');
const { sendReplyAll, sendCustomReply, sendDirectEmail } = require('../graph/mail');

const FRONTEND_URL = process.env.FRONTEND_URL || 'http://localhost:3000';

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

function approvalLink(workflowId) {
  return `${FRONTEND_URL}/workflows/${workflowId}/approval`;
}

async function getWorkflowOrThrow(workflowId) {
  const { rows } = await pool.query('SELECT * FROM workflows WHERE id = $1', [workflowId]);
  if (!rows.length) {
    const err = new Error('Workflow not found');
    err.status = 404;
    throw err;
  }
  return camelizeRow(rows[0]);
}

async function getSubmitterEmail(workflowId) {
  const { rows } = await pool.query(
    `SELECT u.email, u.name
     FROM approval_events ae
     JOIN users u ON u.id = ae.user_id
     WHERE ae.workflow_id = $1 AND ae.type = 'submitted'
     ORDER BY ae.created_at DESC
     LIMIT 1`,
    [workflowId]
  );
  return rows[0] || null;
}

// ─────────────────────────────────────────────────────────────────────────────
// GET approval page data
// ─────────────────────────────────────────────────────────────────────────────

async function getApprovalPageData(workflowId, user) {
  const { rows: wfRows } = await pool.query(
    `SELECT w.*, s.label AS status_label
     FROM workflows w
     LEFT JOIN statuses s ON s.code = w.status
     WHERE w.id = $1`,
    [workflowId]
  );
  if (!wfRows.length) {
    const err = new Error('Workflow not found');
    err.status = 404;
    throw err;
  }
  const workflow = camelizeRow(wfRows[0]);

  // Role-based access: 'user' (contract holder) may only see their assigned workflows
  if (user.role === 'user' && workflow.contractHolderEmail !== user.email) {
    const err = new Error('Access denied');
    err.status = 403;
    throw err;
  }

  const { rows: docRows } = await pool.query(
    'SELECT * FROM ses_docs WHERE workflow_id = $1', [workflowId]
  );

  const { rows: sesDocumentRows } = await pool.query(
    'SELECT * FROM ses_documents WHERE workflow_id = $1 ORDER BY form_index ASC',
    [workflowId]
  );

  const { rows: eventRows } = await pool.query(
    `SELECT ae.*, u.name AS user_name, u.email AS user_email
     FROM approval_events ae
     JOIN users u ON u.id = ae.user_id
     WHERE ae.workflow_id = $1
     ORDER BY ae.created_at ASC`,
    [workflowId]
  );

  let lockedByUser = null;
  if (workflow.lockedBy) {
    const { rows: lockRows } = await pool.query(
      'SELECT name, email FROM users WHERE id = $1', [workflow.lockedBy]
    );
    lockedByUser = lockRows[0] || null;
  }

  return {
    workflow,
    mergedDoc: docRows[0] ? camelizeRow(docRows[0]) : null,
    sesDocuments: camelize(sesDocumentRows),
    events: camelize(eventRows),
    lockedByUser,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// SIGN — embed signature image + certification block into PDF, approve workflow
// ─────────────────────────────────────────────────────────────────────────────

async function signWorkflow(workflowId, user, body) {
  const workflow = await getWorkflowOrThrow(workflowId);

  // Only the assigned contract holder (or admin) may sign
  if (
    user.role !== 'admin' &&
    workflow.contractHolderEmail &&
    workflow.contractHolderEmail !== user.email
  ) {
    const err = new Error('Only the assigned contract holder can sign this workflow');
    err.status = 403;
    throw err;
  }

  if (!['pending_approval', 'queried'].includes(workflow.status)) {
    const err = new Error(`Cannot sign a workflow with status "${workflow.status}"`);
    err.status = 400;
    throw err;
  }

  const { rows: docRows } = await pool.query(
    'SELECT * FROM ses_docs WHERE workflow_id = $1', [workflowId]
  );
  if (!docRows.length) {
    const err = new Error('No merged document found — generate a preview first');
    err.status = 400;
    throw err;
  }
  const sesDoc = camelizeRow(docRows[0]);

  const { rows: sesDocNameRows } = await pool.query(
    'SELECT file_name FROM ses_documents WHERE workflow_id = $1 ORDER BY form_index ASC LIMIT 1',
    [workflowId]
  );
  const mergedFileName = sesDocNameRows[0]?.file_name || `SES_${workflowId}.pdf`;

  const pdfBytes = await read(sesDoc.storageKey);
  const pdfDoc  = await PDFDocument.load(pdfBytes);
  const pages   = pdfDoc.getPages();
  const firstPage = pages[0];
  const { width } = firstPage.getSize();

  const font     = await pdfDoc.embedFont(StandardFonts.HelveticaBold);
  const fontReg  = await pdfDoc.embedFont(StandardFonts.Helvetica);
  const signedAt = new Date().toUTCString().replace(/GMT$/, 'UTC');

  // ── Embed drawn/typed signature image if provided ──────────────────────────
  const { signatureDataUrl } = body;
  let sigImgHeight = 0;
  const SIG_BLOCK_X = width * 0.5;
  const SIG_BLOCK_W = width * 0.47;
  const CERT_LINES  = [
    'DIGITALLY APPROVED',
    `Name:  ${user.name}`,
    `Email: ${user.email}`,
    `Date:  ${signedAt}`,
    `Ref:   ${workflowId}`,
  ];
  const LINE_H = 13;
  const certBlockH = LINE_H * CERT_LINES.length + 18;

  if (signatureDataUrl && signatureDataUrl.startsWith('data:image/png;base64,')) {
    const sigBuffer = Buffer.from(signatureDataUrl.split(',')[1], 'base64');
    const sigImage  = await pdfDoc.embedPng(sigBuffer);
    const sigDims   = sigImage.scaleToFit(SIG_BLOCK_W - 10, 60);
    sigImgHeight    = sigDims.height + 6;
    const sigY      = Math.max(certBlockH + sigImgHeight + 20, 120) - sigImgHeight;
    firstPage.drawImage(sigImage, {
      x:      SIG_BLOCK_X + 5,
      y:      sigY,
      width:  sigDims.width,
      height: sigDims.height,
    });
  }

  // ── Certification block ───────────────────────────────────────────────────
  const certY = Math.max(certBlockH + sigImgHeight + 20, 120) - certBlockH - sigImgHeight;
  firstPage.drawRectangle({
    x: SIG_BLOCK_X - 8, y: certY - 6,
    width:  SIG_BLOCK_W + 8,
    height: certBlockH,
    borderColor: rgb(0.2, 0.2, 0.6),
    borderWidth: 1,
    color: rgb(0.96, 0.97, 1),
  });
  CERT_LINES.forEach((line, i) => {
    firstPage.drawText(line, {
      x:    SIG_BLOCK_X,
      y:    certY + certBlockH - LINE_H * (i + 1),
      size: i === 0 ? 8.5 : 7.5,
      font: i === 0 ? font : fontReg,
      color: i === 0 ? rgb(0.1, 0.1, 0.55) : rgb(0.1, 0.1, 0.1),
    });
  });

  const signedBytes  = await pdfDoc.save();
  const signedBuffer = Buffer.from(signedBytes);
  const docHash      = crypto.createHash('sha256').update(signedBuffer).digest('hex');

  const { storageKey } = await save(signedBuffer, mergedFileName, workflowId);
  const signedAtt = await insertAttachment({
    workflowId,
    fileName:  mergedFileName,
    storageKey,
    mimeType:  'application/pdf',
    size:      signedBuffer.length,
    source:    'generated',
  });

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    await client.query(
      `UPDATE ses_docs
       SET attachment_id = $1, storage_key = $2, doc_hash = $3, created_at = NOW()
       WHERE workflow_id = $4`,
      [signedAtt.id, storageKey, docHash, workflowId]
    );

    await client.query(
      `INSERT INTO approval_events (workflow_id, type, user_id, doc_hash)
       VALUES ($1, 'signed', $2, $3)`,
      [workflowId, user.userId, docHash]
    );

    await client.query(
      `UPDATE workflows
       SET status = 'approved', approved_at = NOW(), updated_at = NOW()
       WHERE id = $1`,
      [workflowId]
    );
    await client.query(
      `UPDATE tracker SET approved_at = NOW(), updated_at = NOW() WHERE workflow_id = $1`,
      [workflowId]
    );

    await client.query('COMMIT');
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }

  // Notify CE that the document has been approved so they can do a final review
  const submitter = await getSubmitterEmail(workflowId);
  if (submitter) {
    try {
      await sendDirectEmail(
        submitter.email,
        `[SES Automator] Workflow ${workflowId} Approved`,
        `<p>Hi ${submitter.name},</p>
         <p>Workflow <strong>${workflowId}</strong> has been <strong>approved</strong> by ${user.name}.</p>
         <p>Please do a final review and then send it to the vendor when ready.</p>
         <p><a href="${approvalLink(workflowId)}">View workflow</a></p>`
      );
    } catch (e) {
      console.error('[ApprovalService] CE notification failed:', e.message);
    }
  }

  return { message: 'Workflow approved', workflowId, docHash };
}

// ─────────────────────────────────────────────────────────────────────────────
// QUERY — CH raises a query; status → queried; CE notified
// ─────────────────────────────────────────────────────────────────────────────

async function queryWorkflow(workflowId, user, comment) {
  const workflow = await getWorkflowOrThrow(workflowId);

  if (user.role === 'user' && workflow.contractHolderEmail !== user.email) {
    const err = new Error('Access denied');
    err.status = 403;
    throw err;
  }

  if (!['pending_approval', 'queried'].includes(workflow.status)) {
    const err = new Error(`Cannot query a workflow with status "${workflow.status}"`);
    err.status = 400;
    throw err;
  }

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query(
      `UPDATE workflows SET status = 'queried', updated_at = NOW() WHERE id = $1`,
      [workflowId]
    );
    const { rows } = await client.query(
      `INSERT INTO approval_events (workflow_id, type, user_id, comment)
       VALUES ($1, 'queried', $2, $3) RETURNING *`,
      [workflowId, user.userId, comment]
    );
    await client.query('COMMIT');

    return camelizeRow(rows[0]);
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// RETURN — CH returns form to CE for corrections; status → returned; CE notified
// ─────────────────────────────────────────────────────────────────────────────

async function returnWorkflow(workflowId, user, comment) {
  const workflow = await getWorkflowOrThrow(workflowId);

  if (user.role === 'user' && workflow.contractHolderEmail !== user.email) {
    const err = new Error('Access denied');
    err.status = 403;
    throw err;
  }

  if (!['pending_approval', 'queried'].includes(workflow.status)) {
    const err = new Error(`Cannot return a workflow with status "${workflow.status}"`);
    err.status = 400;
    throw err;
  }

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query(
      `UPDATE workflows SET status = 'returned', updated_at = NOW() WHERE id = $1`,
      [workflowId]
    );
    const { rows } = await client.query(
      `INSERT INTO approval_events (workflow_id, type, user_id, comment)
       VALUES ($1, 'returned', $2, $3) RETURNING *`,
      [workflowId, user.userId, comment]
    );
    await client.query('COMMIT');

    // Notify CE submitter directly — never reply to the vendor email thread
    const submitter = await getSubmitterEmail(workflowId);
    if (submitter) {
      try {
        const replyBody = `
          <p>Hi ${submitter.name},</p>
          <p>Contract holder <strong>${user.name}</strong> has returned workflow <strong>${workflowId}</strong> for corrections.</p>
          <blockquote style="border-left:3px solid #e44;padding-left:12px;color:#555">${comment}</blockquote>
          <p>Please update the form and resubmit for approval.</p>
          <p><a href="${FRONTEND_URL}/workflows/${workflowId}">Edit workflow</a></p>`;
        await sendDirectEmail(submitter.email, `[SES Automator] Workflow ${workflowId} Returned for Corrections`, replyBody);
      } catch (e) {
        console.error('[ApprovalService] Return notification failed:', e.message);
      }
    }

    return camelizeRow(rows[0]);
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// REROUTE — CH delegates signing to a different person; new CH notified
// ─────────────────────────────────────────────────────────────────────────────

async function rerouteWorkflow(workflowId, user, { email, name }) {
  const workflow = await getWorkflowOrThrow(workflowId);

  if (user.role === 'user' && workflow.contractHolderEmail !== user.email) {
    const err = new Error('Access denied');
    err.status = 403;
    throw err;
  }

  if (!['pending_approval', 'queried'].includes(workflow.status)) {
    const err = new Error(`Cannot re-route a workflow with status "${workflow.status}"`);
    err.status = 400;
    throw err;
  }

  if (!email || !name) {
    const err = new Error('New contract holder email and name are required');
    err.status = 400;
    throw err;
  }

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // Update the contract holder on the workflow so the new person can see it
    await client.query(
      `UPDATE workflows
       SET contract_holder_email = $1,
           contract_holder_name  = $2,
           status                = 'pending_approval',
           updated_at            = NOW()
       WHERE id = $3`,
      [email, name, workflowId]
    );

    await client.query(
      `INSERT INTO approval_events
         (workflow_id, type, user_id, comment, rerouted_to_email, rerouted_to_name)
       VALUES ($1, 'rerouted', $2, $3, $4, $5)`,
      [
        workflowId, user.userId,
        `Re-routed to ${name} (${email})`,
        email, name,
      ]
    );

    await client.query('COMMIT');

    // Email new contract holder
    try {
      await sendDirectEmail(
        email,
        `[SES Automator] Document Approval Required — ${workflowId}`,
        `<p>Hi ${name},</p>
         <p><strong>${user.name}</strong> has assigned you to approve workflow <strong>${workflowId}</strong>.</p>
         <p>Please review the document and approve or return it at your earliest convenience.</p>
         <p><a href="${approvalLink(workflowId)}" style="display:inline-block;padding:10px 20px;background:#1b3a6b;color:#fff;border-radius:6px;text-decoration:none">Review &amp; Approve</a></p>
         <p style="color:#888;font-size:12px">If the button does not work, copy this link: ${approvalLink(workflowId)}</p>`
      );
    } catch (e) {
      console.error('[ApprovalService] Re-route notification failed:', e.message);
    }

    return { message: `Workflow re-routed to ${name}`, workflowId };
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// ADD COMMENT — generic audit trail entry (no status change)
// ─────────────────────────────────────────────────────────────────────────────

async function addApprovalComment(workflowId, user, comment) {
  const { rows } = await pool.query(
    `INSERT INTO approval_events (workflow_id, type, user_id, comment)
     VALUES ($1, 'comment', $2, $3)
     RETURNING *`,
    [workflowId, user.userId, comment]
  );
  return camelizeRow(rows[0]);
}

// ─────────────────────────────────────────────────────────────────────────────
// REPLY — any authenticated user replies into the email thread (no status change)
// ─────────────────────────────────────────────────────────────────────────────

async function addApprovalReply(workflowId, user, comment) {
  await getWorkflowOrThrow(workflowId);
  const { rows } = await pool.query(
    `INSERT INTO approval_events (workflow_id, type, user_id, comment)
     VALUES ($1, 'comment', $2, $3)
     RETURNING *`,
    [workflowId, user.userId, comment]
  );
  return camelizeRow(rows[0]);
}

// ─────────────────────────────────────────────────────────────────────────────
// GET THREAD RECIPIENTS — returns To (original sender) + CC for the UI
// ─────────────────────────────────────────────────────────────────────────────

async function getThreadRecipients(workflowId) {
  const { rows } = await pool.query(
    `SELECT sender_email, sender_name, cc_recipients
     FROM thread_messages WHERE workflow_id = $1 ORDER BY received_at ASC LIMIT 1`,
    [workflowId]
  );

  if (!rows.length) return { toRecipients: [], ccRecipients: [] };

  const msg = rows[0];

  // The vendor (original sender) is the primary To
  const toRecipients = msg.sender_email
    ? [{ name: msg.sender_name || '', address: msg.sender_email }]
    : [];

  // CC recipients stored as JSON array of Graph API emailAddress objects
  let ccRecipients = [];
  if (msg.cc_recipients) {
    const raw = typeof msg.cc_recipients === 'string'
      ? JSON.parse(msg.cc_recipients)
      : msg.cc_recipients;
    ccRecipients = (Array.isArray(raw) ? raw : [])
      .map((r) => ({
        name:    r.emailAddress?.name    || r.name    || '',
        address: r.emailAddress?.address || r.address || '',
      }))
      .filter((r) => r.address);
  }

  return { toRecipients, ccRecipients };
}

// ─────────────────────────────────────────────────────────────────────────────
// SEND TO VENDOR — CE manually sends approved signed PDF to vendor via email
// ─────────────────────────────────────────────────────────────────────────────

async function sendToVendor(workflowId, user, { toRecipients, ccRecipients } = {}) {
  const workflow = await getWorkflowOrThrow(workflowId);

  if (workflow.status !== 'approved') {
    throw Object.assign(
      new Error(`Cannot send: workflow status is "${workflow.status}", expected "approved"`),
      { status: 400 }
    );
  }

  const { rows: docRows } = await pool.query(
    'SELECT * FROM ses_docs WHERE workflow_id = $1', [workflowId]
  );
  if (!docRows.length || !docRows[0].storage_key) {
    throw Object.assign(new Error('No signed document found'), { status: 400 });
  }
  const sesDoc = camelizeRow(docRows[0]);

  const { rows: threadRows } = await pool.query(
    `SELECT message_id FROM thread_messages
     WHERE workflow_id = $1 ORDER BY received_at ASC LIMIT 1`,
    [workflowId]
  );
  if (!threadRows.length) {
    throw Object.assign(
      new Error('No email thread found for this workflow — cannot reply to vendor'),
      { status: 400 }
    );
  }

  const signedBuffer = await read(sesDoc.storageKey);

  let fileName = `SES_${workflowId}_signed.pdf`;
  if (sesDoc.attachmentId) {
    const { rows: attRows } = await pool.query(
      'SELECT file_name FROM attachments WHERE id = $1', [sesDoc.attachmentId]
    );
    if (attRows[0]) fileName = attRows[0].file_name;
  }

  const approvedAt = workflow.approvedAt
    ? new Date(workflow.approvedAt).toUTCString().replace(/GMT$/, 'UTC')
    : new Date().toUTCString().replace(/GMT$/, 'UTC');

  const replyBody = `
    <p>Hi Team,</p>
    <p>Kindly find the attached approved SES for payment processing.</p>
    <p>Best Regards,<br/>Tullow Cost Engineering</p>
  `;

  // Use custom recipients if the CE edited the list, otherwise fall back to reply-all defaults
  const attachmentList = [{ name: fileName, contentType: 'application/pdf', buffer: signedBuffer }];
  if (toRecipients && toRecipients.length > 0) {
    await sendCustomReply(
      threadRows[0].message_id,
      replyBody,
      attachmentList,
      toRecipients,
      ccRecipients || []
    );
  } else {
    await sendReplyAll(threadRows[0].message_id, replyBody, attachmentList);
  }

  await pool.query(
    `UPDATE workflows SET status = 'sent', updated_at = NOW() WHERE id = $1`,
    [workflowId]
  );

  await pool.query(
    `INSERT INTO approval_events (workflow_id, type, user_id, comment)
     VALUES ($1, 'comment', $2, 'Document sent to vendor')`,
    [workflowId, user.userId]
  );

  return { message: 'Document sent to vendor', workflowId };
}

module.exports = {
  getApprovalPageData,
  signWorkflow,
  queryWorkflow,
  returnWorkflow,
  rerouteWorkflow,
  addApprovalComment,
  reply: addApprovalReply,
  sendToVendor,
  getThreadRecipients,
};

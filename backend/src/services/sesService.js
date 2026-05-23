'use strict';

const pool = require('../db/pool');
const { camelizeRow } = require('../db/camelize');
const {
  createSesForm,
  getSesFormByWorkflow,
  getSesForm,
  insertFormVersion,
  getLatestFormVersion,
  listFormVersions,
  getAutofillData,
} = require('../db/queries/ses');
const { sendDirectEmail } = require('../graph/mail');

const FRONTEND_URL  = process.env.FRONTEND_URL  || 'http://localhost:3000';

// Statuses where the form is NOT editable by a cost engineer
const READ_ONLY_STATUSES = ['pending_approval', 'queried', 'approved', 'sent', 'closed', 'cancelled'];

async function createSES(data, user) {
  const { workflowId } = data;
  if (!workflowId) {
    const err = new Error('workflowId is required');
    err.status = 400;
    throw err;
  }

  const existing = await getSesFormByWorkflow(workflowId);
  if (existing) {
    const err = new Error('SES form already exists for this workflow');
    err.status = 409;
    throw err;
  }

  const form = await createSesForm({ workflowId, createdBy: user.userId });

  const version = await insertFormVersion({
    formId: form.id,
    versionNumber: 1,
    data: data.fields || {},
    createdBy: user.userId,
  });

  return { form, version };
}

async function readSES(formId, user) {
  const form = await getSesForm(formId);
  if (!form) return null;

  if (user.role === 'user') {
    const { rows } = await pool.query(
      'SELECT contract_holder_email FROM workflows WHERE id = $1',
      [form.workflowId]
    );
    if (!rows.length || rows[0].contract_holder_email !== user.email) {
      const err = new Error('Access denied');
      err.status = 403;
      throw err;
    }
  }

  const latestVersion = await getLatestFormVersion(formId);
  return { ...form, fields: latestVersion?.data || {}, currentVersion: latestVersion?.versionNumber || 0 };
}

async function updateSES(formId, data, user) {
  const form = await getSesForm(formId);
  if (!form) {
    const err = new Error('SES form not found');
    err.status = 404;
    throw err;
  }

  // Guard: prevent edits when workflow is in a non-editable state
  const { rows: wfRows } = await pool.query(
    'SELECT status FROM workflows WHERE id = $1', [form.workflowId]
  );
  const status = wfRows[0]?.status;
  if (status && READ_ONLY_STATUSES.includes(status)) {
    const err = new Error(
      `This form cannot be edited while the workflow is in "${status}" status. ` +
      (status === 'pending_approval' || status === 'queried'
        ? 'The contract holder must return it before you can make changes.'
        : 'The workflow is finalized.')
    );
    err.status = 409;
    throw err;
  }

  const latest = await getLatestFormVersion(formId);
  const nextVersion = (latest?.versionNumber || 0) + 1;

  const version = await insertFormVersion({
    formId,
    versionNumber: nextVersion,
    data: data.fields || {},
    createdBy: user.userId,
  });

  return { form, version };
}

async function getSESVersions(formId) {
  return listFormVersions(formId);
}

async function submitSES(formId, user) {
  const form = await getSesForm(formId);
  if (!form) {
    const err = new Error('SES form not found');
    err.status = 404;
    throw err;
  }

  const latest = await getLatestFormVersion(formId);
  if (!latest) {
    const err = new Error('No form data saved — fill in the SES form before submitting');
    err.status = 400;
    throw err;
  }

  // Only allow submit from editable/returned states (not from already-approved)
  const { rows: wfRows } = await pool.query(
    'SELECT status, contract_holder_email, contract_holder_name, supplier_name, po_number, invoice_number, amount, currency FROM workflows WHERE id = $1',
    [form.workflowId]
  );
  const workflow = wfRows[0];
  if (!workflow) {
    const err = new Error('Workflow not found');
    err.status = 404;
    throw err;
  }
  if (['approved', 'sent', 'closed', 'cancelled'].includes(workflow.status)) {
    const err = new Error(`Cannot resubmit a workflow that is already "${workflow.status}"`);
    err.status = 409;
    throw err;
  }

  // Resolve contract holder from workflow or from form data (form data wins if set)
  const formData = latest.data || {};
  const formForms = formData.forms;
  const firstForm = Array.isArray(formForms) ? formForms[0] : formData;
  const chEmail = firstForm?.contractHolderEmail || workflow.contract_holder_email;
  const chName  = firstForm?.contractHolderName  || workflow.contract_holder_name || 'Contract Holder';

  // Update workflow contract holder if form has more current data
  const fieldsToSync = {};
  if (firstForm?.contractHolderEmail && firstForm.contractHolderEmail !== workflow.contract_holder_email) {
    fieldsToSync.contract_holder_email = firstForm.contractHolderEmail;
  }
  if (firstForm?.contractHolderName && firstForm.contractHolderName !== workflow.contract_holder_name) {
    fieldsToSync.contract_holder_name = firstForm.contractHolderName;
  }
  if (firstForm?.poNumber && !workflow.po_number) {
    fieldsToSync.po_number = firstForm.poNumber;
  }
  if (firstForm?.vendorName && !workflow.supplier_name) {
    fieldsToSync.supplier_name = firstForm.vendorName;
  }
  // Always sync invoice, amount, currency from form (they don't exist elsewhere)
  if (firstForm?.invoiceNumber) {
    fieldsToSync.invoice_number = firstForm.invoiceNumber;
  }
  if (firstForm?.invoiceAmount != null) {
    fieldsToSync.amount = parseFloat(firstForm.invoiceAmount) || null;
  }
  if (firstForm?.currency) {
    fieldsToSync.currency = firstForm.currency;
  }

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // Build update query dynamically for optional field syncing
    const setClauses = [
      'status = $1', 'submitted_at = NOW()', 'updated_at = NOW()',
    ];
    const params = ['pending_approval'];
    let idx = 2;
    for (const [col, val] of Object.entries(fieldsToSync)) {
      setClauses.push(`${col} = $${idx++}`);
      params.push(val);
    }
    params.push(form.workflowId);
    await client.query(
      `UPDATE workflows SET ${setClauses.join(', ')} WHERE id = $${idx}`,
      params
    );

    await client.query(
      `UPDATE tracker SET submitted_at = NOW(), updated_at = NOW() WHERE workflow_id = $1`,
      [form.workflowId]
    );

    await client.query(
      `INSERT INTO approval_events (workflow_id, type, user_id)
       VALUES ($1, 'submitted', $2)`,
      [form.workflowId, user.userId]
    );

    await client.query('COMMIT');
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }

  // Notify contract holder
  if (chEmail) {
    try {
      await sendDirectEmail(
        chEmail,
        `[SES Automator] Approval Required — ${form.workflowId}`,
        `<p>Hi ${chName},</p>
         <p>A Service Entry Sheet for workflow <strong>${form.workflowId}</strong> has been submitted and requires your approval.</p>
         ${workflow.supplier_name || firstForm?.vendorName ? `<p><strong>Vendor:</strong> ${workflow.supplier_name || firstForm?.vendorName}</p>` : ''}
         <p>Please review the document and approve, query, or return it for corrections.</p>
         <p>
           <a href="${FRONTEND_URL}/workflows/${form.workflowId}/approval"
              style="display:inline-block;padding:10px 20px;background:#1b3a6b;color:#fff;border-radius:6px;text-decoration:none">
             Review &amp; Approve
           </a>
         </p>
         <p style="color:#888;font-size:12px">
           If the button does not work, copy this link:<br/>
           ${FRONTEND_URL}/workflows/${form.workflowId}/approval
         </p>`
      );
    } catch (mailErr) {
      // Non-fatal — log and continue; the form was still submitted
      console.error('[SesService] CH notification email failed:', mailErr.message);
    }
  }

  return { message: 'Submitted for approval', workflowId: form.workflowId };
}

async function autofillSES(vendorName, poNumber) {
  if (!vendorName) {
    const err = new Error('vendorName is required');
    err.status = 400;
    throw err;
  }
  return getAutofillData(vendorName, poNumber);
}

module.exports = { createSES, readSES, updateSES, getSESVersions, submitSES, autofillSES };

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
const { emit } = require('./sseService');

// Regenerates the merged SES document for every form tab after submission.
// Uses the stored attOrder/removedAttachments so the document always matches
// what the CE last saved, including attachment order and removals.
// attachmentWorkflowId: for child workflows, pass the parent ID so email
//   attachments are looked up from the parent (children have none of their own).
// Runs fire-and-forget — errors are logged but never surface to the caller.
async function _regenerateDocuments(formId, workflowId, latest, attachmentWorkflowId = null) {
  const { generatePreview } = require('./documentService');
  const formData = latest?.data || {};
  const tabs     = Array.isArray(formData.forms) ? formData.forms : null;
  const count    = tabs ? tabs.length : 1;
  const attSource = attachmentWorkflowId || workflowId;

  for (let i = 0; i < count; i++) {
    const tab     = tabs ? tabs[i] : formData;
    const removed = new Set(tab?.removedAttachments ?? []);
    const order   = tab?.attOrder;

    let orderedIds;
    if (order && order.length > 0) {
      orderedIds = order.filter((id) => !removed.has(id));
    } else {
      const { rows } = await pool.query(
        `SELECT id FROM attachments WHERE workflow_id = $1 AND source = 'email' ORDER BY created_at`,
        [attSource]
      );
      orderedIds = rows.map((r) => r.id).filter((id) => !removed.has(id));
    }

    await generatePreview(formId, i, orderedIds);
    console.log(`[SesService] Regenerated document for workflow ${workflowId} form ${i}`);
  }
}

const FRONTEND_URL  = process.env.FRONTEND_URL  || 'http://localhost:3000';

// Statuses where the form is NOT editable by a cost engineer
const READ_ONLY_STATUSES = ['approved', 'sent', 'closed', 'cancelled'];

// Statuses that mean a child is already in-flight or done — skip during re-submit
const CHILD_SKIP_STATUSES = ['pending_approval', 'approved', 'sent', 'closed', 'cancelled'];

// ─── Multi-tab submission: create/re-submit one child workflow per tab ────────
async function _submitMultiTab(form, tabs, user) {
  const parentId = form.workflowId;

  const { rows: [parentWf] } = await pool.query(
    'SELECT * FROM workflows WHERE id = $1', [parentId]
  );
  if (!parentWf) throw Object.assign(new Error('Workflow not found'), { status: 404 });

  if (['approved', 'sent', 'closed', 'cancelled'].includes(parentWf.status)) {
    throw Object.assign(
      new Error(`Cannot submit: workflow is already "${parentWf.status}"`),
      { status: 409 }
    );
  }

  // Load existing children (for re-submissions after a return)
  const { rows: existingChildren } = await pool.query(
    `SELECT w.id, w.sub_index, w.status, sf.id AS form_id
     FROM workflows w
     LEFT JOIN ses_forms sf ON sf.workflow_id = w.id
     WHERE w.parent_workflow_id = $1
     ORDER BY w.sub_index`,
    [parentId]
  );
  const childByIndex = {};
  for (const c of existingChildren) childByIndex[c.sub_index] = c;

  const client = await pool.connect();
  const submitted = []; // { childId, formId, chEmail, chName, tabIndex }

  try {
    await client.query('BEGIN');

    for (let i = 0; i < tabs.length; i++) {
      const tab      = tabs[i];
      const subLabel = String.fromCharCode(65 + i); // A, B, C …
      const childId  = `${parentId}-${subLabel}`;
      const chEmail  = tab.contractHolderEmail || parentWf.contract_holder_email;
      const chName   = tab.contractHolderName  || parentWf.contract_holder_name || 'Contract Holder';
      const existing = childByIndex[i];

      // Already in-flight or finalized — skip without error
      if (existing && CHILD_SKIP_STATUSES.includes(existing.status)) continue;

      // Strip UI-only keys; keep attachment metadata so doc regen works
      const { sesRows = [], removedAttachments, attOrder, ...tabFields } = tab;
      const childData = { ...tabFields, sesRows };
      if (attOrder)           childData.attOrder           = attOrder;
      if (removedAttachments) childData.removedAttachments = removedAttachments;

      let childFormId;

      if (!existing) {
        // ── Brand-new child workflow ──────────────────────────────────────
        await client.query(
          `INSERT INTO workflows (
             id, conversation_id, supplier_name, invoice_number, po_number,
             amount, currency, contract_holder_email, contract_holder_name,
             status, submitted_at, parent_workflow_id, sub_label, sub_index,
             created_at, updated_at
           ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,'pending_approval',NOW(),$10,$11,$12,NOW(),NOW())`,
          [
            childId,
            parentWf.conversation_id,
            tab.vendorName    || parentWf.supplier_name,
            tab.invoiceNumber || null,
            tab.poNumber      || parentWf.po_number,
            parseFloat(tab.invoiceAmount) || null,
            tab.currency      || parentWf.currency || 'USD',
            chEmail, chName,
            parentId, subLabel, i,
          ]
        );

        const { rows: [sf] } = await client.query(
          `INSERT INTO ses_forms (workflow_id, created_by) VALUES ($1,$2) RETURNING id`,
          [childId, user.userId]
        );
        childFormId = sf.id;

        await client.query(
          `INSERT INTO form_versions (form_id, version_number, data, created_by)
           VALUES ($1, 1, $2, $3)`,
          [childFormId, JSON.stringify(childData), user.userId]
        );

        await client.query(
          `INSERT INTO tracker (workflow_id, received_at, submitted_at)
           VALUES ($1, NOW(), NOW())
           ON CONFLICT (workflow_id) DO UPDATE SET submitted_at = NOW(), updated_at = NOW()`,
          [childId]
        );
      } else {
        // ── Re-submit a returned/received child ───────────────────────────
        childFormId = existing.form_id;

        if (childFormId) {
          const { rows: [latestVer] } = await client.query(
            `SELECT version_number FROM form_versions WHERE form_id = $1
             ORDER BY version_number DESC LIMIT 1`,
            [childFormId]
          );
          const nextVer = (latestVer?.version_number || 0) + 1;
          await client.query(
            `INSERT INTO form_versions (form_id, version_number, data, created_by)
             VALUES ($1,$2,$3,$4)`,
            [childFormId, nextVer, JSON.stringify(childData), user.userId]
          );
        }

        await client.query(
          `UPDATE workflows
           SET status = 'pending_approval', submitted_at = NOW(), updated_at = NOW(),
               contract_holder_email = $2, contract_holder_name = $3,
               supplier_name = $4, invoice_number = $5, po_number = $6,
               amount = $7, currency = $8
           WHERE id = $1`,
          [
            childId, chEmail, chName,
            tab.vendorName    || null,
            tab.invoiceNumber || null,
            tab.poNumber      || null,
            parseFloat(tab.invoiceAmount) || null,
            tab.currency      || 'USD',
          ]
        );
      }

      await client.query(
        `INSERT INTO approval_events (workflow_id, type, user_id) VALUES ($1,'submitted',$2)`,
        [childId, user.userId]
      );

      submitted.push({ childId, formId: childFormId, chEmail, chName, tabIndex: i });
    }

    // Update parent status + tracker
    await client.query(
      `UPDATE workflows
       SET status = 'pending_approval', submitted_at = NOW(), updated_at = NOW()
       WHERE id = $1`,
      [parentId]
    );
    await client.query(
      `UPDATE tracker SET submitted_at = NOW(), updated_at = NOW() WHERE workflow_id = $1`,
      [parentId]
    );
    await client.query(
      `INSERT INTO approval_events (workflow_id, type, user_id) VALUES ($1,'submitted',$2)`,
      [parentId, user.userId]
    );

    await client.query('COMMIT');
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }

  emit('workflow.updated', { workflowId: parentId });

  // Fire-and-forget per child: document generation + CH approval email
  for (const { childId, formId, chEmail, chName, tabIndex } of submitted) {
    const tab = tabs[tabIndex];

    if (formId) {
      getLatestFormVersion(formId).then((childLatest) =>
        _regenerateDocuments(formId, childId, childLatest, parentId)
      ).catch((e) => console.error(`[SesService] Doc regen failed for ${childId}:`, e.message));
    }

    if (chEmail) {
      sendDirectEmail(
        chEmail,
        `[SES Automator] Approval Required — ${childId}`,
        `<p>Hi ${chName},</p>
         <p>A Service Entry Sheet for workflow <strong>${childId}</strong> has been submitted and requires your approval.</p>
         ${tab.vendorName ? `<p><strong>Vendor:</strong> ${tab.vendorName}</p>` : ''}
         <p>Please review the document and approve, query, or return it for corrections.</p>
         <p>
           <a href="${FRONTEND_URL}/workflows/${childId}/approval"
              style="display:inline-block;padding:10px 20px;background:#1b3a6b;color:#fff;border-radius:6px;text-decoration:none">
             Review &amp; Approve
           </a>
         </p>
         <p style="color:#888;font-size:12px">
           If the button does not work, copy this link:<br/>
           ${FRONTEND_URL}/workflows/${childId}/approval
         </p>`
      ).catch((e) => console.error(`[SesService] CH email failed for ${childId}:`, e.message));
    }
  }

  return {
    message: `Submitted ${submitted.length} form(s) for approval`,
    workflowId: parentId,
    children: submitted.map((r) => r.childId),
  };
}

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

  // Sync updated tab data into each editable child's form_versions.
  // Skips children that are approved/sent/closed (immutable).
  const newTabs = data.fields?.forms;
  if (Array.isArray(newTabs) && newTabs.length > 1) {
    const { rows: children } = await pool.query(
      `SELECT w.id, w.sub_index, w.status, sf.id AS form_id
       FROM workflows w
       JOIN ses_forms sf ON sf.workflow_id = w.id
       WHERE w.parent_workflow_id = $1
       ORDER BY w.sub_index`,
      [form.workflowId]
    );

    for (const child of children) {
      if (['approved', 'sent', 'closed', 'cancelled'].includes(child.status)) continue;
      if (child.sub_index >= newTabs.length) continue;

      const tab = newTabs[child.sub_index];
      const { sesRows = [], removedAttachments, attOrder, ...tabFields } = tab;
      const childData = { ...tabFields, sesRows };
      if (attOrder)           childData.attOrder           = attOrder;
      if (removedAttachments) childData.removedAttachments = removedAttachments;

      const { rows: [latestVer] } = await pool.query(
        `SELECT version_number FROM form_versions WHERE form_id = $1
         ORDER BY version_number DESC LIMIT 1`,
        [child.form_id]
      );
      const childNextVer = (latestVer?.version_number || 0) + 1;

      await insertFormVersion({
        formId: child.form_id,
        versionNumber: childNextVer,
        data: childData,
        createdBy: user.userId,
      });
    }
  }

  return { form, version };
}

async function getSESVersions(formId) {
  return listFormVersions(formId);
}

async function submitSES(formId, user) {
  const form = await getSesForm(formId);
  if (!form) throw Object.assign(new Error('SES form not found'), { status: 404 });

  const latest = await getLatestFormVersion(formId);
  if (!latest) {
    throw Object.assign(
      new Error('No form data saved — fill in the SES form before submitting'),
      { status: 400 }
    );
  }

  // Multi-tab: branch into independent child workflows
  const formData = latest.data || {};
  const tabs = Array.isArray(formData.forms) ? formData.forms : null;
  if (tabs && tabs.length > 1) {
    return _submitMultiTab(form, tabs, user);
  }

  // ── Single-tab: existing flow ─────────────────────────────────────────────
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

  emit('workflow.updated', { workflowId: form.workflowId });

  // Regenerate merged document in the background so the contract holder always
  // sees a PDF that reflects the current saved form fields and attachment order.
  _regenerateDocuments(form.id, form.workflowId, latest).catch((e) => {
    console.error('[SesService] Background document regeneration failed:', e.message);
  });

  // Notify contract holder
  if (chEmail) {
    try {
      await sendDirectEmail(
        chEmail,
        `[SES Automator] Approval Required — ${form.workflowId}`,
        `<p>Hi ${chName},</p>
         <p>A Service Entry Sheet for workflow <strong>${form.workflowId}</strong> has been submitted and requires your approval.</p>
         ${firstForm?.vendorName || workflow.supplier_name ? `<p><strong>Vendor:</strong> ${firstForm?.vendorName || workflow.supplier_name}</p>` : ''}
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

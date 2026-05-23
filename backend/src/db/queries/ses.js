const pool = require('../pool');
const { camelize, camelizeRow } = require('../camelize');

async function createSesForm({ workflowId, createdBy }) {
  const { rows } = await pool.query(
    `INSERT INTO ses_forms (workflow_id, created_by)
     VALUES ($1, $2)
     RETURNING *`,
    [workflowId, createdBy]
  );
  return camelizeRow(rows[0]);
}

async function getSesForm(formId) {
  const { rows } = await pool.query('SELECT * FROM ses_forms WHERE id = $1', [formId]);
  return rows[0] ? camelizeRow(rows[0]) : null;
}

async function getSesFormByWorkflow(workflowId) {
  const { rows } = await pool.query('SELECT * FROM ses_forms WHERE workflow_id = $1', [workflowId]);
  return rows[0] ? camelizeRow(rows[0]) : null;
}

async function insertFormVersion({ formId, versionNumber, data, createdBy }) {
  const { rows } = await pool.query(
    `INSERT INTO form_versions (form_id, version_number, data, created_by)
     VALUES ($1, $2, $3, $4)
     RETURNING *`,
    [formId, versionNumber, JSON.stringify(data), createdBy]
  );
  return camelizeRow(rows[0]);
}

async function getLatestFormVersion(formId) {
  const { rows } = await pool.query(
    `SELECT * FROM form_versions
     WHERE form_id = $1
     ORDER BY version_number DESC
     LIMIT 1`,
    [formId]
  );
  return rows[0] ? camelizeRow(rows[0]) : null;
}

async function listFormVersions(formId) {
  const { rows } = await pool.query(
    `SELECT fv.*, u.name AS created_by_name
     FROM form_versions fv
     LEFT JOIN users u ON u.id = fv.created_by
     WHERE fv.form_id = $1
     ORDER BY fv.version_number DESC`,
    [formId]
  );
  return camelize(rows);
}

async function getAutofillData(vendorName, poNumber) {
  const { rows } = await pool.query(
    `SELECT fv.data
     FROM form_versions fv
     JOIN ses_forms sf ON sf.id = fv.form_id
     JOIN workflows w  ON w.id  = sf.workflow_id
     WHERE w.supplier_name ILIKE $1
       AND ($2::TEXT IS NULL OR w.po_number = $2)
       AND w.status = 'approved'
     ORDER BY fv.created_at DESC
     LIMIT 1`,
    [vendorName, poNumber || null]
  );
  return rows[0]?.data || null;
}

module.exports = {
  createSesForm,
  getSesForm,
  getSesFormByWorkflow,
  insertFormVersion,
  getLatestFormVersion,
  listFormVersions,
  getAutofillData,
};

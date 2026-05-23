const pool = require('../pool');
const { camelize, camelizeRow } = require('../camelize');

async function insertAttachment({ workflowId, fileName, storageKey, mimeType, size, source }) {
  const { rows } = await pool.query(
    `INSERT INTO attachments (workflow_id, file_name, storage_key, mime_type, size, source)
     VALUES ($1, $2, $3, $4, $5, $6)
     RETURNING *`,
    [workflowId, fileName, storageKey, mimeType, size, source || 'upload']
  );
  return camelizeRow(rows[0]);
}

async function getAttachment(id) {
  const { rows } = await pool.query('SELECT * FROM attachments WHERE id = $1', [id]);
  return rows[0] ? camelizeRow(rows[0]) : null;
}

async function getAttachmentsByWorkflow(workflowId) {
  const { rows } = await pool.query(
    'SELECT * FROM attachments WHERE workflow_id = $1 ORDER BY created_at ASC',
    [workflowId]
  );
  return camelize(rows);
}

async function deleteAttachment(id) {
  await pool.query('DELETE FROM attachments WHERE id = $1', [id]);
}

module.exports = { insertAttachment, getAttachment, getAttachmentsByWorkflow, deleteAttachment };

const pool = require('../pool');
const { camelize, camelizeRow } = require('../camelize');

async function addFormAttachment({ formId, attachmentId, rank }) {
  const { rows } = await pool.query(
    `INSERT INTO form_attachments (form_id, attachment_id, rank)
     VALUES ($1, $2, $3)
     ON CONFLICT (form_id, attachment_id) DO UPDATE SET rank = EXCLUDED.rank
     RETURNING *`,
    [formId, attachmentId, rank]
  );
  return camelizeRow(rows[0]);
}

async function getFormAttachments(formId) {
  const { rows } = await pool.query(
    `SELECT fa.*, a.file_name, a.mime_type, a.storage_key, a.size
     FROM form_attachments fa
     JOIN attachments a ON a.id = fa.attachment_id
     WHERE fa.form_id = $1
     ORDER BY fa.rank ASC`,
    [formId]
  );
  return camelize(rows);
}

async function reorderFormAttachments(formId, order) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    for (const { attachmentId, rank } of order) {
      await client.query(
        'UPDATE form_attachments SET rank = $1 WHERE form_id = $2 AND attachment_id = $3',
        [rank, formId, attachmentId]
      );
    }
    await client.query('COMMIT');
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

async function removeFormAttachment(id) {
  await pool.query('DELETE FROM form_attachments WHERE id = $1', [id]);
}

module.exports = { addFormAttachment, getFormAttachments, reorderFormAttachments, removeFormAttachment };

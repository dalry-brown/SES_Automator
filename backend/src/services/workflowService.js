const pool = require('../db/pool');
const { camelizeRow } = require('../db/camelize');

async function generateWfId(date = new Date()) {
  const d = date instanceof Date ? date : new Date(date);
  const isoDate = d.toISOString().slice(0, 10);
  const { rows } = await pool.query('SELECT next_workflow_id($1::DATE) AS id', [isoDate]);
  return rows[0].id;
}

// Convert a manual "Others" item back to SES pending review.
// Simply flips the linked workflow status to 'received' and closes the manual item.
async function convertOtherToWorkflow(otherId) {
  const { rows } = await pool.query('SELECT * FROM manual_items WHERE id = $1', [otherId]);
  if (!rows.length) {
    const err = new Error('Manual item not found');
    err.status = 404;
    throw err;
  }
  const item = camelizeRow(rows[0]);

  if (!item.workflowId) {
    const err = new Error('This item has no linked workflow and cannot be converted');
    err.status = 400;
    throw err;
  }

  await pool.query(
    "UPDATE workflows SET status = 'received', updated_at = NOW() WHERE id = $1",
    [item.workflowId]
  );
  await pool.query(
    'DELETE FROM manual_items WHERE id = $1',
    [otherId]
  );

  return { workflowId: item.workflowId };
}

module.exports = { generateWfId, convertOtherToWorkflow };

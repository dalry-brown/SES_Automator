const pool = require('../pool');
const { camelize, camelizeRow } = require('../camelize');

async function listOthers(user, query = {}) {
  const isUser = user.role === 'user';
  const params = isUser ? [user.email] : [];
  const where  = isUser ? 'WHERE mi.contract_holder_email = $1' : '';

  // Join with the latest thread_message for sender/subject/date info
  const { rows } = await pool.query(
    `SELECT
       mi.id, mi.workflow_id, mi.category, mi.description, mi.status,
       mi.supplier_name, mi.contract_holder_email, mi.created_by,
       mi.created_at, mi.updated_at,
       tm.sender_email, tm.sender_name, tm.subject,
       tm.received_at, tm.to_recipients, tm.cc_recipients
     FROM manual_items mi
     LEFT JOIN LATERAL (
       SELECT sender_email, sender_name, subject, received_at, to_recipients, cc_recipients
       FROM thread_messages
       WHERE workflow_id = mi.workflow_id
       ORDER BY received_at ASC
       LIMIT 1
     ) tm ON true
     ${where}
     ORDER BY mi.created_at DESC`,
    params
  );
  return camelize(rows);
}

async function createOther(data, user) {
  const { rows } = await pool.query(
    `INSERT INTO manual_items
       (workflow_id, category, description, supplier_name, contract_holder_email, created_by)
     VALUES ($1, $2, $3, $4, $5, $6)
     RETURNING *`,
    [
      data.workflowId   || null,
      data.category     || null,
      data.description  || data.category || 'Other',
      data.supplierName || null,
      data.contractHolderEmail || null,
      user.userId,
    ]
  );
  return camelizeRow(rows[0]);
}

async function updateOther(id, data) {
  const fields = [];
  const params = [];
  let i = 1;

  const allowed = ['category', 'description', 'supplier_name', 'invoice_number', 'amount', 'contract_holder_email'];
  for (const key of allowed) {
    const camel = key.replace(/_([a-z])/g, (_, c) => c.toUpperCase());
    if (data[camel] !== undefined) {
      fields.push(`${key} = $${i++}`);
      params.push(data[camel]);
    }
  }
  if (!fields.length) throw new Error('No fields to update');

  params.push(id);
  const { rows } = await pool.query(
    `UPDATE manual_items SET ${fields.join(', ')}, updated_at = NOW() WHERE id = $${i} RETURNING *`,
    params
  );
  return camelizeRow(rows[0]);
}

async function closeOther(id) {
  await pool.query(
    "UPDATE manual_items SET status = 'closed', updated_at = NOW() WHERE id = $1",
    [id]
  );
}

async function reopenOther(id) {
  await pool.query(
    "UPDATE manual_items SET status = 'open', updated_at = NOW() WHERE id = $1",
    [id]
  );
}

async function deleteOther(id) {
  await pool.query('DELETE FROM manual_items WHERE id = $1', [id]);
}

module.exports = { listOthers, createOther, updateOther, closeOther, reopenOther, deleteOther };

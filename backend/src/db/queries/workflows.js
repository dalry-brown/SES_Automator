const pool = require('../pool');
const { camelize, camelizeRow } = require('../camelize');

async function listWorkflows(user) {
  const isUser = user.role === 'user';
  const params = isUser ? [user.email] : [];
  const where  = isUser ? 'WHERE w.contract_holder_email = $1' : '';

  const { rows } = await pool.query(
    `SELECT
       w.*,
       s.label AS status_label,
       lock_user.name  AS locked_by_name,
       lock_user.email AS locked_by_email
     FROM workflows w
     LEFT JOIN statuses s   ON s.code   = w.status
     LEFT JOIN users lock_user ON lock_user.id = w.locked_by
     ${where}
     ORDER BY w.created_at DESC`,
    params
  );
  return camelize(rows);
}

async function getWorkflow(id, user) {
  const { rows } = await pool.query(
    `SELECT w.*, s.label AS status_label
     FROM workflows w
     LEFT JOIN statuses s ON s.code = w.status
     WHERE w.id = $1`,
    [id]
  );
  const wf = rows[0];
  if (!wf) return null;
  if (user.role === 'user' && wf.contract_holder_email !== user.email) return null;
  return camelizeRow(wf);
}

async function getWorkflowStats(user) {
  const isUser = user.role === 'user';
  const params = isUser ? [user.email] : [];
  const where  = isUser ? 'WHERE contract_holder_email = $1' : '';

  const { rows } = await pool.query(
    `SELECT
       COUNT(*)                                                              AS total,
       COUNT(*) FILTER (WHERE status = 'pending_approval')                 AS pending_count,
       COUNT(*) FILTER (WHERE status = 'approved')                         AS approved_count,
       COUNT(*) FILTER (WHERE status IN ('queried', 'returned'))           AS action_required_count,
       COUNT(*) FILTER (
         WHERE status = 'pending_approval'
           AND submitted_at < NOW() - INTERVAL '7 days'
       )                                                                    AS overdue_count,
       ROUND(AVG(
         EXTRACT(EPOCH FROM (approved_at - submitted_at)) / 86400
       ) FILTER (WHERE approved_at IS NOT NULL), 1)                        AS avg_days_to_sign
     FROM workflows
     ${where}`,
    params
  );
  return camelizeRow(rows[0]);
}

async function updateWorkflowStatus(id, status) {
  const { rows } = await pool.query(
    `UPDATE workflows
     SET status = $1, updated_at = NOW()
     WHERE id = $2
     RETURNING *`,
    [status, id]
  );
  return camelizeRow(rows[0]);
}

async function updateWorkflowCategory(id, category) {
  const { rows } = await pool.query(
    `UPDATE workflows
     SET category = $1, updated_at = NOW()
     WHERE id = $2
     RETURNING *`,
    [category, id]
  );
  return camelizeRow(rows[0]);
}

async function getEmails(query = {}) {
  const { status, workflowId, limit = 50, offset = 0 } = query;
  const conditions = ['1=1'];
  const params = [];
  let i = 1;

  if (workflowId) {
    conditions.push(`tm.workflow_id = $${i++}`);
    params.push(workflowId);
  }
  if (status) {
    conditions.push(`w.status = $${i++}`);
    params.push(status);
  }

  params.push(Number(limit));
  params.push(Number(offset));

  const { rows } = await pool.query(
    `SELECT
       tm.*,
       w.supplier_name,
       w.status,
       s.label AS status_label
     FROM thread_messages tm
     JOIN workflows w   ON w.id   = tm.workflow_id
     LEFT JOIN statuses s ON s.code = w.status
     WHERE ${conditions.join(' AND ')}
     ORDER BY tm.received_at DESC
     LIMIT $${i} OFFSET $${i + 1}`,
    params
  );
  return camelize(rows);
}

async function getInboxData(query = {}) {
  const { rows: summary } = await pool.query(
    `SELECT
       COUNT(*)                                              AS total_workflows,
       COUNT(*) FILTER (WHERE status = 'received')          AS unprocessed,
       COUNT(*) FILTER (WHERE status = 'in_progress')       AS in_progress,
       COUNT(*) FILTER (WHERE status = 'pending_approval')  AS pending_approval,
       COUNT(*) FILTER (WHERE status = 'approved')          AS approved,
       COUNT(*) FILTER (
         WHERE status = 'pending_approval'
           AND submitted_at < NOW() - INTERVAL '7 days'
       )                                                    AS overdue
     FROM workflows`
  );

  const { rows: recent } = await pool.query(
    `SELECT w.id, w.supplier_name, w.invoice_number, w.status, s.label AS status_label,
            w.created_at, w.updated_at
     FROM workflows w
     LEFT JOIN statuses s ON s.code = w.status
     ORDER BY w.updated_at DESC
     LIMIT 10`
  );

  return { summary: camelizeRow(summary[0]), recentWorkflows: camelize(recent) };
}

module.exports = {
  listWorkflows,
  getWorkflow,
  getWorkflowStats,
  updateWorkflowStatus,
  updateWorkflowCategory,
  getEmails,
  getInboxData,
};

const pool = require('../pool');
const { camelize, camelizeRow } = require('../camelize');

async function listWorkflows(user) {
  const isUser = user.role === 'user';

  // CE/admin: top-level workflows only (no children).
  // Contract holder: leaf workflows assigned to them — children (sub-SES) or
  // single-SES workflows that haven't been split, but NOT split parents
  // (those are CE management surfaces, not CH approval items).
  let where, params;
  if (isUser) {
    where  = `WHERE w.contract_holder_email = $1
                AND NOT EXISTS (
                  SELECT 1 FROM workflows c WHERE c.parent_workflow_id = w.id LIMIT 1
                )`;
    params = [user.email];
  } else {
    where  = 'WHERE w.parent_workflow_id IS NULL';
    params = [];
  }

  const { rows } = await pool.query(
    `WITH first_inbound AS (
       SELECT DISTINCT ON (workflow_id)
         workflow_id, subject, sender_name, sender_email
       FROM thread_messages
       WHERE is_outbound = FALSE
       ORDER BY workflow_id, received_at ASC
     ),
     last_activity AS (
       SELECT DISTINCT ON (workflow_id)
         workflow_id, received_at AS last_received_at
       FROM thread_messages
       ORDER BY workflow_id, received_at DESC
     ),
     msg_counts AS (
       SELECT workflow_id, COUNT(*)::int AS message_count
       FROM thread_messages
       GROUP BY workflow_id
     )
     SELECT
       w.*,
       s.label AS status_label,
       lock_user.name  AS locked_by_name,
       lock_user.email AS locked_by_email,
       (sf.id IS NOT NULL)  AS has_draft,
       draft_user.name  AS draft_editor_name,
       draft_user.email AS draft_editor_email,
       EXISTS (
         SELECT 1 FROM thread_messages tm
         WHERE tm.workflow_id = w.id AND tm.is_new = TRUE
       ) AS has_new_message,
       fi.subject      AS first_subject,
       fi.sender_name  AS first_sender_name,
       fi.sender_email AS first_sender_email,
       COALESCE(mc.message_count, 0) AS message_count,
       la.last_received_at
     FROM workflows w
     LEFT JOIN statuses s        ON s.code        = w.status
     LEFT JOIN users lock_user   ON lock_user.id  = w.locked_by
     LEFT JOIN ses_forms sf      ON sf.workflow_id = w.id
     LEFT JOIN LATERAL (
       SELECT fv.created_by FROM form_versions fv
       WHERE fv.form_id = sf.id
       ORDER BY fv.version_number DESC LIMIT 1
     ) latest_fv ON true
     LEFT JOIN users draft_user  ON draft_user.id = latest_fv.created_by
     LEFT JOIN first_inbound fi  ON fi.workflow_id = w.id
     LEFT JOIN last_activity la  ON la.workflow_id = w.id
     LEFT JOIN msg_counts mc     ON mc.workflow_id = w.id
     ${where}
     ORDER BY COALESCE(la.last_received_at, w.created_at) DESC`,
    params
  );
  return camelize(rows);
}

async function getWorkflow(id, user) {
  const { rows } = await pool.query(
    `SELECT
       w.*,
       s.label AS status_label,
       lock_user.name  AS locked_by_name,
       lock_user.email AS locked_by_email,
       (sf.id IS NOT NULL) AS has_draft,
       draft_user.name  AS draft_editor_name,
       draft_user.email AS draft_editor_email
     FROM workflows w
     LEFT JOIN statuses s       ON s.code        = w.status
     LEFT JOIN users lock_user  ON lock_user.id  = w.locked_by
     LEFT JOIN ses_forms sf     ON sf.workflow_id = w.id
     LEFT JOIN LATERAL (
       SELECT fv.created_by FROM form_versions fv
       WHERE fv.form_id = sf.id
       ORDER BY fv.version_number DESC LIMIT 1
     ) latest_fv ON true
     LEFT JOIN users draft_user ON draft_user.id = latest_fv.created_by
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
  // Exclude child workflows from stats in all cases — they are managed
  // through their parent and should not inflate counts.
  let where, params;
  if (isUser) {
    where  = `WHERE contract_holder_email = $1
                AND NOT EXISTS (SELECT 1 FROM workflows c WHERE c.parent_workflow_id = workflows.id LIMIT 1)`;
    params = [user.email];
  } else {
    where  = 'WHERE parent_workflow_id IS NULL';
    params = [];
  }

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

async function getWorkflowChildren(parentId) {
  const { rows } = await pool.query(
    `SELECT w.*, s.label AS status_label,
       (sd.storage_key IS NOT NULL) AS has_document
     FROM workflows w
     LEFT JOIN statuses s ON s.code = w.status
     LEFT JOIN ses_docs  sd ON sd.workflow_id = w.id
     WHERE w.parent_workflow_id = $1
     ORDER BY w.sub_index`,
    [parentId]
  );
  return camelize(rows);
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
  getWorkflowChildren,
  updateWorkflowStatus,
  updateWorkflowCategory,
  getEmails,
  getInboxData,
};

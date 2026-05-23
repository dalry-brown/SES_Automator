const pool = require('../pool');
const { camelize, camelizeRow } = require('../camelize');

async function listTrackerRecords(query = {}) {
  const { contractHolder, vendor, status, dateFrom, dateTo } = query;

  const conditions = ['1=1'];
  const params = [];
  let i = 1;

  if (contractHolder) {
    conditions.push(`w.contract_holder_email ILIKE $${i++}`);
    params.push(`%${contractHolder}%`);
  }
  if (vendor) {
    conditions.push(`w.supplier_name ILIKE $${i++}`);
    params.push(`%${vendor}%`);
  }
  if (status) {
    conditions.push(`w.status = $${i++}`);
    params.push(status);
  }
  if (dateFrom) {
    conditions.push(`t.received_at >= $${i++}`);
    params.push(dateFrom);
  }
  if (dateTo) {
    conditions.push(`t.received_at <= $${i++}`);
    params.push(dateTo);
  }

  // Only workflows where the SES form has been submitted for approval
  conditions.push('t.submitted_at IS NOT NULL');

  const { rows } = await pool.query(
    `SELECT
       w.id                     AS workflow_id,
       w.supplier_name,
       w.invoice_number,
       w.po_number,
       w.amount,
       w.currency,
       w.contract_holder_email,
       w.contract_holder_name,
       w.status,
       s.label                  AS status_label,
       t.received_at,
       t.submitted_at,
       t.approved_at,
       CASE WHEN t.approved_at IS NOT NULL AND t.submitted_at IS NOT NULL
         THEN ROUND(EXTRACT(EPOCH FROM (t.approved_at - t.submitted_at)) / 86400, 1)
       END                      AS days_to_sign,
       CASE WHEN t.submitted_at IS NOT NULL AND t.received_at IS NOT NULL
         THEN ROUND(EXTRACT(EPOCH FROM (t.submitted_at - t.received_at)) / 86400, 1)
       END                      AS days_to_submit
     FROM tracker t
     JOIN workflows w ON w.id = t.workflow_id
     LEFT JOIN statuses s ON s.code = w.status
     WHERE ${conditions.join(' AND ')}
     ORDER BY t.received_at DESC`,
    params
  );
  return camelize(rows);
}

async function getTrackerRow(workflowId) {
  const { rows } = await pool.query(
    'SELECT * FROM tracker WHERE workflow_id = $1', [workflowId]
  );
  return rows[0] ? camelizeRow(rows[0]) : null;
}

async function upsertTrackerRow({ workflowId, receivedAt, submittedAt, approvedAt }) {
  const { rows } = await pool.query(
    `INSERT INTO tracker (workflow_id, received_at, submitted_at, approved_at)
     VALUES ($1, $2, $3, $4)
     ON CONFLICT (workflow_id)
     DO UPDATE SET
       received_at  = COALESCE(EXCLUDED.received_at,  tracker.received_at),
       submitted_at = COALESCE(EXCLUDED.submitted_at, tracker.submitted_at),
       approved_at  = COALESCE(EXCLUDED.approved_at,  tracker.approved_at),
       updated_at   = NOW()
     RETURNING *`,
    [workflowId, receivedAt, submittedAt, approvedAt]
  );
  return camelizeRow(rows[0]);
}

module.exports = { listTrackerRecords, getTrackerRow, upsertTrackerRow };

const pool = require('../db/pool');

function daysBetween(dateA, dateB) {
  const a = dateA instanceof Date ? dateA : new Date(dateA);
  const b = dateB instanceof Date ? dateB : new Date(dateB);
  return Math.abs(Math.floor((b - a) / (1000 * 60 * 60 * 24)));
}

async function getTrackerStats(query = {}) {
  const { contractHolder, vendor, dateFrom, dateTo } = query;

  const conditions = ['t.submitted_at IS NOT NULL'];
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
  if (dateFrom) {
    conditions.push(`t.received_at >= $${i++}`);
    params.push(dateFrom);
  }
  if (dateTo) {
    conditions.push(`t.received_at <= $${i++}`);
    params.push(dateTo);
  }

  const where = conditions.join(' AND ');

  const { rows: summary } = await pool.query(
    `SELECT
       COUNT(*)                                                              AS total,
       COUNT(*) FILTER (WHERE w.status = 'approved')                       AS approved,
       COUNT(*) FILTER (WHERE w.status = 'pending_approval')               AS pending,
       COUNT(*) FILTER (
         WHERE w.status = 'pending_approval'
           AND t.submitted_at < NOW() - INTERVAL '7 days'
       )                                                                    AS overdue,
       ROUND(AVG(
         EXTRACT(EPOCH FROM (t.approved_at - t.submitted_at)) / 86400
       ) FILTER (WHERE t.approved_at IS NOT NULL), 1)                      AS avg_days_to_sign,
       ROUND(AVG(
         EXTRACT(EPOCH FROM (t.submitted_at - t.received_at)) / 86400
       ) FILTER (WHERE t.submitted_at IS NOT NULL), 1)                     AS avg_days_to_submit
     FROM tracker t
     JOIN workflows w ON w.id = t.workflow_id
     WHERE ${where}`,
    params
  );

  // Breakdown by contract holder
  const { rows: byHolder } = await pool.query(
    `SELECT
       w.contract_holder_email,
       w.contract_holder_name,
       COUNT(*)                                                         AS total,
       ROUND(AVG(
         EXTRACT(EPOCH FROM (t.approved_at - t.submitted_at)) / 86400
       ) FILTER (WHERE t.approved_at IS NOT NULL), 1)                  AS avg_days_to_sign
     FROM tracker t
     JOIN workflows w ON w.id = t.workflow_id
     WHERE ${where}
     GROUP BY w.contract_holder_email, w.contract_holder_name
     ORDER BY total DESC`,
    params
  );

  // Breakdown by vendor
  const { rows: byVendor } = await pool.query(
    `SELECT
       w.supplier_name,
       COUNT(*) AS total,
       ROUND(AVG(
         EXTRACT(EPOCH FROM (t.approved_at - t.submitted_at)) / 86400
       ) FILTER (WHERE t.approved_at IS NOT NULL), 1) AS avg_days_to_sign
     FROM tracker t
     JOIN workflows w ON w.id = t.workflow_id
     WHERE ${where}
     GROUP BY w.supplier_name
     ORDER BY total DESC`,
    params
  );

  return { summary: summary[0], byContractHolder: byHolder, byVendor };
}

module.exports = { daysBetween, getTrackerStats };

const cron = require('node-cron');
const pool = require('../db/pool');

async function syncTrackerData() {
  try {
    // Sync approved_at from workflows to tracker for any newly approved workflows
    const { rowCount: approvedSynced } = await pool.query(`
      UPDATE tracker t
      SET    approved_at = w.approved_at,
             updated_at  = NOW()
      FROM   workflows w
      WHERE  w.id = t.workflow_id
        AND  w.approved_at IS NOT NULL
        AND  (t.approved_at IS NULL OR t.approved_at != w.approved_at)
    `);

    // Ensure any submitted SES workflows have a tracker row
    const { rowCount: inserted } = await pool.query(`
      INSERT INTO tracker (workflow_id, received_at, submitted_at, approved_at)
      SELECT
        w.id,
        w.created_at,
        sf.submitted_at,
        w.approved_at
      FROM workflows w
      JOIN ses_forms sf ON sf.workflow_id = w.id
      WHERE sf.submitted_at IS NOT NULL
        AND NOT EXISTS (SELECT 1 FROM tracker t WHERE t.workflow_id = w.id)
      ON CONFLICT DO NOTHING
    `);

    console.log(`[Tracker] Daily sync: ${approvedSynced} approved_at synced, ${inserted} new rows inserted`);
  } catch (err) {
    console.error('[Tracker] Daily sync failed:', err.message);
  }
}

function startTrackerSyncJob() {
  // Run daily at 01:00 AM server time
  cron.schedule('0 1 * * *', syncTrackerData);
  console.log('[Tracker] Daily sync job scheduled (01:00 AM)');
}

module.exports = { startTrackerSyncJob, syncTrackerData };

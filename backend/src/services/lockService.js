const cron = require('node-cron');
const pool = require('../db/pool');

const LOCK_TIMEOUT_MINUTES = 15;

async function acquireLock(workflowId, userId) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const { rows } = await client.query(
      'SELECT locked_by, locked_at FROM workflows WHERE id = $1 FOR UPDATE',
      [workflowId]
    );

    if (!rows.length) {
      await client.query('ROLLBACK');
      return { success: false, message: 'Workflow not found' };
    }

    const { locked_by, locked_at } = rows[0];

    if (locked_by && locked_by !== userId) {
      const age = (Date.now() - new Date(locked_at).getTime()) / 1000 / 60;
      if (age < LOCK_TIMEOUT_MINUTES) {
        await client.query('ROLLBACK');
        return { success: false, message: 'Workflow is currently being edited', lockedBy: locked_by };
      }
    }

    await client.query(
      'UPDATE workflows SET locked_by = $1, locked_at = NOW() WHERE id = $2',
      [userId, workflowId]
    );

    await client.query('COMMIT');
    return { success: true };
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

async function releaseLock(workflowId, userId) {
  await pool.query(
    'UPDATE workflows SET locked_by = NULL, locked_at = NULL WHERE id = $1 AND locked_by = $2',
    [workflowId, userId]
  );
}

async function cleanExpiredLocks() {
  const { rowCount } = await pool.query(
    `UPDATE workflows
     SET locked_by = NULL, locked_at = NULL
     WHERE locked_at IS NOT NULL
       AND locked_at < NOW() - INTERVAL '${LOCK_TIMEOUT_MINUTES} minutes'`
  );
  if (rowCount > 0) {
    console.log(`[LockService] Cleared ${rowCount} expired lock(s)`);
  }
}

function startLockCleanupJob() {
  cron.schedule('*/5 * * * *', async () => {
    try {
      await cleanExpiredLocks();
    } catch (err) {
      console.error('[LockService] Cleanup error:', err.message);
    }
  });
  console.log('[LockService] Lock cleanup job scheduled (every 5 minutes)');
}

module.exports = { acquireLock, releaseLock, cleanExpiredLocks, startLockCleanupJob, LOCK_TIMEOUT_MINUTES };

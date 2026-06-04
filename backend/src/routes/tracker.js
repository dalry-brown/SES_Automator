const express = require('express');
const router = express.Router();
const authenticate = require('../middleware/authenticate');
const { requireRole } = require('../middleware/rbac');

// GET /api/tracker — list tracker records (editor+)
router.get('/', [authenticate, requireRole('editor')], async (req, res, next) => {
  try {
    const { listTrackerRecords } = require('../db/queries/tracker');
    const records = await listTrackerRecords(req.query);
    res.json({ records });
  } catch (err) {
    next(err);
  }
});

// GET /api/tracker/monthly-count — SES forms submitted in the current calendar month
router.get('/monthly-count', [authenticate, requireRole('editor')], async (req, res, next) => {
  try {
    const { getMonthlyTrackedCount } = require('../db/queries/tracker');
    const count = await getMonthlyTrackedCount();
    res.json({ count });
  } catch (err) {
    next(err);
  }
});

// GET /api/tracker/stats — duration analytics
router.get('/stats', [authenticate, requireRole('editor')], async (req, res, next) => {
  try {
    const { getTrackerStats } = require('../services/trackerService');
    const stats = await getTrackerStats(req.query);
    res.json({ stats });
  } catch (err) {
    next(err);
  }
});

module.exports = router;

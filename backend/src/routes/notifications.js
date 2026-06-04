'use strict';

const express = require('express');
const router  = express.Router();
const authenticate = require('../middleware/authenticate');
const { listNotifications, markRead, markAllRead, dismiss } = require('../services/notificationService');

// GET /api/notifications
router.get('/', authenticate, async (req, res, next) => {
  try {
    const notes = await listNotifications(req.user.userId);
    res.json({ notifications: notes });
  } catch (err) { next(err); }
});

// PATCH /api/notifications/read-all  (must be before /:id routes)
router.patch('/read-all', authenticate, async (req, res, next) => {
  try {
    await markAllRead(req.user.userId);
    res.json({ ok: true });
  } catch (err) { next(err); }
});

// PATCH /api/notifications/:id/read
router.patch('/:id/read', authenticate, async (req, res, next) => {
  try {
    await markRead(req.user.userId, req.params.id);
    res.json({ ok: true });
  } catch (err) { next(err); }
});

// DELETE /api/notifications/:id
router.delete('/:id', authenticate, async (req, res, next) => {
  try {
    await dismiss(req.user.userId, req.params.id);
    res.json({ ok: true });
  } catch (err) { next(err); }
});

module.exports = router;

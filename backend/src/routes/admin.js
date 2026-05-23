const express = require('express');
const router = express.Router();
const authenticate = require('../middleware/authenticate');
const { requireRole } = require('../middleware/rbac');

const guard = [authenticate, requireRole('admin')];

// GET /api/admin/users — list all users
router.get('/users', guard, async (req, res, next) => {
  try {
    const { listUsers } = require('../db/queries/users');
    const users = await listUsers();
    res.json({ users });
  } catch (err) {
    next(err);
  }
});

// PATCH /api/admin/users/:id/role — assign role
router.patch('/users/:id/role', guard, async (req, res, next) => {
  try {
    const { assignRole } = require('../db/queries/users');
    const user = await assignRole(req.params.id, req.body.role);
    res.json({ user });
  } catch (err) {
    next(err);
  }
});

// DELETE /api/admin/users/:id — remove user
router.delete('/users/:id', guard, async (req, res, next) => {
  try {
    const { deleteUser } = require('../db/queries/users');
    await deleteUser(req.params.id);
    res.json({ message: 'User deleted' });
  } catch (err) {
    next(err);
  }
});

// POST /api/admin/webhook/register — re-register Graph subscription using live token
// Body: { notificationUrl?: string } — falls back to NOTIFICATION_URL env var
router.post('/webhook/register', guard, async (req, res, next) => {
  try {
    const { registerSubscription } = require('../graph/webhook');
    const notificationUrl = req.body?.notificationUrl || process.env.NOTIFICATION_URL;
    if (!notificationUrl) return res.status(400).json({ error: 'NOTIFICATION_URL not set' });
    const result = await registerSubscription(notificationUrl);
    res.json({ ok: true, subscription: result });
  } catch (err) {
    const data = err.response?.data;
    res.status(500).json({ error: data ?? err.message });
  }
});

module.exports = router;

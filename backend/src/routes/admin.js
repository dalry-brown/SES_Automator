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

// GET /api/admin/webhook/status — show active subscriptions from Graph API
router.get('/webhook/status', guard, async (req, res, next) => {
  try {
    const axios = require('axios');
    const { getToken } = require('../graph/client');
    const { getSubscriptionId } = require('../graph/webhook');
    const token = await getToken();
    const { data } = await axios.get('https://graph.microsoft.com/v1.0/subscriptions', {
      headers: { Authorization: `Bearer ${token}` },
    });
    res.json({
      activeInMemoryId: getSubscriptionId(),
      subscriptions: data.value || [],
    });
  } catch (err) {
    res.status(500).json({ error: err.response?.data ?? err.message });
  }
});

// POST /api/admin/webhook/register — force re-register (or reuse existing) Graph subscription
// Body: { notificationUrl?: string } — falls back to NOTIFICATION_URL env var
router.post('/webhook/register', guard, async (req, res, next) => {
  try {
    const { registerSubscription } = require('../graph/webhook');
    const notificationUrl = req.body?.notificationUrl || process.env.NOTIFICATION_URL;
    if (!notificationUrl) return res.status(400).json({ error: 'NOTIFICATION_URL not set' });
    const subscriptionId = await registerSubscription(notificationUrl);
    res.json({ ok: true, subscriptionId });
  } catch (err) {
    res.status(500).json({ error: err.response?.data ?? err.message });
  }
});

module.exports = router;

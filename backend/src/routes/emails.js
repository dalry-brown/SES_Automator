const express = require('express');
const router = express.Router();
const authenticate = require('../middleware/authenticate');
const { requireRole } = require('../middleware/rbac');
const { ingestEmail } = require('../services/emailService');

/**
 * POST /api/emails/webhook
 * Public endpoint — Graph sends change notifications here.
 * Handles the initial validation token challenge and ongoing notifications.
 */
router.post('/webhook', async (req, res) => {
  // Graph validation challenge: GET-like POST with ?validationToken=
  if (req.query.validationToken) {
    return res.status(200).type('text/plain').send(req.query.validationToken);
  }

  // Acknowledge immediately — Graph requires <30s response
  res.status(202).send();

  // Parse and process notifications asynchronously
  let body;
  try {
    body = typeof req.body === 'string' ? JSON.parse(req.body) : req.body;
  } catch {
    console.error('[Webhook] Failed to parse notification body');
    return;
  }

  const notifications = body?.value || [];
  for (const notification of notifications) {
    const expectedState = process.env.WEBHOOK_CLIENT_STATE || 'invoice-automation-prod';
    if (notification.clientState !== expectedState) {
      console.warn('[Webhook] Rejected notification — clientState mismatch');
      continue;
    }

    const messageId = notification.resourceData?.id;
    if (!messageId) continue;

    ingestEmail(messageId).catch((err) => {
      console.error(`[Webhook] Ingest failed for messageId ${messageId}:`, err.message);
    });
  }
});

// GET /api/emails — list ingested emails (editor+)
router.get('/', [authenticate, requireRole('editor')], async (req, res, next) => {
  try {
    const { getEmails } = require('../db/queries/workflows');
    const emails = await getEmails(req.query);
    res.json({ emails });
  } catch (err) {
    next(err);
  }
});

// GET /api/emails/inbox — inbox data view (editor+)
router.get('/inbox', [authenticate, requireRole('editor')], async (req, res, next) => {
  try {
    const { getInboxData } = require('../db/queries/workflows');
    const data = await getInboxData(req.query);
    res.json(data);
  } catch (err) {
    next(err);
  }
});

module.exports = router;

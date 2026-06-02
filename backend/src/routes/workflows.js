const express = require('express');
const router = express.Router();
const authenticate = require('../middleware/authenticate');
const { requireRole } = require('../middleware/rbac');
const { emit } = require('../services/sseService');

// GET /api/workflows — list workflows (filtered by role)
router.get('/', authenticate, async (req, res, next) => {
  try {
    const { listWorkflows } = require('../db/queries/workflows');
    const workflows = await listWorkflows(req.user);
    res.json({ workflows });
  } catch (err) {
    next(err);
  }
});

// GET /api/workflows/stats — summary stats for home/dashboard
router.get('/stats', authenticate, async (req, res, next) => {
  try {
    const { getWorkflowStats } = require('../db/queries/workflows');
    const stats = await getWorkflowStats(req.user);
    res.json({ stats });
  } catch (err) {
    next(err);
  }
});

// GET /api/workflows/:id — single workflow
router.get('/:id', authenticate, async (req, res, next) => {
  try {
    const { getWorkflow } = require('../db/queries/workflows');
    const workflow = await getWorkflow(req.params.id, req.user);
    if (!workflow) return res.status(404).json({ error: 'Workflow not found' });
    res.json({ workflow });
  } catch (err) {
    next(err);
  }
});

// PATCH /api/workflows/:id/status
router.patch('/:id/status', [authenticate, requireRole('editor')], async (req, res, next) => {
  try {
    const { updateWorkflowStatus } = require('../db/queries/workflows');
    const workflow = await updateWorkflowStatus(req.params.id, req.body.status);
    emit('workflow.updated', { workflowId: req.params.id });
    res.json({ workflow });
  } catch (err) {
    next(err);
  }
});

// PATCH /api/workflows/:id/category
router.patch('/:id/category', [authenticate, requireRole('editor')], async (req, res, next) => {
  try {
    const { updateWorkflowCategory } = require('../db/queries/workflows');
    const workflow = await updateWorkflowCategory(req.params.id, req.body.category);
    res.json({ workflow });
  } catch (err) {
    next(err);
  }
});

// GET /api/workflows/:id/messages — thread messages for a workflow
router.get('/:id/messages', authenticate, async (req, res, next) => {
  try {
    const { getThreadMessages } = require('../services/threadService');
    const messages = await getThreadMessages(req.params.id);
    res.json({ messages });
  } catch (err) {
    next(err);
  }
});

// POST /api/workflows/:id/mark-sent — manually mark approved workflow as sent
router.post('/:id/mark-sent', [authenticate, requireRole('editor')], async (req, res, next) => {
  try {
    const { updateWorkflowStatus } = require('../db/queries/workflows');
    const workflow = await updateWorkflowStatus(req.params.id, 'sent');
    emit('workflow.updated', { workflowId: req.params.id });
    res.json({ workflow });
  } catch (err) {
    next(err);
  }
});

// POST /api/workflows/:id/close — close a sent workflow
router.post('/:id/close', authenticate, async (req, res, next) => {
  try {
    const { updateWorkflowStatus } = require('../db/queries/workflows');
    const workflow = await updateWorkflowStatus(req.params.id, 'closed');
    emit('workflow.updated', { workflowId: req.params.id });
    res.json({ workflow });
  } catch (err) {
    next(err);
  }
});

// POST /api/workflows/:id/reply — reply to vendor in the email thread (editor+)
router.post('/:id/reply', [authenticate, requireRole('editor')], async (req, res, next) => {
  const { comment } = req.body;
  if (!comment || !comment.trim()) return res.status(400).json({ error: 'comment is required' });
  try {
    const { replyToVendor } = require('../services/approvalService');
    const result = await replyToVendor(req.params.id, req.user, comment.trim());
    res.json(result);
  } catch (err) { next(err); }
});

// POST /api/workflows/:id/mark-read — clear is_new flag on thread messages
router.post('/:id/mark-read', authenticate, async (req, res, next) => {
  try {
    const { markMessagesRead } = require('../services/threadService');
    await markMessagesRead(req.params.id);
    res.json({ ok: true });
  } catch (err) { next(err); }
});

// POST /api/workflows/:id/lock — acquire WIP lock
router.post('/:id/lock', authenticate, async (req, res, next) => {
  try {
    const { acquireLock } = require('../services/lockService');
    const result = await acquireLock(req.params.id, req.user.userId);
    if (!result.success) {
      return res.status(409).json({ error: result.message, lockedBy: result.lockedBy });
    }
    res.json({ message: 'Lock acquired' });
  } catch (err) {
    next(err);
  }
});

// DELETE /api/workflows/:id/lock — release WIP lock
router.delete('/:id/lock', authenticate, async (req, res, next) => {
  try {
    const { releaseLock } = require('../services/lockService');
    await releaseLock(req.params.id, req.user.userId);
    res.json({ message: 'Lock released' });
  } catch (err) {
    next(err);
  }
});

module.exports = router;

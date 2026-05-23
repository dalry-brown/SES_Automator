const express = require('express');
const router = express.Router();
const authenticate = require('../middleware/authenticate');
const { requireRole } = require('../middleware/rbac');

const editorGuard = [authenticate, requireRole('editor')];

// GET /api/others — list "others" (manual items / non-SES workflows)
router.get('/', authenticate, async (req, res, next) => {
  try {
    const { listOthers } = require('../db/queries/others');
    const items = await listOthers(req.user, req.query);
    res.json({ items });
  } catch (err) {
    next(err);
  }
});

// POST /api/others — create manual item
router.post('/', editorGuard, async (req, res, next) => {
  try {
    const { createOther } = require('../db/queries/others');
    const item = await createOther(req.body, req.user);
    res.status(201).json({ item });
  } catch (err) {
    next(err);
  }
});

// PATCH /api/others/:id — update manual item
router.patch('/:id', editorGuard, async (req, res, next) => {
  try {
    const { updateOther } = require('../db/queries/others');
    const item = await updateOther(req.params.id, req.body);
    res.json({ item });
  } catch (err) {
    next(err);
  }
});

// POST /api/others/:id/close — close item
router.post('/:id/close', editorGuard, async (req, res, next) => {
  try {
    const { closeOther } = require('../db/queries/others');
    await closeOther(req.params.id, req.user);
    res.json({ message: 'Closed' });
  } catch (err) {
    next(err);
  }
});

// POST /api/others/:id/reopen — reopen closed item
router.post('/:id/reopen', editorGuard, async (req, res, next) => {
  try {
    const { reopenOther } = require('../db/queries/others');
    await reopenOther(req.params.id, req.user);
    res.json({ message: 'Reopened' });
  } catch (err) {
    next(err);
  }
});

// POST /api/others/:id/convert — convert manual item to SES workflow
router.post('/:id/convert', editorGuard, async (req, res, next) => {
  try {
    const { convertOtherToWorkflow } = require('../services/workflowService');
    const result = await convertOtherToWorkflow(req.params.id);
    res.json(result);
  } catch (err) {
    next(err);
  }
});

// DELETE /api/others/:id — delete
router.delete('/:id', editorGuard, async (req, res, next) => {
  try {
    const { deleteOther } = require('../db/queries/others');
    await deleteOther(req.params.id);
    res.json({ message: 'Deleted' });
  } catch (err) {
    next(err);
  }
});

module.exports = router;

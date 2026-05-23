const express = require('express');
const router = express.Router();
const authenticate = require('../middleware/authenticate');
const { requireRole } = require('../middleware/rbac');

const editorGuard = [authenticate, requireRole('editor')];

// GET /api/form-attachments/form/:formId — list attachments for a form (ordered by rank)
router.get('/form/:formId', authenticate, async (req, res, next) => {
  try {
    const { getFormAttachments } = require('../db/queries/formAttachments');
    const attachments = await getFormAttachments(req.params.formId);
    res.json({ attachments });
  } catch (err) {
    next(err);
  }
});

// POST /api/form-attachments — add attachment to form (with rank)
router.post('/', editorGuard, async (req, res, next) => {
  try {
    const { addFormAttachment } = require('../db/queries/formAttachments');
    const record = await addFormAttachment(req.body); // { formId, attachmentId, rank }
    res.status(201).json({ record });
  } catch (err) {
    next(err);
  }
});

// PATCH /api/form-attachments/reorder — update ranks
router.patch('/reorder', editorGuard, async (req, res, next) => {
  try {
    const { reorderFormAttachments } = require('../db/queries/formAttachments');
    await reorderFormAttachments(req.body.formId, req.body.order); // order: [{ attachmentId, rank }]
    res.json({ message: 'Reordered' });
  } catch (err) {
    next(err);
  }
});

// DELETE /api/form-attachments/:id — remove attachment from form
router.delete('/:id', editorGuard, async (req, res, next) => {
  try {
    const { removeFormAttachment } = require('../db/queries/formAttachments');
    await removeFormAttachment(req.params.id);
    res.json({ message: 'Removed' });
  } catch (err) {
    next(err);
  }
});

module.exports = router;

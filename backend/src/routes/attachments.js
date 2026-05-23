const express = require('express');
const router = express.Router();
const multer = require('multer');
const path = require('path');
const authenticate = require('../middleware/authenticate');
const { requireRole } = require('../middleware/rbac');

const upload = multer({
  dest: path.join(__dirname, '../../uploads/tmp'),
  limits: { fileSize: 50 * 1024 * 1024 }, // 50 MB
});

// GET /api/attachments/:id — serve/download an attachment
router.get('/:id', authenticate, async (req, res, next) => {
  try {
    const { serveAttachment } = require('../services/storageService');
    await serveAttachment(req.params.id, res);
  } catch (err) {
    next(err);
  }
});

// GET /api/attachments/workflow/:workflowId — list user-uploaded attachments for a workflow
// Generated PDFs (source='generated') are internal and excluded from this list
router.get('/workflow/:workflowId', authenticate, async (req, res, next) => {
  try {
    const { getAttachmentsByWorkflow } = require('../db/queries/attachments');
    const all = await getAttachmentsByWorkflow(req.params.workflowId);
    res.json({ attachments: all.filter((a) => a.source !== 'generated') });
  } catch (err) {
    next(err);
  }
});

// POST /api/attachments/upload — manual file upload (editor+)
router.post(
  '/upload',
  [authenticate, requireRole('editor'), upload.single('file')],
  async (req, res, next) => {
    try {
      const { saveUploadedAttachment } = require('../services/storageService');
      const attachment = await saveUploadedAttachment(req.file, req.body.workflowId, req.user);
      res.status(201).json({ attachment });
    } catch (err) {
      next(err);
    }
  }
);

module.exports = router;

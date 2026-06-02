const express = require('express');
const router = express.Router();
const multer = require('multer');
const path = require('path');
const jwt = require('jsonwebtoken');
const authenticate = require('../middleware/authenticate');
const { requireRole } = require('../middleware/rbac');

const upload = multer({
  dest: path.join(__dirname, '../../uploads/tmp'),
  limits: { fileSize: 50 * 1024 * 1024 }, // 50 MB
});

// Accepts Bearer header OR ?token= query param so iframe src URLs work directly
function authenticateAttachment(req, res, next) {
  const headerToken = req.headers.authorization?.startsWith('Bearer ')
    ? req.headers.authorization.slice(7)
    : null;
  const token = headerToken || req.query.token;
  if (!token) return res.status(401).json({ error: 'Missing token' });
  try {
    req.user = jwt.verify(token, process.env.JWT_SECRET);
    next();
  } catch {
    return res.status(401).json({ error: 'Invalid or expired token' });
  }
}

// GET /api/attachments/:id — serve an attachment
// ?dl=1  → Content-Disposition: attachment (force download)
// ?token= → auth via query param (for iframe src usage)
router.get('/:id', authenticateAttachment, async (req, res, next) => {
  try {
    const { serveAttachment } = require('../services/storageService');
    await serveAttachment(req.params.id, res, { download: req.query.dl === '1' });
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

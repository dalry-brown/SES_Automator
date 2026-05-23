const express = require('express');
const router  = express.Router();
const authenticate  = require('../middleware/authenticate');
const { requireRole } = require('../middleware/rbac');

const editorGuard = [authenticate, requireRole('editor')];

// POST /api/documents/prefill-excel
router.post('/prefill-excel', editorGuard, async (req, res, next) => {
  try {
    const { prefillExcel } = require('../services/documentService');
    const result = await prefillExcel(req.body.formId, req.body.formIndex ?? 0);
    res.json(result);
  } catch (err) { next(err); }
});

// POST /api/documents/save-pdf
router.post('/save-pdf', editorGuard, async (req, res, next) => {
  try {
    const { saveAsPdf } = require('../services/documentService');
    const result = await saveAsPdf(req.body);
    res.json(result);
  } catch (err) { next(err); }
});

// POST /api/documents/generate-ses-pdf  — generate SES pro-forma PDF from saved form
router.post('/generate-ses-pdf', editorGuard, async (req, res, next) => {
  try {
    const { generateSesPdf } = require('../services/documentService');
    const result = await generateSesPdf(req.body.formId, req.body.formIndex ?? 0);
    res.json(result);
  } catch (err) { next(err); }
});

// POST /api/documents/generate-preview — generate SES PDF + merge with attachments for preview
router.post('/generate-preview', editorGuard, async (req, res, next) => {
  try {
    const { generatePreview } = require('../services/documentService');
    const { formId, formIndex = 0, attachmentIds = [] } = req.body;
    const result = await generatePreview(formId, formIndex, attachmentIds);
    res.json(result);
  } catch (err) { next(err); }
});

// POST /api/documents/merge
router.post('/merge', editorGuard, async (req, res, next) => {
  try {
    const { mergeDocs } = require('../services/documentService');
    const result = await mergeDocs(req.body.workflowId, req.body.attachmentIds);
    res.json(result);
  } catch (err) { next(err); }
});

// GET /api/documents/ses-doc/:workflowId — serve merged ses_docs PDF by workflow ID
// Accepts token via Authorization header OR ?token= query param (needed for iframe src)
router.get('/ses-doc/:workflowId', async (req, res, next) => {
  try {
    const jwt = require('jsonwebtoken');
    const rawToken =
      (req.headers.authorization?.startsWith('Bearer ') ? req.headers.authorization.slice(7) : null)
      ?? req.query.token;
    if (!rawToken) return res.status(401).json({ error: 'Missing token' });
    try {
      jwt.verify(rawToken, process.env.JWT_SECRET);
    } catch {
      return res.status(401).json({ error: 'Invalid or expired token' });
    }

    const pool = require('../db/pool');
    const { read } = require('../services/storageService');
    const { rows } = await pool.query(
      'SELECT storage_key FROM ses_docs WHERE workflow_id = $1', [req.params.workflowId]
    );
    if (!rows.length || !rows[0].storage_key) {
      return res.status(404).json({ error: 'Merged document not found — generate a preview first' });
    }
    const buffer = await read(rows[0].storage_key);
    res.set('Content-Type', 'application/pdf');
    res.set('Content-Disposition', 'inline; filename="merged.pdf"');
    res.send(buffer);
  } catch (err) { next(err); }
});

// GET /api/documents/preview/:attachmentId
// Accepts token via Authorization header OR ?token= query param (needed for iframe src)
router.get('/preview/:attachmentId', async (req, res, next) => {
  try {
    const jwt = require('jsonwebtoken');
    const rawToken =
      (req.headers.authorization?.startsWith('Bearer ') ? req.headers.authorization.slice(7) : null)
      ?? req.query.token;
    if (!rawToken) return res.status(401).json({ error: 'Missing token' });
    try {
      req.user = jwt.verify(rawToken, process.env.JWT_SECRET);
    } catch {
      return res.status(401).json({ error: 'Invalid or expired token' });
    }
    const { previewDocument } = require('../services/documentService');
    await previewDocument(req.params.attachmentId, res);
  } catch (err) { next(err); }
});

module.exports = router;

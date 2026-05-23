const express = require('express');
const router  = express.Router();
const authenticate = require('../middleware/authenticate');

// GET /api/ses-documents/workflow/:workflowId  — list all docs for a workflow
router.get('/workflow/:workflowId', authenticate, async (req, res, next) => {
  try {
    const { getSesDocumentsByWorkflow } = require('../db/queries/sesDocuments');
    const documents = await getSesDocumentsByWorkflow(req.params.workflowId);
    res.json({ documents });
  } catch (err) { next(err); }
});

// GET /api/ses-documents/:id  — serve the merged PDF
// Accepts token via Authorization header OR ?token= query param (needed for iframe src)
router.get('/:id', async (req, res, next) => {
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
    const { getSesDocument } = require('../db/queries/sesDocuments');
    const { read } = require('../services/storageService');
    const doc = await getSesDocument(req.params.id);
    if (!doc) return res.status(404).json({ error: 'Document not found' });
    const buffer = await read(doc.storageKey);
    const asciiFallback = doc.fileName.replace(/[^\x20-\x7E]/g, '_');
    const encoded = encodeURIComponent(doc.fileName);
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `inline; filename="${asciiFallback}"; filename*=UTF-8''${encoded}`);
    res.send(buffer);
  } catch (err) { next(err); }
});

module.exports = router;

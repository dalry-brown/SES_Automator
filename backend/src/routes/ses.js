const express = require('express');
const router = express.Router();
const authenticate = require('../middleware/authenticate');
const { requireRole } = require('../middleware/rbac');
const { validate, Joi } = require('../middleware/validateRequest');

const editorGuard = [authenticate, requireRole('editor')];

const createSchema = Joi.object({
  workflowId: Joi.string().required(),
  fields: Joi.object().default({}),
});

const updateSchema = Joi.object({
  fields: Joi.object().required(),
});

const autofillSchema = Joi.object({
  vendorName: Joi.string().required(),
  poNumber:   Joi.string().allow('', null).default(null),
});

// GET /api/ses/workflow/:workflowId — get SES form by workflow (must be before /:id)
router.get('/workflow/:workflowId', authenticate, async (req, res, next) => {
  try {
    const { getSesFormByWorkflow } = require('../db/queries/ses');
    const form = await getSesFormByWorkflow(req.params.workflowId);
    if (!form) return res.status(404).json({ error: 'No SES form for this workflow' });
    const { getLatestFormVersion } = require('../db/queries/ses');
    const latest = await getLatestFormVersion(form.id);
    res.json({ form: { ...form, fields: latest?.data || {}, currentVersion: latest?.versionNumber || 0 } });
  } catch (err) {
    next(err);
  }
});

// POST /api/ses/autofill — must be before /:id routes to avoid route conflict
router.post('/autofill', [...editorGuard, validate(autofillSchema)], async (req, res, next) => {
  try {
    const { autofillSES } = require('../services/sesService');
    const data = await autofillSES(req.body.vendorName, req.body.poNumber);
    res.json({ data });
  } catch (err) {
    next(err);
  }
});

// POST /api/ses — create SES form for a workflow
router.post('/', [...editorGuard, validate(createSchema)], async (req, res, next) => {
  try {
    const { createSES } = require('../services/sesService');
    const result = await createSES(req.body, req.user);
    res.status(201).json(result);
  } catch (err) {
    next(err);
  }
});

// GET /api/ses/:id — read SES form
router.get('/:id', authenticate, async (req, res, next) => {
  try {
    const { readSES } = require('../services/sesService');
    const form = await readSES(req.params.id, req.user);
    if (!form) return res.status(404).json({ error: 'SES form not found' });
    res.json({ form });
  } catch (err) {
    next(err);
  }
});

// PUT /api/ses/:id — update (save new version)
router.put('/:id', [...editorGuard, validate(updateSchema)], async (req, res, next) => {
  try {
    const { updateSES } = require('../services/sesService');
    const result = await updateSES(req.params.id, req.body, req.user);
    res.json(result);
  } catch (err) {
    next(err);
  }
});

// GET /api/ses/:id/versions — version history
router.get('/:id/versions', authenticate, async (req, res, next) => {
  try {
    const { getSESVersions } = require('../services/sesService');
    const versions = await getSESVersions(req.params.id);
    res.json({ versions });
  } catch (err) {
    next(err);
  }
});

// POST /api/ses/:id/submit — submit for approval
router.post('/:id/submit', editorGuard, async (req, res, next) => {
  try {
    const { submitSES } = require('../services/sesService');
    const result = await submitSES(req.params.id, req.user);
    res.json(result);
  } catch (err) {
    next(err);
  }
});

module.exports = router;

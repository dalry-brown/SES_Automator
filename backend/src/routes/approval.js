'use strict';

const express = require('express');
const router  = express.Router();
const authenticate = require('../middleware/authenticate');
const { validate, Joi } = require('../middleware/validateRequest');

const commentSchema = Joi.object({
  comment: Joi.string().min(1).max(2000).required(),
});

const signSchema = Joi.object({
  confirmed:        Joi.boolean().valid(true).required()
    .messages({ 'any.only': 'You must confirm the approval before signing' }),
  signatureDataUrl: Joi.string().allow('', null).optional(),
});

const rerouteSchema = Joi.object({
  email: Joi.string().email().required(),
  name:  Joi.string().min(1).max(200).required(),
});

const recipientSchema = Joi.object({
  name:    Joi.string().allow('').optional(),
  address: Joi.string().email().required(),
});

const sendToVendorSchema = Joi.object({
  toRecipients: Joi.array().items(recipientSchema).optional(),
  ccRecipients: Joi.array().items(recipientSchema).optional(),
});

function svc() { return require('../services/approvalService'); }

// GET /api/approval/:workflowId
router.get('/:workflowId', authenticate, async (req, res, next) => {
  try {
    const data = await svc().getApprovalPageData(req.params.workflowId, req.user);
    res.json(data);
  } catch (err) { next(err); }
});

// POST /api/approval/:workflowId/sign
router.post('/:workflowId/sign', [authenticate, validate(signSchema)], async (req, res, next) => {
  try {
    const result = await svc().signWorkflow(req.params.workflowId, req.user, req.body);
    res.json(result);
  } catch (err) { next(err); }
});

// POST /api/approval/:workflowId/comment
router.post('/:workflowId/comment', [authenticate, validate(commentSchema)], async (req, res, next) => {
  try {
    const event = await svc().addApprovalComment(req.params.workflowId, req.user, req.body.comment);
    res.json({ event });
  } catch (err) { next(err); }
});

// POST /api/approval/:workflowId/query — CH raises a query (status → queried)
router.post('/:workflowId/query', [authenticate, validate(commentSchema)], async (req, res, next) => {
  try {
    const event = await svc().queryWorkflow(req.params.workflowId, req.user, req.body.comment);
    res.json({ event });
  } catch (err) { next(err); }
});

// POST /api/approval/:workflowId/return — CH returns form for corrections (status → returned)
router.post('/:workflowId/return', [authenticate, validate(commentSchema)], async (req, res, next) => {
  try {
    const event = await svc().returnWorkflow(req.params.workflowId, req.user, req.body.comment);
    res.json({ event });
  } catch (err) { next(err); }
});

// POST /api/approval/:workflowId/reroute — CH delegates signing to another person
router.post('/:workflowId/reroute', [authenticate, validate(rerouteSchema)], async (req, res, next) => {
  try {
    const result = await svc().rerouteWorkflow(
      req.params.workflowId, req.user, req.body
    );
    res.json(result);
  } catch (err) { next(err); }
});

// POST /api/approval/:workflowId/reply — any authenticated user replies into the email thread
router.post('/:workflowId/reply', [authenticate, validate(commentSchema)], async (req, res, next) => {
  try {
    const event = await svc().reply(req.params.workflowId, req.user, req.body.comment);
    res.json({ event });
  } catch (err) { next(err); }
});

// GET /api/approval/:workflowId/recipients — thread To/CC for the send-to-vendor UI
router.get('/:workflowId/recipients', authenticate, async (req, res, next) => {
  try {
    const result = await svc().getThreadRecipients(req.params.workflowId);
    res.json(result);
  } catch (err) { next(err); }
});

// POST /api/approval/:workflowId/send-to-vendor — CE sends approved signed PDF to vendor
router.post('/:workflowId/send-to-vendor', [authenticate, validate(sendToVendorSchema)], async (req, res, next) => {
  try {
    const result = await svc().sendToVendor(req.params.workflowId, req.user, req.body);
    res.json(result);
  } catch (err) { next(err); }
});

module.exports = router;

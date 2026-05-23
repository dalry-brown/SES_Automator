const express = require('express');
const router = express.Router();
const authenticate = require('../middleware/authenticate');
const { searchSuggestions, upsertSuggestion } = require('../db/queries/suggestions');

// GET /api/suggestions?field=vendorName&q=tul
router.get('/', authenticate, async (req, res, next) => {
  try {
    const { field, q } = req.query;
    if (!field || !q || q.length < 1) return res.json({ suggestions: [] });
    const suggestions = await searchSuggestions(field, q);
    res.json({ suggestions });
  } catch (err) {
    next(err);
  }
});

// POST /api/suggestions  — body: { items: [{ fieldName, value, linkedField?, linkedValue? }] }
router.post('/', authenticate, async (req, res, next) => {
  try {
    const items = req.body.items || [];
    for (const item of items) {
      if (item.fieldName && item.value && item.value.trim()) {
        await upsertSuggestion(
          item.fieldName,
          item.value.trim(),
          item.linkedField  || null,
          item.linkedValue  || null,
        );
      }
    }
    res.json({ saved: true });
  } catch (err) {
    next(err);
  }
});

module.exports = router;

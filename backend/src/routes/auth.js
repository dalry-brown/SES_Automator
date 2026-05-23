const express = require('express');
const router = express.Router();
const authenticate = require('../middleware/authenticate');

// POST /api/auth/login
// Body: { msAccessToken } — frontend exchanges MS token for app JWT
router.post('/login', async (req, res, next) => {
  try {
    const { authService } = require('../services/authService');
    const result = await authService.login(req.body.msAccessToken);
    res.json(result);
  } catch (err) {
    next(err);
  }
});

// POST /api/auth/logout
router.post('/logout', authenticate, (req, res) => {
  res.json({ message: 'Logged out' });
});

// GET /api/auth/me
router.get('/me', authenticate, (req, res) => {
  res.json({ user: req.user });
});

module.exports = router;

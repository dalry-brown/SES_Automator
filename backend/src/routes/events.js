const express = require('express');
const jwt = require('jsonwebtoken');
const { addClient, removeClient } = require('../services/sseService');

const router = express.Router();

// GET /api/events
// EventSource can't set headers so the JWT is passed as ?token=
router.get('/', (req, res) => {
  const token = req.query.token;
  if (!token) return res.status(401).json({ error: 'Missing token' });

  try {
    jwt.verify(token, process.env.JWT_SECRET);
  } catch (_) {
    return res.status(401).json({ error: 'Invalid or expired token' });
  }

  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('X-Accel-Buffering', 'no'); // prevent nginx/proxy buffering
  res.flushHeaders();

  // Confirm connection to the client
  res.write('event: connected\ndata: {}\n\n');

  // Keep-alive: proxies and Azure Container Apps close idle connections
  const heartbeat = setInterval(() => {
    try { res.write(': heartbeat\n\n'); } catch (_) {}
  }, 25_000);

  addClient(res);

  req.on('close', () => {
    clearInterval(heartbeat);
    removeClient(res);
  });
});

module.exports = router;

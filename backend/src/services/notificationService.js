'use strict';

const pool = require('../db/pool');

async function createNotification(userId, title, body, link = null) {
  if (!userId) return;
  try {
    await pool.query(
      `INSERT INTO notifications (user_id, title, body, link) VALUES ($1, $2, $3, $4)`,
      [userId, title, body, link]
    );
  } catch (err) {
    console.warn('[Notifications] Failed to create:', err.message);
  }
}

async function listNotifications(userId, limit = 50) {
  const { rows } = await pool.query(
    `SELECT id, title, body, link, is_read, created_at
     FROM notifications
     WHERE user_id = $1
     ORDER BY created_at DESC
     LIMIT $2`,
    [userId, limit]
  );
  return rows.map((r) => ({
    id:        r.id,
    title:     r.title,
    body:      r.body,
    link:      r.link,
    isRead:    r.is_read,
    createdAt: r.created_at,
  }));
}

async function markRead(userId, id) {
  await pool.query(
    `UPDATE notifications SET is_read = TRUE WHERE id = $1 AND user_id = $2`,
    [id, userId]
  );
}

async function markAllRead(userId) {
  await pool.query(
    `UPDATE notifications SET is_read = TRUE WHERE user_id = $1 AND is_read = FALSE`,
    [userId]
  );
}

async function dismiss(userId, id) {
  await pool.query(
    `DELETE FROM notifications WHERE id = $1 AND user_id = $2`,
    [id, userId]
  );
}

module.exports = { createNotification, listNotifications, markRead, markAllRead, dismiss };

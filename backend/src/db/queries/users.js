const pool = require('../pool');
const { camelize, camelizeRow } = require('../camelize');

async function upsertUser({ msObjectId, name, email }) {
  const { rows } = await pool.query(
    `INSERT INTO users (ms_object_id, name, email)
     VALUES ($1, $2, $3)
     ON CONFLICT (ms_object_id)
     DO UPDATE SET name = EXCLUDED.name, email = EXCLUDED.email, updated_at = NOW()
     RETURNING *`,
    [msObjectId, name, email]
  );
  return camelizeRow(rows[0]);
}

async function getUserByMsObjectId(msObjectId) {
  const { rows } = await pool.query('SELECT * FROM users WHERE ms_object_id = $1', [msObjectId]);
  return rows[0] ? camelizeRow(rows[0]) : null;
}

async function listUsers() {
  const { rows } = await pool.query('SELECT id, name, email, role, created_at FROM users ORDER BY name');
  return camelize(rows);
}

async function assignRole(userId, role) {
  const { rows } = await pool.query(
    'UPDATE users SET role = $1, updated_at = NOW() WHERE id = $2 RETURNING id, name, email, role',
    [role, userId]
  );
  return camelizeRow(rows[0]);
}

async function deleteUser(userId) {
  await pool.query('DELETE FROM users WHERE id = $1', [userId]);
}

module.exports = { upsertUser, getUserByMsObjectId, listUsers, assignRole, deleteUser };

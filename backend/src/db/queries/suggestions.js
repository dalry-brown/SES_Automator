const pool = require('../pool');

// ── Ensure table exists on first use ──────────────────────────────────────────
let tableReady = false;
async function ensureTable() {
  if (tableReady) return;
  await pool.query(`
    CREATE TABLE IF NOT EXISTS field_suggestions (
      id          SERIAL PRIMARY KEY,
      field_name  VARCHAR(80) NOT NULL,
      value       TEXT        NOT NULL,
      linked_field  VARCHAR(80),
      linked_value  TEXT,
      used_count  INTEGER     DEFAULT 1,
      updated_at  TIMESTAMPTZ DEFAULT NOW(),
      UNIQUE(field_name, value)
    )
  `);
  tableReady = true;
}

async function searchSuggestions(fieldName, query) {
  await ensureTable();
  const { rows } = await pool.query(
    `SELECT value, linked_field, linked_value
     FROM field_suggestions
     WHERE field_name = $1 AND value ILIKE $2
     ORDER BY used_count DESC, value ASC
     LIMIT 8`,
    [fieldName, `${query}%`]
  );
  return rows.map((r) => ({
    value:       r.value,
    linkedField: r.linked_field  || null,
    linkedValue: r.linked_value  || null,
  }));
}

async function upsertSuggestion(fieldName, value, linkedField = null, linkedValue = null) {
  await ensureTable();

  // For contractHolderName, accumulate all seen emails as a JSON array
  // so the frontend can offer a "which email?" picker when there are multiple.
  if (fieldName === 'contractHolderName' && linkedField === 'contractHolderEmail' && linkedValue) {
    const { rows } = await pool.query(
      `SELECT linked_value FROM field_suggestions WHERE field_name = $1 AND value = $2`,
      [fieldName, value]
    );
    let emails = [];
    if (rows.length && rows[0].linked_value) {
      try {
        const parsed = JSON.parse(rows[0].linked_value);
        emails = Array.isArray(parsed) ? parsed : [rows[0].linked_value];
      } catch {
        emails = [rows[0].linked_value];
      }
    }
    if (!emails.includes(linkedValue)) emails.push(linkedValue);

    await pool.query(
      `INSERT INTO field_suggestions (field_name, value, linked_field, linked_value)
       VALUES ($1, $2, $3, $4)
       ON CONFLICT (field_name, value) DO UPDATE
       SET used_count  = field_suggestions.used_count + 1,
           linked_field = $3,
           linked_value = $4,
           updated_at   = NOW()`,
      [fieldName, value, linkedField, JSON.stringify(emails)]
    );
    return;
  }

  await pool.query(
    `INSERT INTO field_suggestions (field_name, value, linked_field, linked_value)
     VALUES ($1, $2, $3, $4)
     ON CONFLICT (field_name, value) DO UPDATE
     SET used_count    = field_suggestions.used_count + 1,
         linked_field  = COALESCE($3, field_suggestions.linked_field),
         linked_value  = COALESCE($4, field_suggestions.linked_value),
         updated_at    = NOW()`,
    [fieldName, value, linkedField, linkedValue]
  );
}

module.exports = { searchSuggestions, upsertSuggestion };

const pool = require('../pool');
const { camelizeRow, camelize } = require('../camelize');

async function insertSesDocument({ workflowId, formIndex = 0, fileName, storageKey, docHash, size }) {
  const { rows } = await pool.query(
    `INSERT INTO ses_documents (workflow_id, form_index, file_name, storage_key, doc_hash, size)
     VALUES ($1, $2, $3, $4, $5, $6)
     ON CONFLICT (workflow_id, form_index)
     DO UPDATE SET file_name=$3, storage_key=$4, doc_hash=$5, size=$6, created_at=NOW()
     RETURNING *`,
    [workflowId, formIndex, fileName, storageKey, docHash, size ?? null]
  );
  return camelizeRow(rows[0]);
}

async function getSesDocument(id) {
  const { rows } = await pool.query('SELECT * FROM ses_documents WHERE id = $1', [id]);
  return rows[0] ? camelizeRow(rows[0]) : null;
}

async function getSesDocumentsByWorkflow(workflowId) {
  const { rows } = await pool.query(
    'SELECT * FROM ses_documents WHERE workflow_id = $1 ORDER BY form_index ASC',
    [workflowId]
  );
  return camelize(rows);
}

async function getSesDocumentByFormIndex(workflowId, formIndex = 0) {
  const { rows } = await pool.query(
    'SELECT * FROM ses_documents WHERE workflow_id = $1 AND form_index = $2',
    [workflowId, formIndex]
  );
  return rows[0] ? camelizeRow(rows[0]) : null;
}

module.exports = { insertSesDocument, getSesDocument, getSesDocumentsByWorkflow, getSesDocumentByFormIndex };

const pool = require('../db/pool');
const { camelize } = require('../db/camelize');

async function findWorkflowByConversationId(conversationId) {
  const { rows } = await pool.query(
    'SELECT * FROM workflows WHERE conversation_id = $1 LIMIT 1',
    [conversationId]
  );
  return rows[0] || null;
}

async function appendThreadMessage(workflowId, {
  messageId, conversationId, senderEmail, senderName, subject,
  receivedAt, bodyPreview, bodyHtml, toRecipients, ccRecipients,
  isNew = false, isOutbound = false,
}) {
  const { rows } = await pool.query(
    `INSERT INTO thread_messages
       (workflow_id, message_id, conversation_id, sender_email, sender_name,
        subject, received_at, body_preview, body_html, to_recipients, cc_recipients,
        is_new, is_outbound)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
     ON CONFLICT (message_id) DO NOTHING
     RETURNING *`,
    [
      workflowId, messageId, conversationId, senderEmail, senderName,
      subject, receivedAt,
      bodyPreview ?? null, bodyHtml ?? null,
      toRecipients ? JSON.stringify(toRecipients) : null,
      ccRecipients ? JSON.stringify(ccRecipients) : null,
      isNew, isOutbound,
    ]
  );
  return rows[0] || null;
}

async function getThreadMessages(workflowId) {
  const { rows } = await pool.query(
    `SELECT * FROM thread_messages WHERE workflow_id = $1 ORDER BY received_at ASC`,
    [workflowId]
  );
  return camelize(rows);
}

async function markMessagesRead(workflowId) {
  await pool.query(
    `UPDATE thread_messages SET is_new = FALSE WHERE workflow_id = $1`,
    [workflowId]
  );
}

module.exports = {
  findWorkflowByConversationId,
  appendThreadMessage,
  getThreadMessages,
  markMessagesRead,
};

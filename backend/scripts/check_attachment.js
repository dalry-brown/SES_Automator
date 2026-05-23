const pool = require('../src/db/pool');
const fs = require('fs');
const path = require('path');

const WORKFLOW_ID = 'CE-202605-004';
const LOCAL_UPLOADS = path.join(__dirname, '../uploads');

(async () => {
  const { rows: atts } = await pool.query(
    'SELECT id, file_name, mime_type, storage_key, size FROM attachments WHERE workflow_id = $1',
    [WORKFLOW_ID]
  );
  console.log('DB Attachments:');
  for (const a of atts) {
    const filePath = path.join(LOCAL_UPLOADS, a.storage_key);
    const exists = fs.existsSync(filePath);
    const diskSize = exists ? fs.statSync(filePath).size : 'FILE MISSING';
    console.log(`  [${a.id}] ${a.file_name} | mime: ${a.mime_type} | db_size: ${a.size} | disk_size: ${diskSize} | key: ${a.storage_key}`);
  }

  const { rows: msgs } = await pool.query(
    'SELECT message_id, subject FROM thread_messages WHERE workflow_id = $1 ORDER BY received_at DESC LIMIT 1',
    [WORKFLOW_ID]
  );
  console.log('\nMessage:', msgs[0] || 'NOT FOUND');

  await pool.end();
})().catch(e => { console.error(e.message); process.exit(1); });

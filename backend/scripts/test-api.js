/**
 * API test runner for local development.
 * Prerequisites: server running on PORT (default 4000), DB migrated.
 * Usage: node scripts/test-api.js
 */
require('dotenv').config();
const http = require('http');
const jwt  = require('jsonwebtoken');
const { Pool } = require('pg');

const BASE = `http://localhost:${process.env.PORT || 4000}`;

// ── Test user definitions ─────────────────────────────────────────────────────
const TEST_USERS = [
  { id: '00000000-0000-0000-0000-000000000001', ms_object_id: 'ms-test-user',   name: 'Test User',   email: 'test.user@tullow.com',   role: 'user'   },
  { id: '00000000-0000-0000-0000-000000000002', ms_object_id: 'ms-test-editor', name: 'Test Editor', email: 'test.editor@tullow.com', role: 'editor' },
  { id: '00000000-0000-0000-0000-000000000003', ms_object_id: 'ms-test-admin',  name: 'Test Admin',  email: 'test.admin@tullow.com',  role: 'admin'  },
];

// ── Generate tokens ───────────────────────────────────────────────────────────
function makeToken(u) {
  return jwt.sign(
    { userId: u.id, email: u.email, name: u.name, role: u.role, msObjectId: u.ms_object_id },
    process.env.JWT_SECRET,
    { expiresIn: '1h' }
  );
}
const TOKENS = Object.fromEntries(TEST_USERS.map((u) => [u.role, makeToken(u)]));

// ── Seed test users into DB ───────────────────────────────────────────────────
async function seedUsers() {
  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  try {
    for (const u of TEST_USERS) {
      await pool.query(
        `INSERT INTO users (id, ms_object_id, name, email, role)
         VALUES ($1, $2, $3, $4, $5)
         ON CONFLICT (id) DO UPDATE SET role = EXCLUDED.role`,
        [u.id, u.ms_object_id, u.name, u.email, u.role]
      );
    }
    console.log('  Seeded test users into DB');
  } finally {
    await pool.end();
  }
}

// ── HTTP helper ───────────────────────────────────────────────────────────────
function request(method, path, { token, body } = {}) {
  return new Promise((resolve, reject) => {
    const bodyStr = body ? JSON.stringify(body) : null;
    const headers = { 'Content-Type': 'application/json' };
    if (token) headers['Authorization'] = `Bearer ${token}`;
    if (bodyStr) headers['Content-Length'] = Buffer.byteLength(bodyStr);

    const req = http.request(`${BASE}${path}`, { method, headers }, (res) => {
      let data = '';
      res.on('data', (c) => (data += c));
      res.on('end', () => {
        try { resolve({ status: res.statusCode, body: JSON.parse(data) }); }
        catch { resolve({ status: res.statusCode, body: data }); }
      });
    });
    req.on('error', reject);
    if (bodyStr) req.write(bodyStr);
    req.end();
  });
}

// ── Assertion helpers ─────────────────────────────────────────────────────────
let passed = 0;
let failed = 0;

async function test(label, fn) {
  try {
    await fn();
    console.log(`  ✓  ${label}`);
    passed++;
  } catch (err) {
    console.log(`  ✗  ${label}`);
    console.log(`       ${err.message}`);
    failed++;
  }
}

function expect(actual, expected, message) {
  if (actual !== expected) throw new Error(`${message} — expected ${expected}, got ${actual}`);
}

// ── Test suites ───────────────────────────────────────────────────────────────
async function run() {
  console.log(`\nTullow CE API Tests  →  ${BASE}\n`);

  // Setup
  console.log('Setup');
  await test('Seed test users into database', seedUsers);

  // ── Health ──────────────────────────────────────────────────────────────────
  console.log('\nHealth');
  await test('GET /health → 200 with timestamp', async () => {
    const res = await request('GET', '/health');
    expect(res.status, 200, 'status');
    if (!res.body.ts) throw new Error('Missing ts field');
  });

  // ── Auth middleware ──────────────────────────────────────────────────────────
  console.log('\nAuth middleware');
  await test('GET /api/auth/me without token → 401', async () => {
    const res = await request('GET', '/api/auth/me');
    expect(res.status, 401, 'status');
  });
  await test('GET /api/auth/me with editor token → 200', async () => {
    const res = await request('GET', '/api/auth/me', { token: TOKENS.editor });
    expect(res.status, 200, 'status');
    if (res.body.user?.role !== 'editor') throw new Error('Wrong role in response');
  });
  await test('GET /api/auth/me with tampered token → 401', async () => {
    const res = await request('GET', '/api/auth/me', { token: TOKENS.editor + 'tampered' });
    expect(res.status, 401, 'status');
  });

  // ── RBAC ────────────────────────────────────────────────────────────────────
  console.log('\nRBAC');
  await test('GET /api/admin/users with user token → 403', async () => {
    const res = await request('GET', '/api/admin/users', { token: TOKENS.user });
    expect(res.status, 403, 'status');
  });
  await test('GET /api/admin/users with editor token → 403', async () => {
    const res = await request('GET', '/api/admin/users', { token: TOKENS.editor });
    expect(res.status, 403, 'status');
  });
  await test('GET /api/admin/users with admin token → 200', async () => {
    const res = await request('GET', '/api/admin/users', { token: TOKENS.admin });
    expect(res.status, 200, 'status');
    if (!Array.isArray(res.body.users)) throw new Error('users is not an array');
  });
  await test('PATCH /api/workflows/x/status with user token → 403', async () => {
    const res = await request('PATCH', '/api/workflows/CE-TEST/status', {
      token: TOKENS.user,
      body: { status: 'in_progress' },
    });
    expect(res.status, 403, 'status');
  });

  // ── Workflows ────────────────────────────────────────────────────────────────
  console.log('\nWorkflows');
  await test('GET /api/workflows (editor) → 200 array', async () => {
    const res = await request('GET', '/api/workflows', { token: TOKENS.editor });
    expect(res.status, 200, 'status');
    if (!Array.isArray(res.body.workflows)) throw new Error('workflows is not an array');
  });
  await test('GET /api/workflows (user) → 200 filtered array', async () => {
    const res = await request('GET', '/api/workflows', { token: TOKENS.user });
    expect(res.status, 200, 'status');
    if (!Array.isArray(res.body.workflows)) throw new Error('workflows is not an array');
  });
  await test('GET /api/workflows/stats (editor) → 200 with counts', async () => {
    const res = await request('GET', '/api/workflows/stats', { token: TOKENS.editor });
    expect(res.status, 200, 'status');
    const s = res.body.stats;
    if (s?.total === undefined) throw new Error('Missing stats.total');
  });
  await test('GET /api/workflows/stats (user) → 200', async () => {
    const res = await request('GET', '/api/workflows/stats', { token: TOKENS.user });
    expect(res.status, 200, 'status');
  });
  await test('GET /api/workflows/CE-NOT-EXIST → 404', async () => {
    const res = await request('GET', '/api/workflows/CE-NOT-EXIST', { token: TOKENS.editor });
    expect(res.status, 404, 'status');
  });

  // ── Webhook ──────────────────────────────────────────────────────────────────
  console.log('\nWebhook');
  await test('POST /api/emails/webhook?validationToken=... → 200 echoes token', async () => {
    const res = await request('POST', '/api/emails/webhook?validationToken=test-challenge-abc');
    expect(res.status, 200, 'status');
    if (res.body !== 'test-challenge-abc') throw new Error(`Body: "${res.body}"`);
  });
  await test('POST /api/emails/webhook with bad clientState → 202 (ignored async)', async () => {
    const res = await request('POST', '/api/emails/webhook', {
      body: { value: [{ clientState: 'wrong', resourceData: { id: 'x' } }] },
    });
    expect(res.status, 202, 'status');
  });

  // ── Emails / Inbox ───────────────────────────────────────────────────────────
  console.log('\nEmails / Inbox');
  await test('GET /api/emails (editor) → 200 array', async () => {
    const res = await request('GET', '/api/emails', { token: TOKENS.editor });
    expect(res.status, 200, 'status');
    if (!Array.isArray(res.body.emails)) throw new Error('emails is not an array');
  });
  await test('GET /api/emails/inbox (editor) → 200 with summary', async () => {
    const res = await request('GET', '/api/emails/inbox', { token: TOKENS.editor });
    expect(res.status, 200, 'status');
    if (!res.body.summary) throw new Error('Missing summary');
  });
  await test('GET /api/emails (user token) → 403', async () => {
    const res = await request('GET', '/api/emails', { token: TOKENS.user });
    expect(res.status, 403, 'status');
  });

  // ── Others (manual items) ─────────────────────────────────────────────────────
  console.log('\nOthers (manual items)');
  let createdOtherId;
  await test('POST /api/others (editor) → 201 with id', async () => {
    const res = await request('POST', '/api/others', {
      token: TOKENS.editor,
      body: {
        description:         'Test manual item',
        supplierName:        'Test Vendor Ltd',
        invoiceNumber:       'INV-TEST-001',
        amount:              5000,
        currency:            'USD',
        contractHolderEmail: 'test.user@tullow.com',
      },
    });
    expect(res.status, 201, 'status');
    createdOtherId = res.body.item?.id;
    if (!createdOtherId) throw new Error('No item.id');
  });
  await test('GET /api/others (editor) → contains created item', async () => {
    const res = await request('GET', '/api/others', { token: TOKENS.editor });
    expect(res.status, 200, 'status');
    const found = res.body.items?.some((i) => i.id === createdOtherId);
    if (!found) throw new Error('Created item not in list');
  });
  await test('GET /api/others (user) → 200 filtered by email', async () => {
    const res = await request('GET', '/api/others', { token: TOKENS.user });
    expect(res.status, 200, 'status');
    // user email matches contractHolderEmail so should see the item
    const found = res.body.items?.some((i) => i.id === createdOtherId);
    if (!found) throw new Error('User should see their own contract holder item');
  });
  await test('PATCH /api/others/:id (editor) → 200', async () => {
    if (!createdOtherId) throw new Error('No item to update (prior test failed)');
    const res = await request('PATCH', `/api/others/${createdOtherId}`, {
      token: TOKENS.editor,
      body: { description: 'Updated description' },
    });
    expect(res.status, 200, 'status');
  });
  await test('POST /api/others/:id/close (editor) → 200', async () => {
    if (!createdOtherId) throw new Error('No item to close');
    const res = await request('POST', `/api/others/${createdOtherId}/close`, {
      token: TOKENS.editor,
    });
    expect(res.status, 200, 'status');
  });
  await test('POST /api/others/:id/reopen (editor) → 200', async () => {
    if (!createdOtherId) throw new Error('No item to reopen');
    const res = await request('POST', `/api/others/${createdOtherId}/reopen`, {
      token: TOKENS.editor,
    });
    expect(res.status, 200, 'status');
  });

  // ── Tracker ──────────────────────────────────────────────────────────────────
  console.log('\nTracker');
  await test('GET /api/tracker (editor) → 200 array', async () => {
    const res = await request('GET', '/api/tracker', { token: TOKENS.editor });
    expect(res.status, 200, 'status');
    if (!Array.isArray(res.body.records)) throw new Error('records is not an array');
  });
  await test('GET /api/tracker/stats (editor) → 200 with summary', async () => {
    const res = await request('GET', '/api/tracker/stats', { token: TOKENS.editor });
    expect(res.status, 200, 'status');
    if (!res.body.stats?.summary) throw new Error('Missing stats.summary');
  });
  await test('GET /api/tracker (user) → 403', async () => {
    const res = await request('GET', '/api/tracker', { token: TOKENS.user });
    expect(res.status, 403, 'status');
  });

  // ── SES validation paths ──────────────────────────────────────────────────────
  console.log('\nSES (validation & not-found paths)');
  await test('POST /api/ses without workflowId → 400', async () => {
    const res = await request('POST', '/api/ses', {
      token: TOKENS.editor,
      body: { fields: {} },
    });
    expect(res.status, 400, 'status');
  });
  await test('GET /api/ses/00000000-... → 404', async () => {
    const res = await request('GET', '/api/ses/00000000-0000-0000-0000-000000000000', {
      token: TOKENS.editor,
    });
    expect(res.status, 404, 'status');
  });
  await test('POST /api/ses/autofill without vendorName → 400', async () => {
    const res = await request('POST', '/api/ses/autofill', {
      token: TOKENS.editor,
      body: {},
    });
    expect(res.status, 400, 'status');
  });
  await test('POST /api/ses/autofill with vendorName → 200 (null data if no history)', async () => {
    const res = await request('POST', '/api/ses/autofill', {
      token: TOKENS.editor,
      body: { vendorName: 'Unknown Vendor' },
    });
    expect(res.status, 200, 'status');
  });

  // ── Approval validation paths ──────────────────────────────────────────────────
  console.log('\nApproval (validation paths)');
  await test('GET /api/approval/CE-NOT-EXIST → 404', async () => {
    const res = await request('GET', '/api/approval/CE-NOT-EXIST', { token: TOKENS.editor });
    expect(res.status, 404, 'status');
  });
  await test('POST /api/approval/:id/sign without confirmed:true → 400', async () => {
    const res = await request('POST', '/api/approval/CE-NOT-EXIST/sign', {
      token: TOKENS.editor,
      body: {},
    });
    expect(res.status, 400, 'status');
  });
  await test('POST /api/approval/:id/comment with empty comment → 400', async () => {
    const res = await request('POST', '/api/approval/CE-NOT-EXIST/comment', {
      token: TOKENS.editor,
      body: { comment: '' },
    });
    expect(res.status, 400, 'status');
  });

  // ── Lock endpoint validation ───────────────────────────────────────────────────
  console.log('\nLock');
  await test('POST /api/workflows/CE-NOT-EXIST/lock → DB miss → 500/200 (workflow missing)', async () => {
    const res = await request('POST', '/api/workflows/CE-NOT-EXIST/lock', {
      token: TOKENS.editor,
    });
    // Workflow doesn't exist, lockService returns { success: false }
    if (![200, 409, 500].includes(res.status)) throw new Error(`Unexpected status ${res.status}`);
  });

  // ── Summary ───────────────────────────────────────────────────────────────────
  const total = passed + failed;
  console.log(`\n${'─'.repeat(55)}`);
  console.log(`Results: ${passed}/${total} passed${failed > 0 ? `  (${failed} failed)` : '  ✓'}`);
  console.log('─'.repeat(55) + '\n');
  process.exit(failed > 0 ? 1 : 0);
}

run().catch((err) => {
  console.error('\nTest runner crashed:', err.message);
  process.exit(1);
});

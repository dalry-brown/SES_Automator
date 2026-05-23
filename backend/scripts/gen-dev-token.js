/**
 * Generates JWT tokens for local API testing.
 * Usage: node scripts/gen-dev-token.js [role]
 * Roles: user | editor | admin (default: editor)
 */
require('dotenv').config();
const jwt = require('jsonwebtoken');

const role = process.argv[2] || 'editor';
const validRoles = ['user', 'editor', 'admin'];

if (!validRoles.includes(role)) {
  console.error(`Invalid role "${role}". Use: user | editor | admin`);
  process.exit(1);
}

const payload = {
  userId: `00000000-0000-0000-0000-00000000000${validRoles.indexOf(role) + 1}`,
  email:  `test.${role}@tullow.com`,
  name:   `Test ${role.charAt(0).toUpperCase() + role.slice(1)}`,
  role,
  msObjectId: `ms-test-${role}`,
};

const token = jwt.sign(payload, process.env.JWT_SECRET, { expiresIn: '24h' });

console.log('\n── Dev Token (' + role + ') ─────────────────────────────────');
console.log(token);
console.log('────────────────────────────────────────────────────────\n');
console.log('Payload:', JSON.stringify(payload, null, 2));

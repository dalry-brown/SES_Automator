const jwt = require('jsonwebtoken');
const axios = require('axios');
const { upsertUser, getUserByMsObjectId } = require('../db/queries/users');

function issueJwt(user) {
  return jwt.sign(
    {
      userId: user.id,
      email: user.email,
      name: user.name,
      role: user.role,
      msObjectId: user.msObjectId,
    },
    process.env.JWT_SECRET,
    { expiresIn: process.env.JWT_EXPIRES_IN || '8h' }
  );
}

async function login(msAccessToken) {
  // Verify the MS token by calling Graph /me
  const meRes = await axios.get('https://graph.microsoft.com/v1.0/me', {
    headers: { Authorization: `Bearer ${msAccessToken}` },
  });

  const { id: msObjectId, displayName, mail, userPrincipalName } = meRes.data;
  const email = mail || userPrincipalName;

  // Upsert user record
  const user = await upsertUser({ msObjectId, name: displayName, email });

  const token = issueJwt(user);
  return { token, user: { id: user.id, email: user.email, name: user.name, role: user.role } };
}

const authService = { login, issueJwt };
module.exports = { authService, issueJwt };

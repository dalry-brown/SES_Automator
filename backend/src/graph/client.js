require('dotenv').config();
const msal = require('@azure/msal-node');
const fs = require('fs');
const path = require('path');

const GRAPH_MODE = process.env.GRAPH_MODE || 'personal';
const TOKEN_CACHE_FILE = path.join(__dirname, '../../.msal-cache.json');

let _msalClient = null;
let _cachedToken = null;

// File-based MSAL token cache so device code auth survives server restarts
const cachePlugin = {
  beforeCacheAccess: async (cacheContext) => {
    try {
      if (fs.existsSync(TOKEN_CACHE_FILE)) {
        cacheContext.tokenCache.deserialize(fs.readFileSync(TOKEN_CACHE_FILE, 'utf8'));
      }
    } catch (_) { /* ignore corrupt cache */ }
  },
  afterCacheAccess: async (cacheContext) => {
    if (cacheContext.cacheHasChanged) {
      try {
        fs.writeFileSync(TOKEN_CACHE_FILE, cacheContext.tokenCache.serialize(), 'utf8');
      } catch (_) { /* ignore write errors */ }
    }
  },
};

function _buildMsalClient() {
  if (GRAPH_MODE === 'org') {
    return new msal.ConfidentialClientApplication({
      auth: {
        clientId: process.env.CLIENT_ID,
        authority: `https://login.microsoftonline.com/${process.env.TENANT_ID}`,
        clientSecret: process.env.CLIENT_SECRET,
      },
    });
  }
  return new msal.PublicClientApplication({
    auth: {
      clientId: process.env.CLIENT_ID,
      authority: 'https://login.microsoftonline.com/consumers',
    },
    cache: { cachePlugin },
  });
}

async function _acquireTokenSilent(client) {
  const accounts = await client.getTokenCache().getAllAccounts();
  if (!accounts || accounts.length === 0) return null;
  try {
    const result = await client.acquireTokenSilent({
      scopes: ['Mail.Read', 'Mail.Send', 'User.Read'].map(
        (s) => `https://graph.microsoft.com/${s}`
      ),
      account: accounts[0],
    });
    return result;
  } catch (_) {
    return null;
  }
}

async function _acquireTokenByDeviceCode(client) {
  return new Promise((resolve, reject) => {
    client
      .acquireTokenByDeviceCode({
        scopes: ['Mail.Read', 'Mail.Send', 'User.Read'].map(
          (s) => `https://graph.microsoft.com/${s}`
        ),
        deviceCodeCallback: (response) => {
          if (!response.userCode && !response.message) {
            return reject(new Error('Device code challenge failed'));
          }
          console.log('\n══════════════════════════════════════════════════');
          console.log(response.message);
          console.log('══════════════════════════════════════════════════\n');
        },
      })
      .then(resolve)
      .catch(reject);
  });
}

async function _acquireToken(client) {
  if (GRAPH_MODE === 'org') {
    return client.acquireTokenByClientCredential({
      scopes: ['https://graph.microsoft.com/.default'],
    });
  }

  // Try silent first (uses persisted cache)
  const silent = await _acquireTokenSilent(client);
  if (silent) {
    console.log('[Graph] Token acquired silently from cache');
    return silent;
  }

  // Fall back to interactive device code flow
  return _acquireTokenByDeviceCode(client);
}

async function getToken() {
  if (_cachedToken && _cachedToken.expiresOn > new Date(Date.now() + 60_000)) {
    return _cachedToken.accessToken;
  }
  if (!_msalClient) _msalClient = _buildMsalClient();
  const result = await _acquireToken(_msalClient);
  if (!result || !result.accessToken) {
    throw new Error('Failed to acquire Microsoft Graph token');
  }
  _cachedToken = result;
  return result.accessToken;
}

module.exports = { getToken, GRAPH_MODE };

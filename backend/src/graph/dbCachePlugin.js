'use strict';

const pool = require('../db/pool');

// MSAL token cache backed by PostgreSQL.
// Survives container restarts and deployments — the table is created by schema.sql.
// Errors are non-fatal: if the DB is unreachable the cache is simply empty and
// the device-code flow is triggered as a last resort.
const dbCachePlugin = {
  beforeCacheAccess: async (cacheContext) => {
    try {
      const { rows } = await pool.query(
        'SELECT data FROM msal_token_cache WHERE id = $1',
        ['singleton']
      );
      if (rows.length > 0) {
        cacheContext.tokenCache.deserialize(rows[0].data);
        console.log('[MSAL] Token cache loaded from database');
      }
    } catch (err) {
      console.warn('[MSAL] Could not load token cache from DB (will use device code):', err.message);
    }
  },

  afterCacheAccess: async (cacheContext) => {
    if (!cacheContext.cacheHasChanged) return;
    try {
      const data = cacheContext.tokenCache.serialize();
      await pool.query(
        `INSERT INTO msal_token_cache (id, data, updated_at)
         VALUES ('singleton', $1, NOW())
         ON CONFLICT (id) DO UPDATE SET data = $1, updated_at = NOW()`,
        [data]
      );
      console.log('[MSAL] Token cache saved to database');
    } catch (err) {
      console.warn('[MSAL] Could not save token cache to DB:', err.message);
    }
  },
};

module.exports = { dbCachePlugin };

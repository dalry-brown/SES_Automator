const axios = require('axios');
const { getToken, GRAPH_MODE } = require('./client');

let _subscriptionId = null;

function _getResource() {
  if (GRAPH_MODE === 'org') {
    return `users/${process.env.USER_EMAIL}/mailFolders/inbox/messages`;
  }
  return 'me/mailFolders/inbox/messages';
}

// Idempotent: checks for an existing valid subscription before creating a new one.
// This prevents duplicate subscriptions across restarts and initGraph retries.
async function registerSubscription(notificationUrl) {
  const token = await getToken();
  const headers = { Authorization: `Bearer ${token}` };
  const resource = _getResource();

  // List existing subscriptions and reuse one if it matches this resource + notificationUrl
  const { data: existing } = await axios.get(
    'https://graph.microsoft.com/v1.0/subscriptions',
    { headers }
  );

  const match = (existing.value || []).find(
    (s) => s.resource === resource && s.notificationUrl === notificationUrl
  );

  if (match) {
    // Renew the existing subscription (extend its expiry) and reuse it
    const expirationDateTime = new Date(Date.now() + 3 * 24 * 60 * 60 * 1000).toISOString();
    try {
      await axios.patch(
        `https://graph.microsoft.com/v1.0/subscriptions/${match.id}`,
        { expirationDateTime },
        { headers }
      );
      _subscriptionId = match.id;
      console.log(`[Webhook] Reusing existing subscription (renewed): ${_subscriptionId}`);
    } catch (err) {
      // Existing subscription may be expired/invalid — delete and recreate
      console.warn(`[Webhook] Could not renew existing subscription (${match.id}): ${err.message} — recreating`);
      try { await axios.delete(`https://graph.microsoft.com/v1.0/subscriptions/${match.id}`, { headers }); } catch {}
      return _createSubscription(notificationUrl, headers, resource);
    }
    return _subscriptionId;
  }

  return _createSubscription(notificationUrl, headers, resource);
}

async function _createSubscription(notificationUrl, headers, resource) {
  const expirationDateTime = new Date(Date.now() + 3 * 24 * 60 * 60 * 1000).toISOString();
  const response = await axios.post(
    'https://graph.microsoft.com/v1.0/subscriptions',
    {
      changeType: 'created',
      notificationUrl,
      resource,
      expirationDateTime,
      clientState: process.env.WEBHOOK_CLIENT_STATE || 'invoice-automation-prod',
    },
    { headers }
  );
  _subscriptionId = response.data.id;
  console.log(`[Webhook] Subscription registered: ${_subscriptionId}`);
  return _subscriptionId;
}

async function renewSubscription() {
  if (!_subscriptionId) {
    console.log('[Webhook] No subscription to renew — re-registering');
    const notificationUrl = process.env.NOTIFICATION_URL;
    if (!notificationUrl) throw new Error('NOTIFICATION_URL not set in .env');
    return registerSubscription(notificationUrl);
  }

  try {
    const token = await getToken();
    const expirationDateTime = new Date(Date.now() + 3 * 24 * 60 * 60 * 1000).toISOString();

    await axios.patch(
      `https://graph.microsoft.com/v1.0/subscriptions/${_subscriptionId}`,
      { expirationDateTime },
      { headers: { Authorization: `Bearer ${token}` } }
    );

    console.log(`[Webhook] Subscription renewed: ${_subscriptionId}`);
    return _subscriptionId;
  } catch (err) {
    console.error('[Webhook] Renewal failed, re-registering:', err.message);
    _subscriptionId = null;
    const notificationUrl = process.env.NOTIFICATION_URL;
    return registerSubscription(notificationUrl);
  }
}

function getSubscriptionId() {
  return _subscriptionId;
}

module.exports = { registerSubscription, renewSubscription, getSubscriptionId };

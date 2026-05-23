const cron = require('node-cron');
const { renewSubscription } = require('./webhook');

function startRenewalJob() {
  // Renew every 2 days — Graph max subscription lifetime is 3 days for mail
  cron.schedule('0 0 */2 * *', async () => {
    console.log('[SubscriptionRenewer] Running scheduled renewal');
    try {
      await renewSubscription();
    } catch (err) {
      console.error('[SubscriptionRenewer] Failed to renew subscription:', err.message);
    }
  });

  console.log('[SubscriptionRenewer] Renewal job scheduled (every 2 days)');
}

module.exports = { startRenewalJob };

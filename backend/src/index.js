require('dotenv').config();
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const morgan = require('morgan');

const errorHandler = require('./middleware/errorHandler');
const { getToken } = require('./graph/client');
const { registerSubscription } = require('./graph/webhook');
const { startRenewalJob } = require('./graph/subscriptionRenewer');
const { startLockCleanupJob } = require('./services/lockService');
const { startTrackerSyncJob } = require('./jobs/trackerDailySync');

// Routes
const authRoutes = require('./routes/auth');
const adminRoutes = require('./routes/admin');
const workflowRoutes = require('./routes/workflows');
const emailRoutes = require('./routes/emails');
const sesRoutes = require('./routes/ses');
const attachmentRoutes = require('./routes/attachments');
const formAttachmentRoutes = require('./routes/formAttachments');
const documentRoutes = require('./routes/documents');
const approvalRoutes = require('./routes/approval');
const trackerRoutes = require('./routes/tracker');
const othersRoutes = require('./routes/others');
const suggestionRoutes = require('./routes/suggestions');
const sesDocumentRoutes = require('./routes/sesDocuments');

const app = express();
const PORT = process.env.PORT || 4000;

// ── Middleware ────────────────────────────────────────────────────────────────
const FRONTEND = process.env.FRONTEND_URL || 'http://localhost:3000';
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      ...helmet.contentSecurityPolicy.getDefaultDirectives(),
      // Allow the Next.js frontend to embed document previews in iframes
      'frame-ancestors': ["'self'", FRONTEND],
    },
  },
  // X-Frame-Options doesn't support multiple origins — disable it and rely on CSP
  frameguard: false,
}));
app.use(cors({ origin: FRONTEND, credentials: true }));
app.use(morgan('dev'));

// Webhook endpoint must parse raw body for Graph validation token challenge
app.use('/api/emails/webhook', express.text({ type: '*/*' }));
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true }));

// ── Health ────────────────────────────────────────────────────────────────────
app.get('/health', (req, res) => res.json({ status: 'ok', ts: new Date().toISOString() }));

// ── API Routes ────────────────────────────────────────────────────────────────
app.use('/api/auth', authRoutes);
app.use('/api/admin', adminRoutes);
app.use('/api/workflows', workflowRoutes);
app.use('/api/emails', emailRoutes);
app.use('/api/ses', sesRoutes);
app.use('/api/attachments', attachmentRoutes);
app.use('/api/form-attachments', formAttachmentRoutes);
app.use('/api/documents', documentRoutes);
app.use('/api/approval', approvalRoutes);
app.use('/api/tracker', trackerRoutes);
app.use('/api/others', othersRoutes);
app.use('/api/suggestions', suggestionRoutes);
app.use('/api/ses-documents', sesDocumentRoutes);

// ── Error handler ─────────────────────────────────────────────────────────────
app.use(errorHandler);

// ── Startup ───────────────────────────────────────────────────────────────────
async function start() {
  try {
    startLockCleanupJob();
    startTrackerSyncJob();

    // Start listening first so the webhook validation endpoint is reachable
    // before we ask Microsoft to register the subscription.
    await new Promise((resolve) => {
      app.listen(PORT, () => {
        console.log(`[Boot] Server running on http://localhost:${PORT}`);
        resolve();
      });
    });

    if (process.env.CLIENT_ID) {
      console.log('[Boot] Acquiring Microsoft Graph token...');
      await getToken();
      console.log('[Boot] Token acquired');

      const notificationUrl = process.env.NOTIFICATION_URL;
      if (!notificationUrl) {
        console.warn('[Boot] NOTIFICATION_URL not set — skipping webhook registration');
      } else {
        console.log(`[Boot] Registering webhook at ${notificationUrl}`);
        try {
          await registerSubscription(notificationUrl);
        } catch (err) {
          console.error('[Boot] Webhook registration failed (server still running):', err.response?.data ?? err.message);
        }
      }

      startRenewalJob();
    } else {
      console.warn('[Boot] CLIENT_ID not set — Microsoft Graph features disabled');
    }
  } catch (err) {
    console.error('[Boot] Startup failed:', err.message);
    process.exit(1);
  }
}

start();

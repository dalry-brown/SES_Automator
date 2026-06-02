const axios = require('axios');
const { getToken, GRAPH_MODE } = require('./client');

function _baseUrl() {
  if (GRAPH_MODE === 'org') {
    return `https://graph.microsoft.com/v1.0/users/${process.env.USER_EMAIL}`;
  }
  return 'https://graph.microsoft.com/v1.0/me';
}

async function _headers() {
  const token = await getToken();
  return { Authorization: `Bearer ${token}` };
}

const GRAPH_TIMEOUT = 30_000; // ms — prevent indefinite hangs on Graph API calls

async function fetchEmail(messageId) {
  const headers = await _headers();
  const res = await axios.get(`${_baseUrl()}/messages/${messageId}`, { headers, timeout: GRAPH_TIMEOUT });
  return res.data;
}

async function fetchAttachmentList(messageId) {
  const headers = await _headers();
  const res = await axios.get(`${_baseUrl()}/messages/${messageId}/attachments`, { headers, timeout: GRAPH_TIMEOUT });
  return res.data.value || [];
}

async function downloadAttachment(messageId, attachmentId) {
  const headers = await _headers();
  const res = await axios.get(
    `${_baseUrl()}/messages/${messageId}/attachments/${attachmentId}`,
    { headers, timeout: GRAPH_TIMEOUT }
  );
  const attachment = res.data;

  // Graph API omits contentBytes for attachments >4MB; fall back to $value streaming endpoint
  if (attachment.contentBytes == null) {
    const streamRes = await axios.get(
      `${_baseUrl()}/messages/${messageId}/attachments/${attachmentId}/$value`,
      { headers, responseType: 'arraybuffer', timeout: GRAPH_TIMEOUT }
    );
    return {
      name: attachment.name,
      contentType: attachment.contentType,
      buffer: Buffer.from(streamRes.data),
    };
  }

  return {
    name: attachment.name,
    contentType: attachment.contentType,
    buffer: Buffer.from(attachment.contentBytes, 'base64'),
  };
}

async function sendReplyAll(messageId, htmlBody, attachments = [], toRecipients = [], ccRecipients = []) {
  const headers = await _headers();

  const message = {
    body: { contentType: 'html', content: htmlBody },
  };

  if (toRecipients.length > 0) {
    message.toRecipients = toRecipients.map((r) => ({
      emailAddress: { address: r.address, name: r.name || r.address },
    }));
  }
  if (ccRecipients.length > 0) {
    message.ccRecipients = ccRecipients.map((r) => ({
      emailAddress: { address: r.address, name: r.name || r.address },
    }));
  }
  if (attachments.length > 0) {
    message.attachments = attachments.map(({ name, contentType, buffer }) => ({
      '@odata.type': '#microsoft.graph.fileAttachment',
      name,
      contentType,
      contentBytes: buffer.toString('base64'),
    }));
  }

  await axios.post(
    `${_baseUrl()}/messages/${messageId}/replyAll`,
    { message },
    { headers, timeout: GRAPH_TIMEOUT }
  );
}

// sendCustomReply — reply-all that preserves thread.
// Uses createReplyAll (inherits all original recipients) → PATCH body (+ optional recipient override) → send.
// If toRecipients/ccRecipients are omitted the draft keeps the Graph-computed reply-all recipients.
// Attachments are added via separate POST calls so large files don't hit the PATCH body limit.
async function sendCustomReply(messageId, htmlBody, attachments = [], toRecipients, ccRecipients) {
  const headers = await _headers();

  // 1. Create a reply-all draft (inherits thread/conversation IDs automatically)
  const { data: draft } = await axios.post(
    `${_baseUrl()}/messages/${messageId}/createReplyAll`,
    {},
    { headers, timeout: GRAPH_TIMEOUT }
  );
  const draftId = draft.id;

  try {
    // 2. Patch the draft: always update body; only override recipients when explicitly provided
    const patch = { body: { contentType: 'html', content: htmlBody } };
    if (toRecipients != null) {
      patch.toRecipients = toRecipients.map((r) => ({
        emailAddress: { address: r.address, name: r.name || r.address },
      }));
    }
    if (ccRecipients != null) {
      patch.ccRecipients = ccRecipients.map((r) => ({
        emailAddress: { address: r.address, name: r.name || r.address },
      }));
    }
    await axios.patch(`${_baseUrl()}/messages/${draftId}`, patch, { headers, timeout: GRAPH_TIMEOUT });

    // 3. Add attachments one-by-one (avoids large PATCH body)
    for (const { name, contentType, buffer } of attachments) {
      await axios.post(
        `${_baseUrl()}/messages/${draftId}/attachments`,
        {
          '@odata.type': '#microsoft.graph.fileAttachment',
          name,
          contentType,
          contentBytes: buffer.toString('base64'),
        },
        { headers, timeout: GRAPH_TIMEOUT }
      );
    }

    // 4. Send the draft
    await axios.post(`${_baseUrl()}/messages/${draftId}/send`, {}, { headers, timeout: GRAPH_TIMEOUT });
  } catch (err) {
    // Best-effort draft cleanup so it doesn't sit in Drafts
    try { await axios.delete(`${_baseUrl()}/messages/${draftId}`, { headers }); } catch {}
    throw err;
  }
}

async function sendDirectEmail(to, subject, htmlBody, attachments = []) {
  const headers = await _headers();
  const message = {
    subject,
    body: { contentType: 'html', content: htmlBody },
    toRecipients: [{ emailAddress: { address: to } }],
  };
  if (attachments.length > 0) {
    message.attachments = attachments.map(({ name, contentType, buffer }) => ({
      '@odata.type': '#microsoft.graph.fileAttachment',
      name,
      contentType,
      contentBytes: buffer.toString('base64'),
    }));
  }
  await axios.post(`${_baseUrl()}/sendMail`, { message, saveToSentItems: false }, { headers, timeout: GRAPH_TIMEOUT });
}

async function sendEmail(subject, htmlBody, attachments = [], toRecipients = [], ccRecipients = []) {
  const headers = await _headers();
  const message = {
    subject,
    body: { contentType: 'html', content: htmlBody },
    toRecipients: toRecipients.map((r) => ({ emailAddress: { address: r.address, name: r.name || r.address } })),
    ccRecipients: ccRecipients.map((r) => ({ emailAddress: { address: r.address, name: r.name || r.address } })),
  };
  if (attachments.length > 0) {
    message.attachments = attachments.map(({ name, contentType, buffer }) => ({
      '@odata.type': '#microsoft.graph.fileAttachment',
      name,
      contentType,
      contentBytes: buffer.toString('base64'),
    }));
  }
  await axios.post(`${_baseUrl()}/sendMail`, { message, saveToSentItems: true }, { headers, timeout: GRAPH_TIMEOUT });
}

module.exports = { fetchEmail, fetchAttachmentList, downloadAttachment, sendReplyAll, sendCustomReply, sendDirectEmail, sendEmail };

const fs = require('fs');
const path = require('path');
const { BlobServiceClient } = require('@azure/storage-blob');
const { v4: uuidv4 } = require('uuid');
const { insertAttachment, getAttachment } = require('../db/queries/attachments');

const STORAGE_MODE = process.env.STORAGE_MODE || 'local';
const LOCAL_UPLOADS = path.join(__dirname, '../../uploads');

function _containerClient() {
  return BlobServiceClient
    .fromConnectionString(process.env.AZURE_STORAGE_CONNECTION_STRING)
    .getContainerClient(process.env.AZURE_STORAGE_CONTAINER || 'ses-documents');
}

async function save(buffer, originalName, workflowId = null) {
  const ext      = path.extname(originalName);
  const fileName = `${uuidv4()}${ext}`;
  const folder   = String(workflowId || 'unassigned');

  if (STORAGE_MODE === 'azure') {
    const blobName = `${folder}/${fileName}`;
    await _containerClient().getBlockBlobClient(blobName).upload(buffer, buffer.length);
    return { storageKey: blobName, fileName: originalName };
  }

  const dir = path.join(LOCAL_UPLOADS, folder);
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, fileName), buffer);
  return { storageKey: `${folder}/${fileName}`, fileName: originalName };
}

async function read(storageKey) {
  if (STORAGE_MODE === 'azure') {
    const download = await _containerClient().getBlockBlobClient(storageKey).download(0);
    const chunks = [];
    for await (const chunk of download.readableStreamBody) chunks.push(chunk);
    return Buffer.concat(chunks);
  }
  return fs.readFileSync(path.join(LOCAL_UPLOADS, storageKey));
}

async function remove(storageKey) {
  if (STORAGE_MODE === 'azure') {
    await _containerClient().getBlockBlobClient(storageKey).deleteIfExists();
    return;
  }
  const filePath = path.join(LOCAL_UPLOADS, storageKey);
  if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
}

async function serveAttachment(attachmentId, res) {
  const attachment = await getAttachment(attachmentId);
  if (!attachment) {
    res.status(404).json({ error: 'Attachment not found' });
    return;
  }

  if (STORAGE_MODE === 'azure') {
    const blobClient = _containerClient().getBlockBlobClient(attachment.storageKey);
    const expiry = new Date(Date.now() + 60 * 60 * 1000);
    const sas = await blobClient.generateSasUrl({
      permissions: 'r',
      expiresOn: expiry,
    });
    res.redirect(sas);
    return;
  }

  const filePath = path.join(LOCAL_UPLOADS, attachment.storageKey);
  if (!fs.existsSync(filePath)) {
    res.status(404).json({ error: 'File not found on disk' });
    return;
  }

  const stat = fs.statSync(filePath);
  const asciiFallback = attachment.fileName.replace(/[^\x20-\x7E]/g, '_');
  const encoded = encodeURIComponent(attachment.fileName);
  res.setHeader('Content-Type', attachment.mimeType || 'application/octet-stream');
  res.setHeader('Content-Disposition', `inline; filename="${asciiFallback}"; filename*=UTF-8''${encoded}`);
  res.setHeader('Content-Length', stat.size);

  const stream = fs.createReadStream(filePath);
  stream.on('error', (err) => {
    if (!res.headersSent) {
      res.status(500).json({ error: 'Failed to read file' });
    } else {
      res.destroy(err);
    }
  });
  stream.pipe(res);
}

async function saveUploadedAttachment(file, workflowId, user) {
  const buffer = fs.readFileSync(file.path);
  const { storageKey, fileName } = await save(buffer, file.originalname, workflowId);

  try { fs.unlinkSync(file.path); } catch {}

  const attachment = await insertAttachment({
    workflowId: workflowId || null,
    fileName:   file.originalname,
    storageKey,
    mimeType:   file.mimetype,
    size:       buffer.length,
    source:     'upload',
  });

  return attachment;
}

module.exports = { save, read, remove, serveAttachment, saveUploadedAttachment };

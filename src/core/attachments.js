import * as api from './api/endpoints.js';
import { cfg } from './config.js';

// The selected entry point decides the message kind; MIME only describes bytes.
export const hasImagePreview = mime => ['image/png', 'image/jpeg', 'image/gif', 'image/webp'].includes(mime);
export const attachmentLimits = capabilities => ({
  imageBytes: capabilities?.images?.max_image_bytes ?? cfg.composer.maxImageBytes,
  imageCount: capabilities?.images?.max_images_per_message ?? cfg.composer.maxImages,
  fileBytes: capabilities?.attachments?.max_attachment_bytes ?? cfg.composer.maxAttachmentBytes,
  fileCount: capabilities?.attachments?.max_attachments_per_message ?? cfg.composer.maxAttachments,
});

// Unsent composer attachments, mirrored per session for the page's lifetime
// (memory only — nothing here survives a reload). The composer stores its
// live list on every mutation and restores it when the user switches
// conversations or returns to one, so an unsent image survives A → B → A.
// Cleared by the composer when the draft is sent or emptied; object URLs of
// stored items stay alive until that item leaves the store.
const attachmentDrafts = new Map();
export function attachmentDraftsFor(sessionId) { return attachmentDrafts.get(sessionId) ?? []; }
export function saveAttachmentDrafts(sessionId, attachments) {
  if (attachments.length) {
    attachmentDrafts.set(sessionId, [...attachments]);
    // In-memory only, but unbounded sessions would still grow it; evict the
    // oldest session beyond a generous working set.
    while (attachmentDrafts.size > 32) {
      const oldest = attachmentDrafts.keys().next().value;
      if (oldest === undefined || oldest === sessionId) break;
      attachmentDrafts.delete(oldest);
    }
  } else attachmentDrafts.delete(sessionId);
}

export async function uploadAttachments(sessionId, attachments, { signal, capabilities } = {}) {
  const limits = attachmentLimits(capabilities);
  const blocks = [], uploaded = [];
  let images = 0, files = 0;
  for (const attachment of attachments) {
    if (attachment.bytes.byteLength > (attachment.kind === 'image' ? limits.imageBytes : limits.fileBytes)) {
      throw new Error('Attachment exceeds size limit');
    }
    if (attachment.kind !== 'image' && attachment.kind !== 'file') throw new Error('Invalid attachment kind');
    const upload = attachment.kind === 'image' ? api.uploadSessionImage : api.uploadSessionBlob;
    const blob = await upload(sessionId, attachment.bytes, { signal });
    if (attachment.kind === 'image') images++; else files++;
    if (images > limits.imageCount || files > limits.fileCount) throw new Error('Too many attachments');
    const block = { type: attachment.kind, blob_id: blob.sha256, byte_count: blob.byte_count, ...(attachment.placeholder ? { placeholder: attachment.placeholder } : {}), ...(attachment.name ? { filename: attachment.name } : {}) };
    blocks.push(block);
    uploaded.push({ ...block, mime_type: blob.mime_type, byte_count: blob.byte_count });
  }
  return { blocks, uploaded };
}

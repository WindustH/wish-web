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
    const block = { type: attachment.kind, blob_id: blob.sha256, ...(attachment.name ? { filename: attachment.name } : {}) };
    blocks.push(block);
    uploaded.push({ ...block, mime_type: blob.mime_type, byte_count: blob.byte_count });
  }
  return { blocks, uploaded };
}

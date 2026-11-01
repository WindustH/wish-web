import { attachmentDigest } from './attachmentDigest.ts';
import * as api from './api/endpoints.ts';
import { cfg } from './config.ts';

export interface StoredAttachmentReference {
  owner: string;
  id: string;
  mime: string;
  name: string;
  size: number;
}

export interface AttachmentInput {
  size?: number;
  unavailable?: boolean;
  stored?: { owner: string; id: string };
  kind: 'image' | 'file';
  pastedText?: boolean;
  name?: string;
  placeholder?: string;
  mime: string;
  bytes: ArrayBuffer;
  localUrl?: string;
  /** Optional bounded preview for a stored image; never uploaded as source bytes. */
  previewBlob?: Blob;
}
export interface PickedAttachment {
  kind: 'image' | 'file';
  pastedText?: boolean;
  name?: string;
  mime: string;
  size: number;
  read(): Promise<ArrayBuffer>;
}
export interface AttachmentLimits {
  imageBytes: number;
  imageCount: number;
  fileBytes: number;
  fileCount: number;
}
export interface UploadedAttachmentBlock {
  type: 'image' | 'file';
  blob_id: string;
  byte_count: number;
  placeholder?: string;
  filename?: string;
}

// The selected entry point decides the message kind; MIME only describes bytes.
// `capabilities` is the session's raw capability report, if any.
export const attachmentLimits = (capabilities?: any): AttachmentLimits => ({
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
const attachmentDrafts = new Map<string, AttachmentInput[]>();
export function attachmentDraftsFor<T extends AttachmentInput = AttachmentInput>(sessionId: string): T[] {
  return (attachmentDrafts.get(sessionId) ?? []) as T[];
}
export function saveAttachmentDrafts<T extends AttachmentInput>(
  sessionId: string,
  attachments: readonly T[],
  releaseEvicted?: (items: T[]) => void,
) {
  if (attachments.length) {
    attachmentDrafts.set(sessionId, [...attachments]);
    // In-memory only, but unbounded sessions would still grow it; evict the
    // oldest session beyond a generous working set.
    while (attachmentDrafts.size > 32) {
      const oldest = attachmentDrafts.keys().next().value;
      if (oldest === undefined || oldest === sessionId) break;
      releaseEvicted?.(attachmentDrafts.get(oldest) as T[]);
      attachmentDrafts.delete(oldest);
    }
  } else attachmentDrafts.delete(sessionId);
}

// Uploads the attachments to their owner's files: a session's by default, or a group's with `upload`.
export async function uploadAttachments(
  owner: string,
  attachments: readonly AttachmentInput[],
  {
    signal,
    capabilities,
    upload = api.uploadSessionBlob,
    verifyStored = api.blobMetadata,
  }: {
    signal?: AbortSignal;
    capabilities?: any;
    upload?: typeof api.uploadSessionBlob;
    verifyStored?: (reference: string) => Promise<unknown>;
  } = {},
) {
  const limits = attachmentLimits(capabilities);
  const blocks: UploadedAttachmentBlock[] = [],
    uploaded: (UploadedAttachmentBlock & { mime_type: string })[] = [];
  let images = 0,
    files = 0;
  for (const attachment of attachments) {
    if (attachment.unavailable)
      throw new Error('Attachment is unavailable; remove it or attach the original file again.');
    if (attachment.bytes.byteLength > (attachment.kind === 'image' ? limits.imageBytes : limits.fileBytes)) {
      throw new Error('Attachment exceeds size limit');
    }
    if (attachment.kind !== 'image' && attachment.kind !== 'file') throw new Error('Invalid attachment kind');
    let stored = attachment.stored?.owner === owner ? attachment.stored : undefined;
    if (!stored && attachment.stored && attachment.size !== undefined && !attachment.bytes.byteLength)
      throw new Error('Referenced file belongs to another conversation');
    if (stored) {
      try {
        await verifyStored(`${owner}/${stored.id}`);
      } catch (error) {
        if ((error as { status?: number }).status !== 404) throw error;
        if (attachment.size !== undefined && !attachment.bytes.byteLength) throw error;
        stored = undefined; // Cleanup removed it; the restored draft still owns the original bytes.
      }
    }
    const blob = stored
      ? { sha256: stored.id, byte_count: attachment.size ?? attachment.bytes.byteLength, mime_type: attachment.mime }
      : await upload(owner, attachment.bytes, { signal });
    if (attachment.kind === 'image') images++;
    else files++;
    if (images > limits.imageCount || files > limits.fileCount) throw new Error('Too many attachments');
    const block = {
      type: attachment.kind,
      blob_id: blob.sha256,
      byte_count: blob.byte_count,
      ...(attachment.placeholder ? { placeholder: attachment.placeholder } : {}),
      ...(attachment.name ? { filename: attachment.name } : {}),
    };
    blocks.push(block);
    uploaded.push({ ...block, mime_type: blob.mime_type, byte_count: blob.byte_count });
  }
  return { blocks, uploaded };
}

/** Build references before staging bytes; the same digest names the file after acceptance. */
export async function initialInput(
  text: string,
  attachments: readonly AttachmentInput[],
  requestId: string,
): Promise<api.InitialInput> {
  return {
    request_id: requestId,
    text,
    attachments: await Promise.all(
      attachments.map(async (item) => ({
        kind: item.kind,
        name: item.name,
        placeholder: item.placeholder,
        id: await attachmentDigest(item.bytes),
      })),
    ),
  };
}

export function initialSessionName(text: string, attachments: readonly AttachmentInput[]): string {
  for (const item of attachments) {
    if (item.placeholder)
      text = text.replaceAll(item.placeholder, item.name || (item.kind === 'image' ? 'Image' : 'File'));
  }
  return [...(text.trim().split('\n')[0] || attachments.find((item) => item.name)?.name || '')].slice(0, 60).join('');
}

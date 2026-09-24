import { shouldAttachPastedText, pastedTextFile } from '../../core/pastedText.js';
import { attachmentDigest } from '../../core/attachmentDigest.js';
import { ref, watch, onBeforeUnmount, type Ref } from 'vue';
import {
  attachmentDraftsFor,
  hasImagePreview,
  saveAttachmentDrafts,
  type AttachmentInput,
  type PickedAttachment,
} from '../../core/attachments.js';
import { fmtBytes } from '../../core/util/fmt.js';
import { blobUrl } from '../../core/api/endpoints.js';
import { platform } from '../../platform/index.js';
import { toast } from '../../ui/toast.js';

export interface Attachment extends AttachmentInput {
  localUrl: string;
}

export interface AttachmentLimits {
  imageBytes: number;
  fileBytes: number;
  imageCount: number;
  fileCount: number;
}

export function useComposerAttachments(
  sessionId: Ref<string>,
  limits: Ref<AttachmentLimits>,
) {
  let attachmentEpoch = 0;
  let pastedTextNumber = 0;
  const currentSid = ref(sessionId.value);
  currentSid.value = sessionId.value;

  const attachments = ref<Attachment[]>(attachmentDraftsFor<Attachment>(sessionId.value));
  const readingAttachments = ref(0);
  const deletedAttachments = new Map<string, Attachment>();

  const revokeAll = (items: Attachment[]) => {
    for (const i of items) {
      if (i?.localUrl) URL.revokeObjectURL(i.localUrl);
    }
  };

  function hasAttachmentSpace(kind: 'image' | 'file') {
    const isImage = kind === 'image';
    const count = isImage ? limits.value.imageCount : limits.value.fileCount;
    if (attachments.value.filter((item) => item.kind === kind).length >= count) {
      toast(`Too many ${isImage ? 'images' : 'files'} (limit: ${count})`);
      return false;
    }
    return true;
  }

  function attachmentAccepted(file: PickedAttachment) {
    const isImage = file.kind === 'image';
    const bytes = isImage ? limits.value.imageBytes : limits.value.fileBytes;
    if (file.size > bytes) {
      toast(`Attachment exceeds size limit (${fmtBytes(bytes)})`);
      return false;
    }
    return hasAttachmentSpace(file.kind);
  }

  async function refillAttachments(items: any[]) {
    deletedAttachments.clear();
    const epoch = ++attachmentEpoch;
    revokeAll(attachments.value);
    attachments.value = [];
    saveAttachmentDrafts(currentSid.value, []);
    readingAttachments.value = 1;
    try {
    for (const item of items) {
      try {
        const response = await fetch(blobUrl(item.blob_id));
        if (!response.ok) throw new Error(`blob ${item.blob_id}: ${response.status}`);
        const bytes = await response.arrayBuffer();
        if (epoch !== attachmentEpoch || !hasAttachmentSpace(item.kind)) continue;
        attachments.value = [
          ...attachments.value,
          {
            kind: item.kind,
            name: item.filename,
            mime: item.mime_type,
            placeholder: item.placeholder,
            bytes,
            localUrl: URL.createObjectURL(new Blob([bytes], { type: item.mime_type })),
          },
        ];
        saveAttachmentDrafts(currentSid.value, attachments.value);
      } catch (error) {
        if (epoch === attachmentEpoch) toast('Could not restore attachment: ' + String((error as Error)?.message ?? error));
      }
    }
    } finally { if (epoch === attachmentEpoch) readingAttachments.value = 0; }
  }

  async function attach(kind: 'image' | 'file', inserted?: (placeholder: string) => void) {
    const epoch = attachmentEpoch;
    try {
      const picked = await platform('fs').pickFiles({
        multiple: true,
        accept: kind === 'image' ? 'image/png,image/jpeg,image/gif,image/webp' : '',
      });
      if (epoch !== attachmentEpoch) return;
      await readAttachments(
        picked.map((file: Omit<PickedAttachment, 'kind'>) => ({ ...file, kind })), inserted,
      );
    } catch (error) {
      if (epoch === attachmentEpoch) toast('Could not read attachment: ' + String(error));
    }
  }

  async function onPaste(event: ClipboardEvent, inserted?: (placeholder: string) => void) {
    const text = event.clipboardData?.getData('text/plain') ?? '';
    const files: PickedAttachment[] = Array.from(event.clipboardData?.files ?? []).map(file => ({
      kind: hasImagePreview(file.type) ? 'image' : 'file',
      name: file.type.startsWith('image/') ? undefined : file.name || undefined,
      mime: file.type || 'application/octet-stream',
      size: file.size,
      read: () => file.arrayBuffer(),
    }));
    if (shouldAttachPastedText(text)) {
      for (const item of [...attachments.value, ...deletedAttachments.values()]) {
        const match = /^Pasted Text (\d+)$/.exec(item.name ?? '');
        if (match) pastedTextNumber = Math.max(pastedTextNumber, Number(match[1]));
      }
      const attachment = pastedTextFile(text, `Pasted Text ${++pastedTextNumber}`);
      // If limits prevent attachment creation, keep the normal text paste.
      if (attachmentAccepted(attachment)) {
        event.preventDefault();
        files.unshift(attachment);
      }
    }
    if (!files.length) return;
    if (!text) event.preventDefault();
    await readAttachments(files, inserted);
  }

  async function readAttachments(files: PickedAttachment[], inserted?: (placeholder: string) => void) {
    const epoch = attachmentEpoch;
    readingAttachments.value++;
    try {
      for (const file of files) {
        if (epoch !== attachmentEpoch) return;
        if (!attachmentAccepted(file)) continue;
        const bytes = await file.read();
        if (epoch !== attachmentEpoch) return;
        if (!hasAttachmentSpace(file.kind)) continue;
        const placeholder = `<${file.pastedText ? 'paste' : file.kind}-${await attachmentDigest(bytes)}>`;
        if (epoch !== attachmentEpoch) return;
        if (placeholder && attachments.value.some(item => item.placeholder === placeholder)) {
          inserted?.(placeholder);
          continue;
        }
        if (placeholder) deletedAttachments.delete(placeholder);
        attachments.value = [
          ...attachments.value,
          {
            placeholder,
            kind: file.kind,
            pastedText: file.pastedText,
            name: file.name,
            mime: file.mime,
            bytes,
            localUrl: URL.createObjectURL(new Blob([bytes], { type: file.mime })),
          },
        ];
        saveAttachmentDrafts(currentSid.value, attachments.value);
        if (placeholder) inserted?.(placeholder);
      }
    } catch (error) {
      if (epoch === attachmentEpoch) toast('Could not read attachment: ' + String(error));
    } finally {
      if (epoch === attachmentEpoch) readingAttachments.value--;
    }
  }

  function syncAttachmentTags(previous: string, next: string) {
    for (let i = attachments.value.length - 1; i >= 0; i--) {
      const attachment = attachments.value[i]!;
      const token = attachment.placeholder;
      if (token && previous.includes(token) && !next.includes(token)) {
        deletedAttachments.set(token, attachment);
        removeAttachment(i);
      }
    }
    for (const [token, attachment] of deletedAttachments) {
      if (!previous.includes(token) && next.includes(token)) {
        attachments.value.push({ ...attachment, localUrl: URL.createObjectURL(new Blob([attachment.bytes], { type: attachment.mime })) });
        deletedAttachments.delete(token);
      }
    }
    while (deletedAttachments.size > 100) deletedAttachments.delete(deletedAttachments.keys().next().value!);
    saveAttachmentDrafts(currentSid.value, attachments.value);
  }

  function removeAttachment(i: number) {
    const attachment = attachments.value[i];
    if (attachment?.localUrl) URL.revokeObjectURL(attachment.localUrl);
    attachments.value = attachments.value.filter((_, j) => j !== i);
    saveAttachmentDrafts(currentSid.value, attachments.value);
  }

  watch(
    sessionId,
    (id) => {
      deletedAttachments.clear();
      pastedTextNumber = 0;
      attachmentEpoch++;
      readingAttachments.value = 0;
      saveAttachmentDrafts(currentSid.value, attachments.value);
      currentSid.value = id;
      attachments.value = attachmentDraftsFor<Attachment>(id);
    },
    { flush: 'sync' },
  );

  onBeforeUnmount(() => {
    attachmentEpoch++;
  });

  return {
    attachments,
    readingAttachments,
    currentSid,
    attach,
    onPaste,
    removeAttachment,
    refillAttachments,
    syncAttachmentTags,
    clearAttachmentUndo: () => deletedAttachments.clear(),
    revokeAll,
  };
}

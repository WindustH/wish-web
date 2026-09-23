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
  const currentSid = ref(sessionId.value);
  currentSid.value = sessionId.value;

  const attachments = ref<Attachment[]>(attachmentDraftsFor<Attachment>(sessionId.value));
  const readingAttachments = ref(0);

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
    const epoch = attachmentEpoch;
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
            bytes,
            localUrl: URL.createObjectURL(new Blob([bytes], { type: item.mime_type })),
          },
        ];
        saveAttachmentDrafts(currentSid.value, attachments.value);
      } catch (error) {
        toast('Could not restore attachment: ' + String((error as Error)?.message ?? error));
      }
    }
  }

  async function attach(kind: 'image' | 'file') {
    const epoch = attachmentEpoch;
    try {
      const picked = await platform('fs').pickFiles({
        multiple: true,
        accept: kind === 'image' ? 'image/png,image/jpeg,image/gif,image/webp' : '',
      });
      if (epoch !== attachmentEpoch) return;
      await readAttachments(
        picked.map((file: Omit<PickedAttachment, 'kind'>) => ({ ...file, kind })),
      );
    } catch (error) {
      if (epoch === attachmentEpoch) toast('Could not read attachment: ' + String(error));
    }
  }

  function onPaste(event: ClipboardEvent) {
    const files = Array.from(event.clipboardData?.files ?? []);
    if (!files.length) return;
    if (!event.clipboardData?.getData('text/plain')) event.preventDefault();
    void readAttachments(
      files.map((file) => ({
        kind: hasImagePreview(file.type) ? ('image' as const) : ('file' as const),
        name: file.type.startsWith('image/') ? undefined : file.name || undefined,
        mime: file.type || 'application/octet-stream',
        size: file.size,
        read: () => file.arrayBuffer(),
      })),
    );
  }

  async function readAttachments(files: PickedAttachment[]) {
    const epoch = attachmentEpoch;
    readingAttachments.value++;
    try {
      for (const file of files) {
        if (epoch !== attachmentEpoch) return;
        if (!attachmentAccepted(file)) continue;
        const bytes = await file.read();
        if (epoch !== attachmentEpoch) return;
        if (!hasAttachmentSpace(file.kind)) continue;
        attachments.value = [
          ...attachments.value,
          {
            kind: file.kind,
            name: file.name,
            mime: file.mime,
            bytes,
            localUrl: URL.createObjectURL(new Blob([bytes], { type: file.mime })),
          },
        ];
        saveAttachmentDrafts(currentSid.value, attachments.value);
      }
    } catch (error) {
      if (epoch === attachmentEpoch) toast('Could not read attachment: ' + String(error));
    } finally {
      readingAttachments.value--;
    }
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
    revokeAll,
  };
}

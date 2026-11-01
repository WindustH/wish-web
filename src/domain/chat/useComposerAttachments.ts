import { imageFormat, supportedImageMime } from '../../core/imageFormat.ts';
import { tr } from '../../core/i18n/tr.ts';
import { shouldAttachPastedText, pastedTextFile } from '../../core/pastedText.ts';
import { attachmentDigest } from '../../core/attachmentDigest.ts';
import { ref, watch, onBeforeUnmount, type Ref } from 'vue';
import {
  attachmentDraftsFor,
  hasImagePreview,
  saveAttachmentDrafts as storeAttachmentDrafts,
  type AttachmentInput,
  type StoredAttachmentReference,
  type PickedAttachment,
} from '../../core/attachments.ts';
import { fmtBytes } from '../../core/util/fmt.ts';
import { blobUrl } from '../../core/api/endpoints.ts';
import { createAbortScope } from '../../core/util/abortScope.ts';
import { apiFetch } from '../../core/api/client.ts';
import { platform } from '../../platform/index.ts';
import { showError } from '../../ui/errorDialog.ts';
import { toast } from '../../ui/toast.ts';

export interface Attachment extends AttachmentInput {
  localUrl: string;
}

export interface AttachmentLimits {
  imageBytes: number;
  fileBytes: number;
  imageCount: number;
  fileCount: number;
}

export function useComposerAttachments(sessionId: Ref<string>, limits: Ref<AttachmentLimits>) {
  let attachmentEpoch = 0;
  const pendingReferences = new Set<AbortController>();
  let pastedTextNumber = 0;
  const attachmentsOwnerId = ref(sessionId.value);

  const attachments = ref<Attachment[]>(attachmentDraftsFor<Attachment>(sessionId.value));
  const readingAttachments = ref(0);
  const deletedAttachments = new Map<string, Attachment>();

  const revokeAll = (items: Attachment[]) => {
    for (const i of items) {
      if (i?.localUrl) URL.revokeObjectURL(i.localUrl);
    }
  };

  const saveAttachmentDrafts = (id: string, items: readonly Attachment[]) =>
    storeAttachmentDrafts(id, items, revokeAll);

  function hasAttachmentSpace(kind: 'image' | 'file') {
    const isImage = kind === 'image';
    const count = isImage ? limits.value.imageCount : limits.value.fileCount;
    if (attachments.value.filter((item) => item.kind === kind).length >= count) {
      toast(
        tr(
          `最多添加 ${count} 个${isImage ? '图片' : '文件'}附件`,
          `Too many ${isImage ? 'images' : 'files'} (limit: ${count})`,
        ),
      );
      return false;
    }
    return true;
  }

  function attachmentAccepted(file: Pick<PickedAttachment, 'kind' | 'size'>) {
    const isImage = file.kind === 'image';
    const bytes = isImage ? limits.value.imageBytes : limits.value.fileBytes;
    if (file.size > bytes) {
      toast(tr(`附件超过大小限制（${fmtBytes(bytes)}）`, `Attachment exceeds size limit (${fmtBytes(bytes)})`));
      return false;
    }
    return hasAttachmentSpace(file.kind);
  }

  async function referenceAttachment(reference: StoredAttachmentReference, inserted: (token: string) => void) {
    if (reference.owner !== attachmentsOwnerId.value) return;
    const kind = hasImagePreview(reference.mime) ? 'image' : 'file';
    const existing = attachments.value.find(
      (item) => item.stored?.owner === reference.owner && item.stored.id === reference.id,
    );
    if (existing?.placeholder) {
      inserted(existing.placeholder);
      return;
    }
    const file = { kind, name: reference.name, mime: reference.mime, size: reference.size } as const;
    if (kind === 'file') {
      if (!hasAttachmentSpace(kind)) return;
      const placeholder = `<file-${reference.id}>`;
      attachments.value = [
        ...attachments.value,
        {
          ...file,
          bytes: new ArrayBuffer(0),
          localUrl: '',
          placeholder,
          stored: { owner: reference.owner, id: reference.id },
        },
      ];
      saveAttachmentDrafts(attachmentsOwnerId.value, attachments.value);
      inserted(placeholder);
      return;
    }
    if (!attachmentAccepted(file)) return;
    const controller = new AbortController();
    const scope = createAbortScope([controller.signal], 60000);
    pendingReferences.add(controller);
    try {
      await readAttachments(
        [
          {
            ...file,
            read: async () => {
              const response = await apiFetch(blobUrl(`${reference.owner}/${reference.id}`), { signal: scope.signal });
              if (!response.ok) throw new Error(`HTTP ${response.status}`);
              return response.arrayBuffer();
            },
          },
        ],
        (token) => {
          const attachment = attachments.value.find((item) => item.placeholder === token);
          if (attachment) {
            attachment.stored = { owner: reference.owner, id: reference.id };
            saveAttachmentDrafts(attachmentsOwnerId.value, attachments.value);
          }
          inserted(token);
        },
      );
    } finally {
      scope.dispose();
      pendingReferences.delete(controller);
    }
  }

  async function refillAttachments(items: any[]) {
    deletedAttachments.clear();
    const epoch = ++attachmentEpoch;
    revokeAll(attachments.value);
    attachments.value = [];
    saveAttachmentDrafts(attachmentsOwnerId.value, []);
    readingAttachments.value = 1;
    try {
      for (const item of items) {
        try {
          const response = await apiFetch(blobUrl(item.blob_id));
          if (!response.ok) throw new Error(`blob ${item.blob_id}: ${response.status}`);
          const bytes = await response.arrayBuffer();
          if (epoch !== attachmentEpoch || !hasAttachmentSpace(item.kind)) continue;
          const mime = item.mime_type || response.headers.get('content-type') || 'application/octet-stream';
          attachments.value = [
            ...attachments.value,
            {
              kind: item.kind,
              name: item.filename,
              mime,
              stored: { owner: item.blob_id.split('/')[0], id: item.blob_id.split('/').at(-1) },
              placeholder: item.placeholder,
              bytes,
              localUrl: URL.createObjectURL(new Blob([bytes], { type: mime })),
            },
          ];
          saveAttachmentDrafts(attachmentsOwnerId.value, attachments.value);
        } catch (error) {
          if (epoch === attachmentEpoch) {
            attachments.value.push({
              kind: item.kind,
              name: item.filename,
              placeholder: item.placeholder,
              stored: { owner: item.blob_id.split('/')[0], id: item.blob_id.split('/').at(-1) },
              mime: item.mime_type || 'application/octet-stream',
              bytes: new ArrayBuffer(0),
              localUrl: '',
              unavailable: true,
            });
            saveAttachmentDrafts(attachmentsOwnerId.value, attachments.value);
            toast(
              tr(
                '附件无法恢复，可能已被清理。请移除或重新添加原文件。',
                'Attachment unavailable; it may have been cleaned up. Remove it or attach the original file again.',
              ),
            );
          }
        }
      }
    } finally {
      if (epoch === attachmentEpoch) readingAttachments.value = 0;
    }
  }

  function replaceAttachments(items: AttachmentInput[]) {
    attachmentEpoch++;
    readingAttachments.value = 0;
    deletedAttachments.clear();
    revokeAll(attachments.value);
    attachments.value = items.map((item) => ({
      ...item,
      localUrl: item.unavailable ? '' : URL.createObjectURL(new Blob([item.bytes], { type: item.mime })),
    }));
    saveAttachmentDrafts(attachmentsOwnerId.value, attachments.value);
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
        picked.map((file: Omit<PickedAttachment, 'kind'>) => ({ ...file, kind })),
        inserted,
      );
    } catch (error) {
      if (epoch === attachmentEpoch) showError({ title: tr('无法读取附件', 'Could not read attachment'), error });
    }
  }

  async function onPaste(event: ClipboardEvent, inserted?: (placeholder: string) => void) {
    const text = event.clipboardData?.getData('text/plain') ?? '';
    const files: PickedAttachment[] = Array.from(event.clipboardData?.files ?? []).map((file) => ({
      kind: hasImagePreview(file.type) ? 'image' : 'file',
      name: file.name || undefined,
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
        if (file.size > Math.max(limits.value.imageBytes, limits.value.fileBytes)) {
          toast(
            tr(
              `附件超过大小限制（${fmtBytes(Math.max(limits.value.imageBytes, limits.value.fileBytes))}）`,
              `Attachment exceeds size limit (${fmtBytes(Math.max(limits.value.imageBytes, limits.value.fileBytes))})`,
            ),
          );
          continue;
        }
        const bytes = await file.read();
        if (epoch !== attachmentEpoch) return;
        const imageMime = supportedImageMime(bytes);
        const kind = file.kind === 'image' && !imageMime ? 'file' : file.kind;
        const mime = imageMime || imageFormat(bytes) || file.mime;
        if (!attachmentAccepted({ ...file, kind, size: bytes.byteLength })) continue;
        if (kind !== file.kind) {
          toast(
            tr('此图片格式不受支持，已转为文件附件。', 'This image format is unsupported; added as a file attachment.'),
          );
        }
        const placeholder = `<${file.pastedText ? 'paste' : kind}-${await attachmentDigest(bytes)}>`;
        if (epoch !== attachmentEpoch) return;
        if (placeholder && attachments.value.some((item) => item.placeholder === placeholder)) {
          inserted?.(placeholder);
          continue;
        }
        if (placeholder) deletedAttachments.delete(placeholder);
        attachments.value = [
          ...attachments.value,
          {
            placeholder,
            kind,
            pastedText: file.pastedText,
            name: file.name,
            mime,
            bytes,
            localUrl: URL.createObjectURL(new Blob([bytes], { type: mime })),
          },
        ];
        saveAttachmentDrafts(attachmentsOwnerId.value, attachments.value);
        if (placeholder) inserted?.(placeholder);
      }
    } catch (error) {
      if (epoch === attachmentEpoch) showError({ title: tr('无法读取附件', 'Could not read attachment'), error });
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
    let restored = false;
    for (const [token, attachment] of deletedAttachments) {
      if (!previous.includes(token) && next.includes(token)) {
        attachments.value.push({
          ...attachment,
          localUrl: attachment.unavailable
            ? ''
            : URL.createObjectURL(new Blob([attachment.bytes], { type: attachment.mime })),
        });
        deletedAttachments.delete(token);
        restored = true;
      }
    }
    if (restored) {
      const position = (attachment: Attachment) => (attachment.placeholder ? next.indexOf(attachment.placeholder) : -1);
      attachments.value.sort((a, b) => {
        const left = position(a),
          right = position(b);
        return (left < 0 ? Number.MAX_SAFE_INTEGER : left) - (right < 0 ? Number.MAX_SAFE_INTEGER : right);
      });
    }
    while (deletedAttachments.size > 100) deletedAttachments.delete(deletedAttachments.keys().next().value!);
    saveAttachmentDrafts(attachmentsOwnerId.value, attachments.value);
  }

  function removeAttachment(i: number) {
    const attachment = attachments.value[i];
    if (attachment?.localUrl) URL.revokeObjectURL(attachment.localUrl);
    attachments.value = attachments.value.filter((_, j) => j !== i);
    saveAttachmentDrafts(attachmentsOwnerId.value, attachments.value);
  }

  watch(
    sessionId,
    (id) => {
      deletedAttachments.clear();
      pastedTextNumber = 0;
      attachmentEpoch++;
      for (const request of pendingReferences) request.abort();
      readingAttachments.value = 0;
      saveAttachmentDrafts(attachmentsOwnerId.value, attachments.value);
      attachmentsOwnerId.value = id;
      attachments.value = attachmentDraftsFor<Attachment>(id);
    },
    { flush: 'sync' },
  );

  onBeforeUnmount(() => {
    attachmentEpoch++;
    for (const request of pendingReferences) request.abort();
  });

  return {
    attachments,
    readingAttachments,
    attachmentsOwnerId,
    attach,
    onPaste,
    removeAttachment,
    refillAttachments,
    referenceAttachment,
    replaceAttachments,
    syncAttachmentTags,
    clearAttachmentUndo: () => deletedAttachments.clear(),
    revokeAll,
  };
}

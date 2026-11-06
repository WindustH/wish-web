<script setup lang="ts">
// Right-click, a long press or the context-menu key on a message opens its menu: copy the text, or
// save the image. On a touch screen a long press on the words selects them instead (TouchSelection),
// and one on the blank of the message opens the menu. A right click on a selection acts on what was
// selected.
import { computed, inject, ref } from 'vue';
import { replyContextKey } from '../../references/context.ts';
import { markdownSelectionPieces } from '../../../ui/markdownSelection.ts';
import { replyReferenceId, type ReplyReference } from '../../../core/replyReferences.ts';
import { apiFetch } from '../../../core/api/client.ts';
import Menu from '../../../ui/components/Menu.vue';
import type { MenuItem } from '../../../ui/components/menuTypes.ts';
import { toast } from '../../../ui/toast.ts';
import { tr } from '../../../core/i18n/tr.ts';
import { markdownSelection } from '../../../ui/markdownSelection.ts';
import { copyText } from '../../../ui/clipboard.ts';
import { saveBlob } from '../../../ui/download.ts';

const props = defineProps<{ text: string; kind: 'user' | 'assistant'; image?: { src: string; filename?: string } }>();
const hasMenu = computed(() => !!props.image || !!props.text.trim());
const items = computed<MenuItem[]>(() =>
  props.image
    ? [{ key: 'save', icon: 'download', label: tr('保存图片', 'Save image') }]
    : [{ key: 'copy', icon: 'copy', label: tr('复制消息', 'Copy message') }],
);
const replies = inject(replyContextKey, undefined);
let selectedReferences: ReplyReference[] = [];
const canReply = ref(false);
const selectionItems = computed<MenuItem[]>(() => [
  { key: 'copy-selection', icon: 'copy', label: tr('复制', 'Copy') },
  ...(replies && canReply.value ? [{ key: 'reply', icon: 'reply', label: tr('回复', 'Reply') }] : []),
]);
function captureSelection(range: Range, root: Element, fallback: string) {
  selectedReferences = [];
  const pieces = markdownSelectionPieces(range, root);
  for (const piece of pieces) {
    const host = piece.owner.closest<HTMLElement>('[data-reply-seq]');
    if (!host || !replies) continue;
    selectedReferences.push({
      id: replyReferenceId(),
      session: replies.session.value,
      source: `message_${host.dataset.replySeq}`,
      seq: Number(host.dataset.replySeq),
      block: Number(host.dataset.replyBlock),
      start: piece.start,
      end: piece.end,
      text: piece.source.slice(piece.start, piece.end),
      label: fallback.replace(/\s+/g, ' ').slice(0, 70),
    });
  }
  // Plain user bubbles have one text node; capture offsets without searching its value.
  if (!pieces.length && replies && root.contains(range.commonAncestorContainer)) {
    const host = range.startContainer.parentElement?.closest<HTMLElement>('[data-reply-seq]');
    const text = host?.querySelector('[data-reply-plain]');
    if (host && text?.contains(range.commonAncestorContainer)) {
      const prefix = range.cloneRange();
      prefix.selectNodeContents(text);
      prefix.setEnd(range.startContainer, range.startOffset);
      const start = prefix.toString().length;
      selectedReferences.push({
        id: replyReferenceId(),
        session: replies.session.value,
        source: `message_${host.dataset.replySeq}`,
        seq: Number(host.dataset.replySeq),
        block: Number(host.dataset.replyBlock),
        start,
        end: start + range.toString().length,
        text: range.toString(),
        label: range.toString().replace(/\s+/g, ' ').slice(0, 70),
      });
    }
  }
  canReply.value = selectedReferences.length > 0;
  return markdownSelection(range, root, fallback);
}
async function choose(key: string, selection?: string) {
  if (key === 'reply') {
    if (!selectedReferences.length) {
      toast(tr('请选择同一消息中的文本', 'Select text within one message'));
      return;
    }
    for (const reference of [...selectedReferences]) await replies?.add(reference);
  } else if (key === 'copy-selection') void copyText(selection ?? '');
  else void (key === 'save' ? saveImage() : copyMessage());
}

function copySelection(event: ClipboardEvent) {
  const root = event.currentTarget as HTMLElement;
  if ((event.target as Element)?.closest('input, textarea, [contenteditable="true"]')) return;
  const selection = root.ownerDocument.getSelection();
  if (!selection?.rangeCount || selection.isCollapsed || !event.clipboardData) return;
  const range = selection.getRangeAt(0);
  if (!root.contains(range.commonAncestorContainer)) return;
  const text = markdownSelection(range, root, selection.toString());
  event.clipboardData.setData('text/plain', text);
  event.preventDefault();
}

async function saveImage() {
  if (!props.image) return;
  try {
    const response = await apiFetch(props.image.src);
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const blob = await response.blob();
    const ext =
      (
        {
          'image/jpeg': 'jpg',
          'image/gif': 'gif',
          'image/webp': 'webp',
          'image/avif': 'avif',
          'image/svg+xml': 'svg',
        } as Record<string, string>
      )[blob.type] || 'png';
    const filename = props.image.filename?.replace(/[\\/]/g, '_') || `image.${ext}`;
    saveBlob(blob, filename);
  } catch (error) {
    toast(tr('保存图片失败：', 'Could not save image: ') + String(error));
  }
}

const copyMessage = () => copyText(props.text);
</script>

<template>
  <Menu
    context
    selects-text
    :items="items"
    :selection-items="selectionItems"
    :selection-text="captureSelection"
    :disabled="!hasMenu"
    :within="kind === 'user' ? '.bubble' : '.body'"
    @select="choose"
  >
    <div class="message-context" :class="kind" :tabindex="hasMenu ? 0 : undefined" @copy="copySelection">
      <slot />
    </div>
  </Menu>
</template>

<style scoped>
.message-context {
  width: 100%;
  outline: none;
}
</style>

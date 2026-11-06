<script setup lang="ts">
import Markdown from '../../ui/components/Markdown.vue';
import { parseFileMention } from '../../core/blobMentions.ts';
import { useFileMention } from './useFileMention.ts';
import { tr } from '../../core/i18n/tr.ts';
import { describeError } from '../../core/i18n/errorMessages.ts';
import { toast } from '../../ui/toast.ts';

defineProps<{ text: string; streaming?: boolean }>();
const openFile = useFileMention();
async function openLink(anchor: HTMLAnchorElement, event: MouseEvent) {
  if (!anchor.hasAttribute('data-file-mention')) return;
  event.preventDefault();
  event.stopPropagation();
  const mention = parseFileMention(anchor.dataset.fileMention ?? '');
  if (!mention) return;
  if (!openFile) return toast(tr('请在会话中打开此文件', 'Open this file from its conversation'));
  if (anchor.getAttribute('aria-busy') === 'true') return;
  anchor.setAttribute('aria-busy', 'true');
  try {
    await openFile({ ...mention, name: anchor.textContent?.trim() });
  } catch (error) {
    toast(describeError(error).message);
  } finally {
    anchor.removeAttribute('aria-busy');
  }
}
</script>

<template>
  <Markdown :text="text" :streaming="streaming" @link-click="openLink" />
</template>

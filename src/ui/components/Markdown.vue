<script setup lang="ts">
import { computed, ref, watchEffect } from 'vue';
import { i18n } from '../../core/i18n/index.ts';
import { createMarkdownBlocks } from '../markdown.ts';
import { registerMarkdownSource } from '../markdownSelection.ts';
import { toast } from '../toast.ts';
import { copyText } from '../clipboard.ts';

const props = defineProps<{ text: string; streaming?: boolean }>();
const emit = defineEmits<{ linkClick: [anchor: HTMLAnchorElement, event: MouseEvent] }>();
const root = ref<HTMLElement>();
watchEffect(() => {
  if (root.value) registerMarkdownSource(root.value, props.text, blocks.value);
});
const renderBlocks = createMarkdownBlocks();
const blocks = computed(() => renderBlocks(props.text, i18n.t('common.copy'), props.streaming));
async function handleClick(event: MouseEvent) {
  const target = event.target;
  if (!(target instanceof Element)) return;
  const anchor = target.closest<HTMLAnchorElement>('a');
  if (anchor && root.value?.contains(anchor)) {
    emit('linkClick', anchor, event);
    return;
  }
  const button = target.closest<HTMLButtonElement>('button.code-copy');
  if (!button) return;
  const code = button.closest('.code-block')!.querySelector('pre code')!;
  if (await copyText(code.textContent ?? '')) toast(i18n.t('common.codeCopied'));
}
</script>

<template>
  <div ref="root" class="markdown" @click="handleClick">
    <div
      v-for="block in blocks"
      :key="block.key"
      class="markdown-block"
      :data-source-key="block.key"
      :data-source-start="block.start"
      :data-source-end="block.end"
      v-html="block.html"
    />
  </div>
</template>

<style scoped>
.markdown-block {
  display: contents;
}
.markdown :deep(.code-block pre) {
  content-visibility: auto;
  contain-intrinsic-size: auto 120px;
}
.markdown :deep(.file-mention) {
  display: inline;
  padding: 2px 5px;
  border: 1px solid var(--line);
  border-radius: 6px;
  background: var(--bg-raised);
  color: var(--accent);
  box-decoration-break: clone;
  -webkit-box-decoration-break: clone;
  overflow-wrap: anywhere;
  cursor: pointer;
}
.markdown :deep(.file-mention .icon) {
  display: inline-block;
  width: 1em;
  height: 1em;
  margin-right: 0.3em;
  vertical-align: -0.15em;
}
.markdown :deep(.file-mention[aria-busy='true']) {
  opacity: 0.6;
  cursor: progress;
}
</style>

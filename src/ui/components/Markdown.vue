<script setup lang="ts">
import { computed, ref, watchEffect } from 'vue';
import { i18n } from '../../core/i18n/index.ts';
import { createMarkdownBlocks } from '../markdown.ts';
import { registerMarkdownSource } from '../markdownSelection.ts';
import { toast } from '../toast.ts';
import { copyText } from '../clipboard.ts';

const props = defineProps<{ text: string; streaming?: boolean }>();
const root = ref<HTMLElement>();
watchEffect(() => {
  if (root.value) registerMarkdownSource(root.value, props.text, blocks.value);
});
const renderBlocks = createMarkdownBlocks();
const blocks = computed(() => renderBlocks(props.text, i18n.t('common.copy'), props.streaming));
async function copyCode(event: MouseEvent) {
  const target = event.target;
  if (!(target instanceof Element)) return;
  const button = target.closest<HTMLButtonElement>('button.code-copy');
  if (!button) return;
  const code = button.closest('.code-block')!.querySelector('pre code')!;
  if (await copyText(code.textContent ?? '')) toast(i18n.t('common.codeCopied'));
}
</script>

<template>
  <div ref="root" class="markdown" @click="copyCode">
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
</style>

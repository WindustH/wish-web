<script setup lang="ts">
import { computed } from 'vue';
import { i18n } from '../../core/i18n/index.ts';
import { renderMarkdown } from '../markdown.ts';
import { toast } from '../toast.ts';
import { tr } from '../../core/i18n/tr.ts';
import { copyText } from '../clipboard.ts';

const props = defineProps<{ text: string }>();
const html = computed(() => renderMarkdown(props.text, i18n.t('common.copy')));
async function copyCode(event: MouseEvent) {
  const target = event.target;
  if (!(target instanceof Element)) return;
  const button = target.closest<HTMLButtonElement>('button.code-copy');
  if (!button) return;
  const code = button.parentElement!.querySelector('pre code')!;
  if (await copyText(code.textContent ?? '')) toast(tr('代码已复制', 'Code copied'));
}
</script>

<template>
  <div class="markdown" @click="copyCode" v-html="html" />
</template>

<style scoped>
.markdown :deep(.code-block) { position: relative; }
.markdown :deep(.code-block pre) {
  padding-top: 2.6rem;
  content-visibility: auto;
  contain-intrinsic-size: auto 120px;
}
.markdown :deep(.code-copy) { position: absolute; top: 0.35rem; right: 0.4rem; }
</style>

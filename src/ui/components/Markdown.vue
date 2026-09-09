<script setup lang="ts">
import { computed } from 'vue';
import { i18n } from '../../core/i18n/index.js';
import { platform } from '../../platform/index.js';
import { renderMarkdown } from '../markdown';
import { toast } from '../toast';

const props = defineProps<{ text: string }>();
const html = computed(() => renderMarkdown(props.text, i18n.t('common.copy')));
async function copyCode(event: MouseEvent) {
  const target = event.target;
  if (!(target instanceof Element)) return;
  const button = target.closest<HTMLButtonElement>('button.code-copy');
  if (!button) return;
  const code = button.parentElement!.querySelector('pre code')!;
  try {
    await platform('clipboard').writeText(code.textContent ?? '');
    toast(i18n.locale.value === 'zh' ? '代码已复制' : 'Code copied');
  } catch (error) {
    toast((i18n.locale.value === 'zh' ? '复制失败：' : 'Copy failed: ') + String(error));
  }
}
</script>

<template>
  <div class="markdown" @click="copyCode" v-html="html" />
</template>

<style scoped>
.markdown :deep(.code-block) { position: relative; }
.markdown :deep(.code-block pre) { padding-top: 2.6rem; }
.markdown :deep(.code-copy) { position: absolute; top: 0.35rem; right: 0.4rem; }
</style>

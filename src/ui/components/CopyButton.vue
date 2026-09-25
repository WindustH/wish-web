<script setup lang="ts">
import Hint from './Hint.vue';
import { onUnmounted, ref } from 'vue';
import Icon from './Icon.vue';
import { i18n } from '../../core/i18n/index.ts';

import { platform } from '../../platform/index.ts';
import { toast } from '../toast.ts';

let timer: ReturnType<typeof setTimeout> | undefined;
onUnmounted(() => clearTimeout(timer));
const props = defineProps<{ text: string }>();
const done = ref(false);

async function copy() {
  try {
    await platform('clipboard').writeText(props.text);
    done.value = true;
    clearTimeout(timer);
    timer = setTimeout(() => { done.value = false; }, 1200);
  } catch (err) {
    toast((i18n.locale.value === 'zh' ? '复制失败：' : 'Copy failed: ') + String(err));
  }
}
</script>

<template>
  <Hint :text="i18n.t('common.copy')"><button class="btn ghost icon-only copy-btn" :aria-label="i18n.t('common.copy')" @click="copy">
    <Icon :name="done ? 'check' : 'copy'" />
  </button></Hint>
</template>

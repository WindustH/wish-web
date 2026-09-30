<script setup lang="ts">
import Hint from './Hint.vue';
import { onUnmounted, ref } from 'vue';
import Icon from './Icon.vue';
import { i18n } from '../../core/i18n/index.ts';

import { copyText } from '../clipboard.ts';

let timer: ReturnType<typeof setTimeout> | undefined;
onUnmounted(() => clearTimeout(timer));
const props = defineProps<{ text: string }>();
const done = ref(false);

async function copy() {
  if (!await copyText(props.text)) return;
  done.value = true;
  clearTimeout(timer);
  timer = setTimeout(() => { done.value = false; }, 1200);
}
</script>

<template>
  <Hint :text="i18n.t('common.copy')"><button class="btn ghost icon-only copy-btn" :aria-label="i18n.t('common.copy')" @click="copy">
    <Icon :name="done ? 'check' : 'copy'" />
  </button></Hint>
</template>

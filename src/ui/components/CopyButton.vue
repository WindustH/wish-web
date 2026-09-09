<script setup lang="ts">
import { ref } from 'vue';
import Icon from './Icon.vue';
import { i18n } from '../../core/i18n/index.js';

const props = defineProps<{ text: string }>();
const done = ref(false);

async function copy() {
  try {
    await navigator.clipboard.writeText(props.text);
    done.value = true;
    setTimeout(() => { done.value = false; }, 1200);
  } catch (err) {
    console.warn('[copy] failed:', err);
  }
}
</script>

<template>
  <button class="btn ghost icon-only copy-btn" :title="i18n.t('common.copy')" @click="copy">
    <Icon :name="done ? 'check' : 'copy'" />
  </button>
</template>

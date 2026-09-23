<script setup lang="ts">
import { i18n } from '../../../core/i18n/index.js';
defineProps<{ item: any }>();
</script>
<template>
  <div class="history-error" role="alert">
    <strong>{{ i18n.t('chat.runFailed') }}</strong>
    <p>{{ item.entry.payload.failure.message }}</p>
    <small v-if="item.entry.payload.failure.family">{{ item.entry.payload.failure.family }}</small>
  </div>
</template>
<style scoped>
.history-error { margin:12px 0; padding:12px 16px; border:1px solid var(--err-border); border-radius:var(--radius); background:var(--err-bg); color:var(--err); overflow-wrap:anywhere; user-select:text; }
.history-error strong { font-size:13px; }
.history-error p { margin:6px 0; font-size:13px; white-space:pre-wrap; }
.history-error small { font-size:11px; }
</style>

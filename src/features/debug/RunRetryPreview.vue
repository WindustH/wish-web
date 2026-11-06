<script setup lang="ts">
import { computed, onBeforeUnmount, ref } from 'vue';
import type { DisplayFailure } from '../../core/api/failures.ts';
import { tr } from '../../core/i18n/tr.ts';
import RunFailureCard from '../../domain/chat/RunFailureCard.vue';
import RunRetryButton from '../../domain/chat/RunRetryButton.vue';
const props = defineProps<{ failure: DisplayFailure; busy?: boolean }>();
const pending = ref(false);
const completed = ref(false);
const busy = computed(() => props.busy || pending.value);
let timer: ReturnType<typeof setTimeout> | undefined;
function retry() {
  if (busy.value) return;
  pending.value = true;
  completed.value = false;
  timer = setTimeout(() => {
    pending.value = false;
    completed.value = true;
  }, 1200);
}
onBeforeUnmount(() => clearTimeout(timer));
</script>
<template>
  <RunFailureCard :failure="failure">
    <RunRetryButton :busy="busy" @retry="retry" />
  </RunFailureCard>
  <p v-if="completed" class="hint" role="status">{{ tr('重试状态预览完成', 'Retry state preview complete') }}</p>
</template>

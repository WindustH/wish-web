<script setup lang="ts">
import { computed } from 'vue';
import { chat } from '../../core/state/chatSlice.ts';
import { tr } from '../../core/i18n/tr.ts';
import { showError } from '../../ui/errorDialog.ts';
import Icon from '../../ui/components/Icon.vue';
const props = defineProps<{ session: string; sequence?: number }>();
const available = computed(() => {
  const snapshot = chat.snapshot.value;
  if (snapshot?.id !== props.session || snapshot.running || chat.stream.value.active) return false;
  // Suspended.outcome references an event ID, not its history sequence.
  const outcomeId = snapshot.status?.state?.Suspended?.outcome;
  if (outcomeId == null) return false;
  const outcome = chat.entries.value.find((entry) => entry.event_id === outcomeId);
  const failure = outcome?.payload.failure;
  if (!failure || !/transport|streamfailed/i.test(failure.family)) return false;
  return props.sequence == null || outcome?.seq === props.sequence;
});
async function retry() {
  try {
    await chat.retryRun(props.session);
  } catch (error) {
    showError({ title: tr('重试失败', 'Retry failed'), error });
  }
}
</script>
<template>
  <button v-if="available" class="btn sm retry-run" :disabled="chat.retryingRun.value" @click="retry">
    <Icon :name="chat.retryingRun.value ? 'loader-circle' : 'refresh-cw'" />
    {{ tr('从断点重试', 'Retry from checkpoint') }}
  </button>
</template>
<style scoped>
.retry-run {
  display: flex;
  margin: 12px 0 0 auto;
  color: var(--err);
  background: transparent;
  border-color: var(--err-border);
}
@media (hover: hover) {
  .retry-run:hover:not(:disabled) {
    background: color-mix(in srgb, var(--err) 10%, transparent);
  }
}
.retry-run:focus-visible {
  outline: 2px solid var(--err);
  outline-offset: 2px;
}
</style>

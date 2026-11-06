<script setup lang="ts">
import { computed } from 'vue';
import { chat } from '../../core/state/chatSlice.ts';
import { tr } from '../../core/i18n/tr.ts';
import { showError } from '../../ui/errorDialog.ts';
import RunRetryButton from '../../domain/chat/RunRetryButton.vue';
const props = defineProps<{ session: string; sequence?: number }>();
const available = computed(() => {
  const snapshot = chat.snapshot.value;
  if (snapshot?.id !== props.session || snapshot.running || chat.stream.value.active) return false;
  // Suspended.outcome references an event ID, not its history sequence.
  const outcomeId = snapshot.status?.state?.Suspended?.outcome;
  if (outcomeId == null) return false;
  const outcome = chat.entries.value.find((entry) => entry.event_id === outcomeId);
  const failure = outcome?.payload.failure;
  // A user-requested run may retry any failed outcome, independently of automatic retry policy.
  if (!failure) return false;
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
  <RunRetryButton v-if="available" :busy="chat.retryingRun.value" @retry="retry" />
</template>

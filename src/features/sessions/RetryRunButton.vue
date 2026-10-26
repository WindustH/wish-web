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
  const failure = snapshot.last_error;
  if (!failure || !/transport|streamfailed/i.test(failure.family)) return false;
  const latest = chat.entries.value.findLast(entry => entry.kind === 'run_error');
  return props.sequence == null || latest?.seq === props.sequence;
});
async function retry() {
  try { await chat.retryRun(props.session); }
  catch (error) { showError({title: tr('重试失败', 'Retry failed'), error}); }
}
</script>
<template>
  <button v-if="available" class="btn ghost sm retry-run" :disabled="chat.retryingRun.value" @click="retry">
    <Icon :name="chat.retryingRun.value ? 'loader-circle' : 'refresh-cw'" />
    {{ tr('从断点重试', 'Retry from checkpoint') }}
  </button>
</template>
<style scoped>
.retry-run { display:flex; margin-top:10px; }
</style>

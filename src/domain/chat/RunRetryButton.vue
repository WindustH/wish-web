<script setup lang="ts">
import { tr } from '../../core/i18n/tr.ts';
import Icon from '../../ui/components/Icon.vue';
defineProps<{ busy?: boolean }>();
defineEmits<{ retry: [] }>();
</script>
<template>
  <button type="button" class="btn sm retry-run" :disabled="busy" :aria-busy="busy" @click="$emit('retry')">
    <Icon :name="busy ? 'loader-circle' : 'refresh-cw'" :class="{ 'work-spinner': busy }" />
    {{ busy ? tr('正在重试…', 'Retrying…') : tr('从断点重试', 'Retry from checkpoint') }}
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

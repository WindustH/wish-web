<script setup lang="ts">
import Icon from './Icon.vue';
defineProps<{ label: string; variant?: 'center' | 'overlay' | 'inline' }>();
</script>
<template>
  <div class="loading-state" :class="variant || 'center'" role="status" aria-busy="true">
    <Icon v-if="!variant || variant === 'center'" name="loader-circle" class="spin" />
    <span>{{ label }}</span>
  </div>
</template>
<style scoped>
.loading-state {
  color: var(--fg-muted);
}
.center {
  margin: auto;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 12px;
  padding: 24px;
  text-align: center;
}
.overlay {
  position: absolute;
  top: 40px;
  left: 12px;
  z-index: 1;
  background: var(--bg);
  padding: 4px 8px;
  border-radius: 6px;
}
.inline {
  padding: 12px;
  margin-block: 1em;
  font-size: 13px;
}
@media (prefers-reduced-motion: reduce) {
  .spin {
    animation: none;
  }
}
</style>

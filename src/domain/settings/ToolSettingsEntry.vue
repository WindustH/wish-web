<script setup lang="ts">
import Icon from '../../ui/components/Icon.vue';

defineProps<{ title: string; icon: string; disabled?: boolean }>();
</script>

<template>
  <button type="button" class="set-row inline tool-settings-entry" :disabled="disabled" aria-haspopup="dialog">
    <span class="settings-link-label"><Icon :name="icon" />{{ title }}</span>
    <Icon name="chevron-right" class="tool-settings-chevron" />
  </button>
</template>

<style scoped>
.tool-settings-entry {
  grid-template-columns: minmax(0, 1fr) auto;
  width: 100%;
  border: 0;
  background-color: transparent;
  color: var(--fg);
  font: inherit;
  text-align: start;
  cursor: pointer;
}
.tool-settings-entry:disabled {
  opacity: 0.55;
  cursor: default;
}
.tool-settings-entry:focus-visible {
  outline-offset: -3px;
}
.tool-settings-chevron {
  width: 16px;
  height: 16px;
  color: var(--fg-subtle);
}
@media (max-width: 899px) {
  .tool-settings-entry {
    background-color: var(--bg-group);
  }
}
@media (hover: hover) {
  .tool-settings-entry:not(:disabled):hover {
    background-color: var(--bg-hover);
  }
}
</style>

<script setup lang="ts">
import { computed } from 'vue';

const props = defineProps<{ label: string }>();
const parts = computed(() => props.label.split(/( \+ | \/ )/).filter(Boolean));
</script>

<template>
  <span class="keycaps">
    <template v-for="(part, index) in parts" :key="index">
      <span v-if="part === ' + ' || part === ' / '" class="key-separator">{{ part }}</span>
      <kbd v-else class="keycap">{{ part === 'Escape' ? 'Esc' : part }}</kbd>
    </template>
  </span>
</template>

<style scoped>
.keycaps {
  display: inline-flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: flex-end;
  gap: 4px;
  font: 12px/1 var(--mono);
}
.keycap {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-width: 28px;
  height: 30px;
  padding: 0 8px;
  border: 1px solid var(--line-strong);
  border-bottom-width: 3px;
  border-radius: 6px;
  background: linear-gradient(var(--bg-overlay), var(--bg-raised));
  box-shadow: inset 0 1px 0 rgb(255 255 255 / 5%);
  color: var(--fg);
  font: inherit;
  white-space: nowrap;
}
.key-separator {
  color: var(--fg-subtle);
  font-size: 10px;
  white-space: pre;
}
</style>

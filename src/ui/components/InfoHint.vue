<script setup lang="ts">
import Icon from './Icon.vue';
import Hint from './Hint.vue';
defineProps<{ text: string; label: string; focusable?: boolean }>();
</script>

<template>
  <Hint :text="text">
    <span class="info-hint" :tabindex="focusable === false ? undefined : 0" role="img" :aria-label="label"><Icon name="info" :size="15" /></span>
  </Hint>
</template>

<style scoped>
.info-hint { display: inline-flex; align-items: center; justify-content: center; padding: 6px; color: var(--fg-subtle); cursor: help; vertical-align: middle; }
.info-hint:focus-visible { color: var(--fg); }
@media (hover: hover) { .info-hint:hover { color: var(--fg); } }
.info-hint:focus-visible { outline: none; }
</style>

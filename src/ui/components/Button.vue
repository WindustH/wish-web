<script setup lang="ts">
defineProps<{ variant?: 'primary' | 'ghost'; disabled?: boolean; title?: string }>();
</script>

<template>
  <button class="btn" :class="variant" :disabled="disabled" :title="title">
    <slot />
  </button>
</template>

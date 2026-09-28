<script setup lang="ts">
// One of Wish's own icons (ui/icons.ts), drawn in the current text colour. Brand logos are
// ProviderIcon's.
import { computed } from 'vue';
import { ICONS } from '../icons.ts';

const props = defineProps<{ name: string; size?: number }>();
const markup = computed(() => ICONS[props.name]);
const style = computed(() => props.size ? { width: `${props.size}px`, height: `${props.size}px` } : undefined);
</script>

<template>
  <svg v-if="markup" class="icon" :style="style" viewBox="0 0 24 24" fill="none" stroke="currentColor"
    stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false" v-html="markup" />
</template>

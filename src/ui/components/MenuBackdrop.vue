<script setup lang="ts">
// Outside presses close the menu; only their trailing click is consumed. The backdrop
// disappears with the menu instead of blocking subsequent gestures for a fixed delay.
import { consumeDismissalClick } from '../consumeDismissalClick.ts';
defineProps<{ open: boolean }>();
const emit = defineEmits<{ close: [] }>();
function dismiss(event: PointerEvent | MouseEvent) {
  consumeDismissalClick(window, 'pointerId' in event ? event.pointerId : undefined);
  emit('close');
}
</script>

<template>
  <Teleport to="body">
    <div
      v-if="open"
      class="menu-backdrop"
      aria-hidden="true"
      @pointerdown.prevent="dismiss"
      @contextmenu.prevent="dismiss"
      @wheel.passive="emit('close')"
    />
  </Teleport>
</template>

<style>
.menu-backdrop {
  position: fixed;
  inset: 0;
  z-index: 69;
  touch-action: none;
}
</style>

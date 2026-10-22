<script setup lang="ts">
// A clear layer behind an open menu and over everything else. A touch, click, right click or wheel
// anywhere outside the menu lands here and only closes it: nothing under it reacts, one menu never
// opens over another, and it works where reka-ui's own outside detection cannot (it waits for a
// click, which iOS never sends for a tap on a plain area). The layer stays until the press that
// closed the menu has ended, so that press cannot reach what the menu covered either.
import { onBeforeUnmount, ref, watch } from 'vue';

const props = defineProps<{ open: boolean }>();
const emit = defineEmits<{ close: [] }>();
const up = ref(false);
let pressing = false;
let timer: ReturnType<typeof setTimeout> | undefined;
// A pointer can leave the browser (or lose its up/cancel on a page switch). Never leave
// an invisible, full-screen backdrop over the conversation waiting for that event.
const MAX_PRESS_MS = 1500;
function clearTimer() { clearTimeout(timer); timer = undefined; }
watch(() => props.open, open => {
  clearTimer();
  if (open) up.value = true;
  else if (!pressing) up.value = false;
  else timer = setTimeout(() => { pressing = false; if (!props.open) up.value = false; }, MAX_PRESS_MS);
}, { immediate: true });
function press() {
  pressing = true;
  emit('close');
  // The close watcher normally arms this. Also cover a parent that closes
  // asynchronously or refuses to close while the pointer has gone away.
  clearTimer();
  timer = setTimeout(() => { pressing = false; if (!props.open) up.value = false; }, MAX_PRESS_MS);
}
// The click that ends the press comes right after it is released, and lands here too.
function release() {
  pressing = false;
  clearTimer();
  timer = setTimeout(() => { if (!props.open) up.value = false; }, 250);
}
function clicked() {
  clearTimer();
  if (!props.open) up.value = false;
}
function lostFocus() { if (pressing) release(); }
window.addEventListener('blur', lostFocus);
onBeforeUnmount(() => { window.removeEventListener('blur', lostFocus); clearTimer(); });
</script>

<template>
  <Teleport to="body">
    <div v-if="up" class="menu-backdrop" aria-hidden="true" @pointerdown.prevent="press" @pointerup="release"
      @pointercancel="release" @click="clicked" @contextmenu.prevent="press(); release()" @wheel.passive="emit('close')" />
  </Teleport>
</template>

<style>
.menu-backdrop { position: fixed; inset: 0; z-index: 69; touch-action: none; }
</style>

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
watch(() => props.open, open => {
  clearTimeout(timer);
  if (open) up.value = true;
  else if (!pressing) up.value = false;
}, { immediate: true });
function press() {
  pressing = true;
  emit('close');
}
// The click that ends the press comes right after it is released, and lands here too.
function release() {
  pressing = false;
  clearTimeout(timer);
  timer = setTimeout(() => { if (!props.open) up.value = false; }, 250);
}
function clicked() {
  clearTimeout(timer);
  if (!props.open) up.value = false;
}
onBeforeUnmount(() => clearTimeout(timer));
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

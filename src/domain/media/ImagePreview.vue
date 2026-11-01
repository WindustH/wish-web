<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue';
import { i18n } from '../../core/i18n/index.ts';
import { usePageActivity } from '../../ui/composables/usePageActivity.ts';
import Icon from '../../ui/components/Icon.vue';

defineProps<{ src: string; alt: string }>();
const emit = defineEmits<{ error: [] }>();
const surface = ref<HTMLElement>(),
  picture = ref<HTMLImageElement>();
const zoom = ref(1),
  x = ref(0),
  y = ref(0);
const style = computed(() => ({ transform: `translate(${x.value}px, ${y.value}px) scale(${zoom.value})` }));
function clamp() {
  const image = picture.value,
    box = surface.value;
  if (!image || !box || !box.clientWidth || !box.clientHeight) return;
  const maxX = Math.max(0, (image.offsetWidth * zoom.value - box.clientWidth) / 2);
  const maxY = Math.max(0, (image.offsetHeight * zoom.value - box.clientHeight) / 2);
  x.value = Math.max(-maxX, Math.min(maxX, x.value));
  y.value = Math.max(-maxY, Math.min(maxY, y.value));
}
function scale(next: number) {
  zoom.value = Math.max(1, Math.min(8, next));
  clamp();
}
function wheel(event: WheelEvent) {
  event.preventDefault();
  scale(zoom.value * Math.exp(-event.deltaY * (event.deltaMode === 1 ? 0.05 : 0.002)));
}
let drag: { id: number; x: number; y: number; target: HTMLElement } | undefined;
function start(event: PointerEvent) {
  if (event.button !== 0 || zoom.value <= 1) return;
  event.preventDefault();
  const target = event.currentTarget as HTMLElement;
  target.setPointerCapture(event.pointerId);
  drag = { id: event.pointerId, x: event.clientX, y: event.clientY, target };
}
function move(event: PointerEvent) {
  if (!drag || drag.id !== event.pointerId) return;
  x.value += event.clientX - drag.x;
  y.value += event.clientY - drag.y;
  drag.x = event.clientX;
  drag.y = event.clientY;
  clamp();
}
function stop() {
  const previous = drag;
  drag = undefined;
  if (previous?.target.hasPointerCapture(previous.id)) previous.target.releasePointerCapture(previous.id);
}
watch(usePageActivity(), (active) => {
  if (!active) stop();
});
let observer: ResizeObserver | undefined;
onMounted(() => {
  observer = new ResizeObserver(clamp);
  if (surface.value) observer.observe(surface.value);
});
onBeforeUnmount(() => {
  stop();
  observer?.disconnect();
});
</script>

<template>
  <div class="image-preview">
    <div class="image-toolbar">
      <button
        class="btn ghost icon-only"
        :aria-label="i18n.t('library.zoomOut')"
        :disabled="zoom <= 1"
        @click="scale(zoom / 1.25)"
      >
        <Icon name="minus" />
      </button>
      <button class="btn ghost sm" @click="scale(1)">{{ Math.round(zoom * 100) }}%</button>
      <button
        class="btn ghost icon-only"
        :aria-label="i18n.t('library.zoomIn')"
        :disabled="zoom >= 8"
        @click="scale(zoom * 1.25)"
      >
        <Icon name="plus" />
      </button>
    </div>
    <div
      ref="surface"
      class="image-viewport"
      :class="{ zoomed: zoom > 1 }"
      @wheel="wheel"
      @pointerdown="start"
      @pointermove="move"
      @pointerup="stop"
      @pointercancel="stop"
      @lostpointercapture="stop"
      @dblclick="scale(1)"
    >
      <img ref="picture" :src="src" :alt="alt" :style="style" draggable="false" @load="clamp" @error="emit('error')" />
    </div>
  </div>
</template>

<style scoped>
.image-preview {
  display: flex;
  flex-direction: column;
  flex: 1;
  min-width: 0;
  min-height: 0;
  height: 100%;
}
.image-toolbar {
  display: flex;
  justify-content: center;
  flex: none;
}
.image-viewport {
  display: flex;
  align-items: center;
  justify-content: center;
  flex: 1;
  min-height: 0;
  overflow: hidden;
  touch-action: none;
}
.image-viewport.zoomed {
  cursor: grab;
}
.image-viewport.zoomed:active {
  cursor: grabbing;
}
img {
  display: block;
  max-width: 100%;
  max-height: 100%;
  object-fit: contain;
  user-select: none;
}
</style>

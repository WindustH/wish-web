<script setup lang="ts">
import { tr } from '../../core/i18n/tr.ts';
import RegionSelection from './RegionSelection.vue';
import type { ReplyReference } from '../../core/replyReferences.ts';
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue';
import { i18n } from '../../core/i18n/index.ts';
import { usePageActivity } from '../../ui/composables/usePageActivity.ts';
import { useWorkspaceState } from '../../ui/composables/useWorkspaceState.ts';
import { zoomAt } from './imageTransform.ts';
import { usePinchZoom } from '../../ui/composables/usePinchZoom.ts';
import Icon from '../../ui/components/Icon.vue';

const props = defineProps<{
  src: string;
  alt: string;
  stateKey: string;
  reference?: { session: string; blob: string };
  focus?: ReplyReference;
  toolbar?: HTMLElement;
}>();
const saved = useWorkspaceState('image', () => props.stateKey, { zoom: 1, x: 0, y: 0 });
const emit = defineEmits<{ error: [] }>();
const surface = ref<HTMLElement>(),
  picture = ref<HTMLImageElement>();
const zoom = ref(Math.max(1, Math.min(8, saved.value.zoom))),
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
function remember() {
  const image = picture.value;
  if (!image?.offsetWidth || !image.offsetHeight || !surface.value?.clientHeight) return;
  saved.value = { zoom: zoom.value, x: x.value / image.offsetWidth, y: y.value / image.offsetHeight };
}
function loaded() {
  x.value = saved.value.x * (picture.value?.offsetWidth ?? 0);
  y.value = saved.value.y * (picture.value?.offsetHeight ?? 0);
  clamp();
}
function scale(next: number, anchorX = 0, anchorY = 0) {
  const value = zoomAt(zoom.value, x.value, y.value, next, anchorX, anchorY);
  zoom.value = value.zoom;
  x.value = value.x;
  y.value = value.y;
  clamp();
  remember();
}
function wheel(event: WheelEvent) {
  event.preventDefault();
  const bounds = surface.value?.getBoundingClientRect();
  if (!bounds) return;
  scale(
    zoom.value * Math.exp(-event.deltaY * (event.deltaMode === 1 ? 0.05 : 0.002)),
    event.clientX - bounds.left - bounds.width / 2,
    event.clientY - bounds.top - bounds.height / 2,
  );
}
let drag: { id: number; x: number; y: number; target: HTMLElement } | undefined;
function start(event: PointerEvent) {
  if (
    !event.isPrimary ||
    pinching.value ||
    zoom.value <= 1 ||
    (props.reference && event.pointerType === 'mouse'
      ? event.button !== 1 && !(event.button === 0 && event.shiftKey)
      : event.button !== 0 && event.button !== 1)
  )
    return;
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
  remember();
}
function stop() {
  const previous = drag;
  drag = undefined;
  if (previous?.target.hasPointerCapture(previous.id)) previous.target.releasePointerCapture(previous.id);
}
const pinching = usePinchZoom(
  surface,
  (ratio, from, to) => {
    const box = surface.value!.getBoundingClientRect();
    scale(zoom.value * ratio, from.x - box.left - box.width / 2, from.y - box.top - box.height / 2);
    x.value += to.x - from.x;
    y.value += to.y - from.y;
    clamp();
    remember();
  },
  stop,
);
watch(usePageActivity(), (active) => {
  if (!active) stop();
});
let observer: ResizeObserver | undefined;
onMounted(() => {
  observer = new ResizeObserver(loaded);
  if (surface.value) observer.observe(surface.value);
});
onBeforeUnmount(() => {
  stop();
  observer?.disconnect();
});
</script>

<template>
  <div class="image-preview">
    <Teleport :to="toolbar ?? 'body'" :disabled="!toolbar">
      <div class="image-toolbar">
        <button
          class="btn ghost icon-only"
          :aria-label="i18n.t('library.zoomOut')"
          :disabled="zoom <= 1"
          @click="scale(zoom / 1.25)"
        >
          <Icon name="minus" />
        </button>
        <button class="btn ghost sm" :title="tr('恢复为适合窗口', 'Reset to fit view')" @click="scale(1)">
          {{ Math.round(zoom * 100) }}%
        </button>
        <button
          class="btn ghost icon-only"
          :aria-label="i18n.t('library.zoomIn')"
          :disabled="zoom >= 8"
          @click="scale(zoom * 1.25)"
        >
          <Icon name="plus" />
        </button>
      </div>
    </Teleport>
    <div
      ref="surface"
      class="image-viewport"
      :class="{ zoomed: zoom > 1, selecting: !!reference }"
      @wheel="wheel"
      @pointerdown="start"
      @pointermove="move"
      @pointerup="stop"
      @pointercancel="stop"
      @lostpointercapture="stop"
      @dblclick="scale(1)"
    >
      <img
        crossorigin="anonymous"
        ref="picture"
        :src="src"
        :alt="alt"
        :style="style"
        draggable="false"
        @load="loaded"
        @error="emit('error')"
      />
    </div>
    <RegionSelection
      v-if="reference"
      :target="picture"
      :session="reference.session"
      :blob="reference.blob"
      :name="alt"
      :focus="focus"
      @selecting="(selecting) => selecting && stop()"
    />
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
.image-viewport.selecting {
  cursor: crosshair;
}
img {
  display: block;
  max-width: 100%;
  max-height: 100%;
  object-fit: contain;
  user-select: none;
}
</style>

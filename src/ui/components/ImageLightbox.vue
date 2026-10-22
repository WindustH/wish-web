<script setup lang="ts">
// The image, whole: as large as the window allows, on a dimmed page. The wheel zooms in on the
// point the pointer is over, a drag moves the magnified picture, a double click or the zoom-out
// button puts it back; a click on the dimmed page or Escape closes it at any size.
import { computed, nextTick, ref, watch } from 'vue';
import Icon from './Icon.vue';
import { closeImageLightbox, imageLightbox } from '../imageLightbox.ts';
import { tr } from '../../core/i18n/tr.ts';

const MAX_SCALE = 8;
const step = 1.25;
const frame = ref<HTMLElement | null>(null);
const closeButton = ref<HTMLElement | null>(null);
const scale = ref(1);
const x = ref(0);
const y = ref(0);
let returnTo: HTMLElement | null = null;

const clamp = (value: number, low: number, high: number) => Math.min(high, Math.max(low, value));
// Zooming keeps the point under the pointer where it is, so the detail looked at does not run
// away from the cursor. Without a pointer, the middle of the frame is the anchor.
function zoomTo(next: number, clientX?: number, clientY?: number) {
  const target = clamp(next, 1, MAX_SCALE);
  if (target === scale.value) return;
  const box = frame.value?.getBoundingClientRect();
  if (box && clientX != null && clientY != null) {
    const ax = clientX - (box.left + box.width / 2);
    const ay = clientY - (box.top + box.height / 2);
    const ratio = target / scale.value;
    x.value = ax - (ax - x.value) * ratio;
    y.value = ay - (ay - y.value) * ratio;
  }
  scale.value = target;
  if (target === 1) { x.value = 0; y.value = 0; }
}
const zoomed = computed(() => scale.value > 1);
function onWheel(event: WheelEvent) {
  event.preventDefault();
  // Wheel, trackpad scroll and trackpad pinch (ctrl+wheel) all read the same way: up is bigger.
  const factor = Math.exp(-event.deltaY * (event.ctrlKey ? 0.01 : 0.0022));
  zoomTo(scale.value * factor, event.clientX, event.clientY);
}

// A drag moves the magnified picture; at its own size the picture takes no drag, so the page under
// a click closes the overlay.
let dragging = false;
let dragId: number | null = null;
let from = { x: 0, y: 0 };
let origin = { x: 0, y: 0 };
let moved = false;
function onPointerDown(event: PointerEvent) {
  if (!zoomed.value || event.button !== 0 || event.pointerType !== 'mouse') return;
  dragging = true;
  moved = false;
  dragId = event.pointerId;
  from = { x: event.clientX, y: event.clientY };
  origin = { x: x.value, y: y.value };
  (event.currentTarget as HTMLElement).setPointerCapture?.(event.pointerId);
}
function onPointerMove(event: PointerEvent) {
  if (!dragging || event.pointerId !== dragId) return;
  const dx = event.clientX - from.x;
  const dy = event.clientY - from.y;
  if (Math.abs(dx) > 2 || Math.abs(dy) > 2) moved = true;
  x.value = origin.x + dx;
  y.value = origin.y + dy;
}
function onPointerUp(event: PointerEvent) {
  if (event.pointerId !== dragId) return;
  dragging = false;
  dragId = null;
  (event.currentTarget as HTMLElement).releasePointerCapture?.(event.pointerId);
}
// A click on the page closes; so does a click on a picture shown at its own size. A click on a
// magnified picture is a look, not a dismissal - Escape and the close button still close.
function onBackdrop(event: MouseEvent) {
  if (moved) { moved = false; return; }
  const target = event.target as HTMLElement | null;
  if (target?.closest?.('.image-lightbox-close, .image-lightbox-tools')) return;
  if (target !== event.currentTarget && scale.value > 1) return;
  closeImageLightbox();
}
function reset() { scale.value = 1; x.value = 0; y.value = 0; }

// Two fingers on a phone pinch, and the picture follows them: the distance between the fingers is
// the scale, their middle the point zoomed on.
const touches = new Map<number, { x: number; y: number }>();
let pinch = 0;
function onTouchStart(event: PointerEvent) {
  if (event.pointerType === 'mouse') return;
  touches.set(event.pointerId, { x: event.clientX, y: event.clientY });
  if (touches.size === 2) {
    const [a, b] = [...touches.values()];
    pinch = Math.hypot(a!.x - b!.x, a!.y - b!.y);
  }
}
function onTouchMove(event: PointerEvent) {
  if (event.pointerType === 'mouse' || !touches.has(event.pointerId)) return;
  touches.set(event.pointerId, { x: event.clientX, y: event.clientY });
  if (touches.size !== 2) return;
  const [a, b] = [...touches.values()];
  const distance = Math.hypot(a!.x - b!.x, a!.y - b!.y);
  if (pinch > 0 && distance > 0) zoomTo(scale.value * (distance / pinch), (a!.x + b!.x) / 2, (a!.y + b!.y) / 2);
  pinch = distance;
}
function onTouchEnd(event: PointerEvent) {
  touches.delete(event.pointerId);
  if (touches.size < 2) pinch = 0;
}

function onKey(event: KeyboardEvent) {
  if (event.key === 'Escape') { event.stopPropagation(); closeImageLightbox(); return; }
  if (event.key === '+' || event.key === '=') { event.preventDefault(); zoomTo(scale.value * step); }
  if (event.key === '-') { event.preventDefault(); zoomTo(scale.value / step); }
  if (event.key === '0') { event.preventDefault(); reset(); }
}

watch(imageLightbox, async (image, previous) => {
  reset();
  if (image) {
    returnTo = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    window.addEventListener('keydown', onKey, true);
    await nextTick();
    closeButton.value?.focus();
    return;
  }
  window.removeEventListener('keydown', onKey, true);
  touches.clear();
  pinch = 0;
  // Back to the picture, without the browser scrolling the log to bring it into view.
  if (previous) returnTo?.focus?.({ preventScroll: true });
  returnTo = null;
}, { immediate: true });
</script>

<template>
  <Teleport to="body">
    <div v-if="imageLightbox" ref="frame" class="image-lightbox" :class="{ zoomed }" role="dialog" aria-modal="true"
      :aria-label="imageLightbox.alt || tr('图片', 'Image')" @click="onBackdrop" @wheel="onWheel" @dblclick="reset"
      @pointerdown="onTouchStart" @pointermove="onTouchMove" @pointerup="onTouchEnd" @pointercancel="onTouchEnd">
      <img class="image-lightbox-img" :class="{ dragging }" :src="imageLightbox.src" :alt="imageLightbox.alt || ''"
        :style="{ transform: `translate(-50%, -50%) translate(${x}px, ${y}px) scale(${scale})` }"
        draggable="false" @pointerdown="onPointerDown" @pointermove="onPointerMove" @pointerup="onPointerUp" @pointercancel="onPointerUp" />
      <button ref="closeButton" type="button" class="btn ghost icon-only image-lightbox-close" :aria-label="tr('关闭', 'Close')" @click.stop="closeImageLightbox">
        <Icon name="x" />
      </button>
      <div class="image-lightbox-tools">
        <button type="button" class="btn ghost icon-only" :aria-label="tr('放大', 'Zoom in')" :disabled="scale >= MAX_SCALE" @click.stop="zoomTo(scale * step)">
          <Icon name="plus" />
        </button>
        <button type="button" class="btn ghost icon-only" :aria-label="tr('缩小', 'Zoom out')" :disabled="scale <= 1" @click.stop="zoomTo(scale / step)">
          <Icon name="minus" />
        </button>
      </div>
    </div>
  </Teleport>
</template>

<script setup lang="ts">
import { inject, ref, shallowRef, watch, onBeforeUnmount, computed } from 'vue';
import { replyContextKey } from '../references/context.ts';
import { usePageActivity } from '../../ui/composables/usePageActivity.ts';
import { tr } from '../../core/i18n/tr.ts';
import { toast } from '../../ui/toast.ts';
import Icon from '../../ui/components/Icon.vue';
import { replyReferenceId, type ReplyReference } from '../../core/replyReferences.ts';
const props = defineProps<{
  target?: HTMLImageElement | HTMLCanvasElement;
  session: string;
  blob: string;
  name: string;
  page?: number;
  dimensions?: { width: number; height: number };
  focus?: ReplyReference;
}>();
const emit = defineEmits<{ selecting: [active: boolean] }>();
const context = inject(replyContextKey, undefined);
const active = usePageActivity();
watch(active, (visible) => {
  if (!visible) clear();
});
const selection = shallowRef<{ x: number; y: number; width: number; height: number }>();
const bounds = shallowRef<DOMRect>();
const clip = shallowRef<{ left: number; top: number; width: number; height: number }>();
const innerWidth = ref(window.innerWidth),
  innerHeight = ref(window.innerHeight);
const dragging = ref(false),
  holding = ref(false),
  busy = ref(false);
type Press = { pointer: number; clientX: number; clientY: number; host: HTMLElement; touch: boolean };
let gesture: (Press & { x: number; y: number }) | undefined;
let pending: Press | undefined;
let holdTimer: ReturnType<typeof setTimeout> | undefined;
let quietUntil = 0;
let observer: ResizeObserver | undefined;
const enabled = computed(() => active.value && !!context && context.session.value === props.session);
const rect = computed(() => {
  const b = bounds.value,
    s = selection.value;
  if (!b || !s) return;
  return {
    left: b.left + s.x * b.width,
    top: b.top + s.y * b.height,
    width: s.width * b.width,
    height: s.height * b.height,
  };
});
function geometry() {
  innerWidth.value = window.innerWidth;
  innerHeight.value = window.innerHeight;
  const target = props.target;
  if (!target) return;
  bounds.value = target.getBoundingClientRect();
  let left = Math.max(0, bounds.value.left),
    top = Math.max(0, bounds.value.top),
    right = Math.min(window.innerWidth, bounds.value.right),
    bottom = Math.min(window.innerHeight, bounds.value.bottom);
  for (let el = target.parentElement; el; el = el.parentElement) {
    if (/hidden|auto|scroll|clip/.test(getComputedStyle(el).overflow)) {
      const b = el.getBoundingClientRect();
      left = Math.max(left, b.left);
      top = Math.max(top, b.top);
      right = Math.min(right, b.right);
      bottom = Math.min(bottom, b.bottom);
    }
  }
  clip.value = { left, top, width: Math.max(0, right - left), height: Math.max(0, bottom - top) };
}
function point(e: { clientX: number; clientY: number }) {
  const b = bounds.value!;
  return {
    x: Math.max(0, Math.min(1, (e.clientX - b.left) / b.width)),
    y: Math.max(0, Math.min(1, (e.clientY - b.top) / b.height)),
  };
}
function down(e: PointerEvent) {
  if (!enabled.value || busy.value || e.button !== 0 || e.shiftKey || !props.target || !e.isPrimary) return;
  quietUntil = 0;
  geometry();
  const b = bounds.value!;
  if (e.clientX < b.left || e.clientX > b.right || e.clientY < b.top || e.clientY > b.bottom) return;
  const press = {
    pointer: e.pointerId,
    clientX: e.clientX,
    clientY: e.clientY,
    host: e.currentTarget as HTMLElement,
    touch: e.pointerType === 'touch',
  };
  if (press.touch) {
    cancelHold();
    pending = press;
    holding.value = true;
    // Let a quick swipe scroll normally. Only a stationary hold takes over the gesture.
    holdTimer = setTimeout(() => {
      if (pending !== press || !enabled.value || busy.value) return;
      cancelHold();
      begin(press);
    }, 450);
  } else {
    e.preventDefault();
    e.stopPropagation();
    begin(press);
  }
}
function cancelHold() {
  holding.value = false;
  clearTimeout(holdTimer);
  holdTimer = undefined;
  pending = undefined;
}
function begin(press: Press) {
  geometry();
  const p = point(press);
  // Image panning must release its capture before selection takes ownership.
  emit('selecting', true);
  press.host.setPointerCapture(press.pointer);
  gesture = { ...press, ...p };
  selection.value = { ...p, width: 0, height: 0 };
  dragging.value = true;
  if (press.touch) quietUntil = Infinity;
}
function move(e: PointerEvent) {
  if (pending?.pointer === e.pointerId && Math.hypot(e.clientX - pending.clientX, e.clientY - pending.clientY) > 10)
    cancelHold();
  if (!gesture || gesture.pointer !== e.pointerId) return;
  e.preventDefault();
  e.stopPropagation();
  // A layout refresh may move the target while the pointer stays captured.
  bounds.value = props.target?.getBoundingClientRect();
  if (!bounds.value) return;
  const p = point(e),
    g = gesture;
  selection.value = {
    x: Math.min(p.x, g.x),
    y: Math.min(p.y, g.y),
    width: Math.abs(p.x - g.x),
    height: Math.abs(p.y - g.y),
  };
}
function release() {
  const g = gesture;
  gesture = undefined;
  dragging.value = false;
  if (g?.host.hasPointerCapture(g.pointer)) g.host.releasePointerCapture(g.pointer);
  if (g?.touch) quietUntil = performance.now() + 400;
  if (g) emit('selecting', false);
}
function up(e: PointerEvent) {
  if (pending?.pointer === e.pointerId) cancelHold();
  if (!gesture || gesture.pointer !== e.pointerId) return;
  move(e);
  release();
  if (!rect.value || rect.value.width < 6 || rect.value.height < 6) selection.value = undefined;
}
function clear() {
  cancelHold();
  release();
  selection.value = undefined;
}
function lostCapture(e: PointerEvent) {
  if (gesture?.pointer === e.pointerId && e.target === gesture.host) clear();
}
function touchMove(e: TouchEvent) {
  // touch-action cannot be changed after touchstart. Cancel the first native move
  // after the hold instead, keeping ordinary PDF scrolling and pinch zoom native.
  if (gesture?.touch && e.touches.length === 1) {
    e.preventDefault();
    e.stopPropagation();
  }
}
function contextMenu(e: Event) {
  if (pending?.touch || gesture?.touch || performance.now() < quietUntil) e.preventDefault();
}
function click(e: MouseEvent) {
  if (performance.now() < quietUntil) {
    e.preventDefault();
    e.stopPropagation();
  }
}
// Chat/history and task logs scroll independently of the media viewport.
// Only an ancestor of the selected media can change its screen coordinates.
function affectsTarget(event: Event) {
  const source = event.target;
  return (
    source === window || source === document || (source instanceof Element && source.contains(props.target ?? null))
  );
}
let geometryFrame = 0;
function scheduleGeometry() {
  if (!selection.value || geometryFrame) return;
  geometryFrame = requestAnimationFrame(() => {
    geometryFrame = 0;
    if (selection.value) geometry();
  });
}
function scroll(event: Event) {
  if (affectsTarget(event)) scheduleGeometry();
}
function wheel(event: WheelEvent) {
  if (affectsTarget(event) && !dragging.value) clear();
}
function key(e: KeyboardEvent) {
  if (e.key === 'Escape' && selection.value) {
    e.preventDefault();
    e.stopPropagation();
    clear();
  }
}
function outside(e: PointerEvent) {
  if (e.pointerType === 'touch' && !e.isPrimary) clear();
  if (!dragging.value && selection.value && !(e.target as Element)?.closest('.region-reply-menu')) clear();
}
async function reply() {
  const s = selection.value,
    target = props.target;
  if (!s || !target || !context) return;
  const owner = props.session;
  busy.value = true;
  try {
    const width = target instanceof HTMLImageElement ? target.naturalWidth : target.width;
    const height = target instanceof HTMLImageElement ? target.naturalHeight : target.height;
    const sw = s.width * width,
      sh = s.height * height,
      ratio = Math.min(1, 2048 / Math.max(sw, sh));
    const canvas = document.createElement('canvas');
    canvas.width = Math.max(1, Math.round(sw * ratio));
    canvas.height = Math.max(1, Math.round(sh * ratio));
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('Canvas unavailable');
    ctx.fillStyle = 'white';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(target, s.x * width, s.y * height, sw, sh, 0, 0, canvas.width, canvas.height);
    const image = await new Promise<Blob>((resolve, reject) =>
      canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('Image encoding failed'))), 'image/jpeg', 0.9),
    );
    const dimensions = props.dimensions ?? { width, height };
    const round = (v: number) => Math.round(v * 100) / 100;
    const reference: ReplyReference = {
      id: replyReferenceId(),
      session: owner,
      source: `blob_${props.blob}`,
      blob: props.blob,
      fileName: props.name,
      page: props.page,
      label: props.name + (props.page ? ` · ${tr('第', 'p. ')}${props.page}${tr('页', '')}` : ''),
      text: '',
      region: {
        x: round(s.x * dimensions.width),
        y: round(s.y * dimensions.height),
        width: round(s.width * dimensions.width),
        height: round(s.height * dimensions.height),
        sourceWidth: dimensions.width,
        sourceHeight: dimensions.height,
        unit: props.page ? 'pt' : 'px',
      },
    };
    if (owner === context.session.value) {
      await context.add(reference, image);
      clear();
    }
  } catch (error) {
    toast(tr('无法引用选区：', 'Could not reference selection: ') + String(error));
  } finally {
    busy.value = false;
  }
}
watch(
  [() => props.target, enabled],
  ([target, enabled], _, cleanup) => {
    clear();
    const host = target?.parentElement;
    if (!host || !enabled) return;
    host.classList.add('region-selectable');
    host.addEventListener('pointerdown', down, true);
    host.addEventListener('pointermove', move, true);
    host.addEventListener('pointerup', up, true);
    host.addEventListener('pointercancel', clear, true);
    host.addEventListener('lostpointercapture', lostCapture, true);
    host.addEventListener('touchmove', touchMove, { capture: true, passive: false });
    host.addEventListener('contextmenu', contextMenu, true);
    host.addEventListener('click', click, true);
    observer = new ResizeObserver(() => {
      if (selection.value) geometry();
    });
    observer.observe(target!);
    cleanup(() => {
      clear();
      observer?.disconnect();
      host.classList.remove('region-selectable');
      host.removeEventListener('pointerdown', down, true);
      host.removeEventListener('pointermove', move, true);
      host.removeEventListener('pointerup', up, true);
      host.removeEventListener('pointercancel', clear, true);
      host.removeEventListener('lostpointercapture', lostCapture, true);
      host.removeEventListener('touchmove', touchMove, true);
      host.removeEventListener('contextmenu', contextMenu, true);
      host.removeEventListener('click', click, true);
    });
  },
  { immediate: true },
);
watch(
  [() => props.focus, () => props.target],
  (_, __, cleanup) => {
    const region = props.focus?.region,
      target = props.target;
    if (!region || !target || props.focus?.page !== props.page) return;
    // Let page navigation/scroll anchoring settle before restoring the source rectangle.
    const timer = setTimeout(() => {
      if (!active.value || !target.isConnected) return;
      geometry();
      selection.value = {
        x: region.x / region.sourceWidth,
        y: region.y / region.sourceHeight,
        width: region.width / region.sourceWidth,
        height: region.height / region.sourceHeight,
      };
    }, 200);
    cleanup(() => clearTimeout(timer));
  },
  { flush: 'post' },
);
// In a virtual PDF only the page with a gesture/selection needs global observers.
watch(
  () => enabled.value && (!!selection.value || dragging.value || holding.value),
  (tracking, _, cleanup) => {
    if (!tracking) return;
    window.addEventListener('keydown', key, true);
    window.addEventListener('pointerdown', outside, true);
    window.addEventListener('scroll', scroll, true);
    window.addEventListener('resize', scheduleGeometry);
    window.addEventListener('blur', clear);
    window.addEventListener('wheel', wheel, { passive: true });
    cleanup(() => {
      window.removeEventListener('keydown', key, true);
      window.removeEventListener('pointerdown', outside, true);
      window.removeEventListener('scroll', scroll, true);
      window.removeEventListener('resize', scheduleGeometry);
      window.removeEventListener('blur', clear);
      window.removeEventListener('wheel', wheel);
    });
  },
  { flush: 'sync' },
);
onBeforeUnmount(() => {
  clear();
  observer?.disconnect();
  cancelAnimationFrame(geometryFrame);
});
const mask = computed(() => {
  const c = clip.value,
    r = rect.value;
  if (!c || !r) return '';
  const x = r.left - c.left,
    y = r.top - c.top;
  return `M0 0H${c.width}V${c.height}H0Z M${x} ${y}h${r.width}v${r.height}h${-r.width}Z`;
});
</script>
<template>
  <Teleport to="body">
    <svg
      v-if="selection && clip && rect"
      class="region-selection-mask"
      :style="{ left: `${clip.left}px`, top: `${clip.top}px`, width: `${clip.width}px`, height: `${clip.height}px` }"
      aria-hidden="true"
    >
      <path :d="mask" fill="rgb(0 0 0 / 48%)" fill-rule="evenodd" />
      <rect
        :x="rect.left - clip.left"
        :y="rect.top - clip.top"
        :width="rect.width"
        :height="rect.height"
        fill="none"
        stroke="var(--accent)"
        stroke-width="2"
      />
    </svg>
    <div
      v-if="selection && rect && !dragging"
      class="region-reply-menu"
      role="menu"
      :style="{
        left: `${Math.max(8, Math.min(innerWidth - 170, rect.left))}px`,
        top: `${Math.max(8, Math.min(innerHeight - 52, rect.top + rect.height + 8))}px`,
      }"
    >
      <button class="btn ghost" role="menuitem" :disabled="busy" @click="reply">
        <Icon name="reply" />{{ tr('回复', 'Reply') }}
      </button>
      <button class="btn ghost icon-only" :aria-label="tr('取消选区', 'Cancel selection')" @click="clear">
        <Icon name="x" />
      </button>
    </div>
  </Teleport>
</template>
<style>
@media (pointer: coarse) {
  .region-selectable,
  .region-selectable * {
    -webkit-touch-callout: none;
    user-select: none !important;
  }
}
</style>
<style scoped>
.region-selection-mask {
  position: fixed;
  z-index: 74;
  pointer-events: none;
  overflow: hidden;
}
.region-reply-menu {
  position: fixed;
  z-index: 76;
  display: flex;
  gap: 4px;
  padding: 4px;
  background: var(--bg-raised);
  color: var(--fg);
  border: 1px solid var(--line-strong);
  border-radius: 10px;
  box-shadow: 0 6px 20px #0003;
}
</style>

<script setup lang="ts">
import { DialogRoot, DialogContent, DialogOverlay, DialogTitle } from 'reka-ui';
import { computed, onMounted, onBeforeUnmount, provide, ref, watch } from 'vue';
import { sidebarResizingKey } from '../composables/useSidebarResize.ts';
import { i18n } from '../../core/i18n/index.ts';
import { tr } from '../../core/i18n/tr.ts';
import { useDialogFocus } from '../composables/useDialogFocus.ts';
import { useSheetDrag } from '../composables/useSheetDrag.ts';
import { useSheetExpansion } from '../composables/useSheetExpansion.ts';
import Icon from './Icon.vue';

const props = withDefaults(
  defineProps<{ title: string; overlay?: boolean; open: boolean; retainContent?: boolean }>(),
  { retainContent: true },
);
const emit = defineEmits<{ close: []; back: [] }>();
const focus = useDialogFocus();
const resizing = ref(false);
provide(sidebarResizingKey, resizing);
const heading = ref<HTMLElement>();
const sheet = useSheetExpansion(
  () => heading.value?.parentElement,
  () => !!props.overlay && props.open,
  () => emit('close'),
);
useSheetDrag(
  () => (props.overlay && props.open ? heading.value?.parentElement : null),
  () => !!props.overlay && props.open,
  () => emit('close'),
);
// A nested touch picker can retarget its compatibility click to this scrim.
let pressTarget: EventTarget | null = null;
function rememberPress(event: PointerEvent) {
  pressTarget = event.target;
}
function closeFromScrim(event: MouseEvent) {
  if (event.target === event.currentTarget && pressTarget === event.currentTarget) emit('close');
  pressTarget = null;
}
const preferredWidth = defineModel<number>('width', { default: 0 });
const available = ref(window.innerWidth);
const minimum = 280;
// Preserve a readable conversation when a wide session list or a tablet leaves
// too little room for two docked panels. Measure the workspace, not the screen.
const drawer = computed(() => !props.overlay && available.value < 800);
const modal = computed(() => !!props.overlay || drawer.value);
const maximum = computed(() =>
  modal.value ? Math.min(460, available.value) : Math.max(minimum, available.value - 480),
);
const width = computed(() =>
  Math.round(
    Math.min(
      maximum.value,
      Math.max(minimum, preferredWidth.value || Math.min(460, Math.max(320, window.innerWidth * 0.34))),
    ),
  ),
);
let observer: ResizeObserver | undefined;
let measureFrame = 0;
let drag: { id: number; x: number; width: number; preferred: number; target: HTMLElement } | undefined;
function finishResize(commit = false) {
  if (!drag) return;
  const previous = drag;
  drag = undefined;
  resizing.value = false;
  previous.target.classList.remove('is-resizing');
  document.documentElement.classList.remove('resizing');
  if (previous.target.hasPointerCapture(previous.id)) previous.target.releasePointerCapture(previous.id);
  if (!commit) preferredWidth.value = previous.preferred;
}
function onResizeStart(event: PointerEvent) {
  if (event.button !== 0) return;
  finishResize();
  event.preventDefault();
  const target = event.currentTarget as HTMLElement;
  target.focus({ preventScroll: true });
  target.setPointerCapture(event.pointerId);
  drag = { id: event.pointerId, x: event.clientX, width: width.value, preferred: preferredWidth.value, target };
  resizing.value = true;
  document.documentElement.classList.add('resizing');
  target.classList.add('is-resizing');
}
function onResizeMove(event: PointerEvent) {
  if (!drag || drag.id !== event.pointerId) return;
  preferredWidth.value = Math.round(Math.min(maximum.value, Math.max(minimum, drag.width + drag.x - event.clientX)));
}
function onResizeEnd(event: PointerEvent) {
  if (drag?.id !== event.pointerId) return;
  onResizeMove(event);
  finishResize(true);
}
function onResizeKeydown(event: KeyboardEvent) {
  const next = { ArrowLeft: width.value + 16, ArrowRight: width.value - 16, Home: minimum, End: maximum.value }[
    event.key
  ];
  if (next === undefined) return;
  event.preventDefault();
  finishResize();
  preferredWidth.value = Math.min(maximum.value, Math.max(minimum, next));
}
function cancelResize() {
  finishResize();
}
function observeContainer() {
  observer?.disconnect();
  cancelAnimationFrame(measureFrame);
  const container = heading.value?.parentElement?.parentElement;
  if (!container) return;
  available.value = container.clientWidth;
  observer = new ResizeObserver(() => {
    cancelAnimationFrame(measureFrame);
    measureFrame = requestAnimationFrame(() => {
      available.value = container.clientWidth;
    });
  });
  observer.observe(container);
}
watch(heading, observeContainer);
watch(modal, cancelResize);
watch(() => props.open, cancelResize);
onMounted(() => {
  observeContainer();
  window.addEventListener('pointerdown', rememberPress, true);
  window.addEventListener('blur', cancelResize);
});
onBeforeUnmount(() => {
  cancelResize();
  observer?.disconnect();
  cancelAnimationFrame(measureFrame);
  window.removeEventListener('blur', cancelResize);
  window.removeEventListener('pointerdown', rememberPress, true);
});
</script>

<template>
  <DialogRoot
    :modal="!!overlay"
    :open="open"
    :unmount-on-hide="retainContent === false"
    @update:open="!$event && emit('close')"
  >
    <DialogOverlay
      v-if="overlay"
      class="island-scrim"
      :class="{ 'island-sheet-scrim': overlay }"
      @click="closeFromScrim"
    />
    <Transition v-else name="island-scrim">
      <div v-if="drawer && open" class="island-scrim" aria-hidden="true" @click="closeFromScrim" />
    </Transition>
    <DialogContent
      :id="open ? 'session-sidebar' : undefined"
      class="island-sidebar"
      :class="{
        'island-overlay': modal,
        'island-drawer': drawer,
        'island-sheet': overlay,
        'island-sheet-expanded': overlay && sheet.expanded.value,
        'island-sheet-sizing': sheet.dragging.value,
      }"
      :style="{
        flexBasis: !modal ? `${width}px` : undefined,
        '--sidebar-width': `${width}px`,
        height: overlay && sheet.height.value !== undefined ? `${sheet.height.value}px` : undefined,
      }"
      :aria-describedby="undefined"
      :disable-outside-pointer-events="false"
      @open-auto-focus="focus.opened"
      @close-auto-focus="focus.closed"
      @interact-outside.prevent
      @escape-key-down.prevent="emit('back')"
    >
      <button
        v-if="overlay"
        type="button"
        class="island-sheet-handle"
        data-sheet-drag-ignore
        :aria-label="sheet.expanded.value ? tr('收回面板', 'Collapse panel') : tr('展开面板', 'Expand panel')"
        :aria-expanded="sheet.expanded.value"
        @pointerdown="sheet.start"
        @pointermove="sheet.move"
        @pointerup="sheet.end"
        @pointercancel="sheet.cancel"
        @lostpointercapture="sheet.cancel"
        @click="sheet.toggle"
        @keydown="sheet.keydown"
      />
      <div
        v-if="!modal"
        class="island-resize-handle"
        role="separator"
        tabindex="0"
        aria-orientation="vertical"
        :aria-label="i18n.t('sidebar.resize')"
        :aria-valuemin="minimum"
        :aria-valuemax="maximum"
        :aria-valuenow="width"
        @pointerdown="onResizeStart"
        @pointermove="onResizeMove"
        @pointerup="onResizeEnd"
        @pointercancel="cancelResize"
        @lostpointercapture="cancelResize"
        @keydown="onResizeKeydown"
      />
      <header ref="heading" class="island-heading">
        <slot name="leading" />
        <DialogTitle class="island-title"
          ><slot name="title">{{ title }}</slot></DialogTitle
        >
        <slot name="toolbar" />
        <div class="island-actions">
          <slot name="actions" />
          <button
            v-if="overlay"
            type="button"
            class="btn ghost icon-only island-close"
            :aria-label="i18n.t('common.close')"
            @click="emit('close')"
          >
            <Icon name="x" />
          </button>
        </div>
      </header>
      <div class="island-body"><slot /></div>
      <slot name="footer" />
    </DialogContent>
  </DialogRoot>
</template>

<style scoped>
.island-sidebar {
  position: relative;
  z-index: 20;
  flex: 0 0 clamp(320px, 34vw, 460px);
  min-width: 0;
  min-height: 0;
  display: flex;
  flex-direction: column;
  box-shadow: inset 1px 0 var(--line);
  background: var(--bg);
  overflow: hidden;
  outline: none;
}
.island-resize-handle {
  position: absolute;
  inset: 0 auto 0 0;
  width: 7px;
  z-index: 3;
  cursor: col-resize;
  touch-action: none;
  outline: none;
}
/* Match the session list divider: a wide invisible hit area, with only a
   one-pixel line gaining accent color on hover, onResizeKeydown focus, or drag. */
.island-resize-handle::after {
  content: '';
  position: absolute;
  inset-block: 0;
  left: 0;
  width: 1px;
  background: transparent;
  transition: background var(--dur-fast);
}
.island-resize-handle.is-resizing::after,
.island-resize-handle:focus-visible::after {
  background: var(--accent);
}
@media (hover: hover) {
  .island-resize-handle:hover::after {
    background: var(--accent);
  }
}
.island-heading {
  container-type: inline-size;
  flex: none;
  display: flex;
  align-items: center;
  gap: 6px;
  height: var(--h-topbar, 52px);
  min-height: var(--h-topbar, 52px);
  box-sizing: border-box;
  padding: 4px 12px;
}
.island-title {
  flex: 1;
  min-width: 0;
  margin: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font: 600 14px/1.5 var(--font);
}
.island-actions {
  display: flex;
  align-items: center;
}
.island-body {
  flex: 1;
  min-height: 0;
  display: flex;
  flex-direction: column;
}
.island-scrim {
  position: absolute;
  inset: 0;
  z-index: 19;
  background: var(--scrim);
}
.island-overlay {
  position: absolute;
  inset: 0;
  box-shadow: none;
}
.island-drawer {
  left: auto;
  width: min(var(--sidebar-width), 100%);
  box-shadow: -1px 0 var(--line);
}
.island-sheet-scrim {
  position: fixed;
}
.island-sheet {
  --sheet-max-height: calc(var(--viewport-height, 100dvh) - max(8px, env(safe-area-inset-top)));
  --sheet-compact-height: min(calc(var(--viewport-height, 100dvh) * 0.92), var(--sheet-max-height));
  position: fixed;
  inset: auto 0 var(--viewport-bottom, 0px);
  width: 100%;
  height: var(--sheet-compact-height);
  min-height: var(--sheet-compact-height);
  max-height: var(--sheet-max-height);
  padding-bottom: env(safe-area-inset-bottom);
  box-sizing: border-box;
  border-top: 1px solid var(--line);
  border-radius: 18px 18px 0 0;
  background: var(--bg-overlay);
}
.island-sheet-expanded {
  height: var(--sheet-max-height);
}
.island-sheet .island-heading {
  height: 44px;
  min-height: 44px;
  padding: 0 8px;
  gap: 4px;
}
html.keyboard-open .island-sheet {
  padding-bottom: 0;
}
.island-sheet-handle {
  flex: none;
  display: grid;
  place-items: center;
  width: 100%;
  height: 20px;
  padding: 0;
  border: 0;
  background: transparent;
  cursor: ns-resize;
  touch-action: none;
}
.island-sheet-handle::before {
  content: '';
  width: 36px;
  height: 4px;
  border-radius: 2px;
  background: var(--line-strong);
}
@media (prefers-reduced-motion: no-preference) {
  .island-sheet:not(.island-sheet-sizing) {
    transition: height var(--dur-fast) var(--ease-out);
  }
  .island-scrim-enter-active,
  .island-scrim-leave-active {
    transition: opacity var(--dur) var(--ease-out);
  }
  .island-scrim-enter-from,
  .island-scrim-leave-to {
    opacity: 0;
  }
  .island-sidebar[data-state='open'] {
    animation: island-in var(--dur) var(--ease-out);
  }
  .island-sidebar[data-state='closed'] {
    pointer-events: none;
    animation: island-out var(--dur) var(--ease-out) both;
  }
  .island-sidebar:not(.island-overlay) > :not(.island-resize-handle) {
    width: var(--sidebar-width);
    min-width: var(--sidebar-width);
    box-sizing: border-box;
  }
  .island-overlay[data-state='open'] {
    animation-name: island-overlay-in;
  }
  @keyframes island-overlay-in {
    from {
      transform: translateX(100%);
      opacity: 0;
    }
  }
  .island-overlay[data-state='closed'] {
    animation-name: island-overlay-out;
  }
  .island-sheet[data-state='open'] {
    animation: sheet-in var(--dur-slow) var(--ease-out);
  }
  .island-sheet[data-state='closed'] {
    animation: sheet-out 180ms ease-in both;
  }
  .island-scrim[data-state='closed'] {
    animation: island-scrim-out var(--dur) var(--ease-out) both;
  }
  @keyframes island-out {
    from {
      flex-basis: var(--sidebar-width);
      opacity: 1;
    }
    to {
      flex-basis: 0;
      opacity: 0;
    }
  }
  @keyframes island-overlay-out {
    to {
      transform: translateX(100%);
      opacity: 0;
    }
  }
  @keyframes island-scrim-out {
    to {
      opacity: 0;
    }
  }
  @keyframes island-in {
    from {
      flex-basis: 0;
      opacity: 0;
    }
  }
}
</style>

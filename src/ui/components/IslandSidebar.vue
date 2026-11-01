<script setup lang="ts">
import { DialogRoot, DialogContent, DialogOverlay, DialogTitle } from 'reka-ui';
import { computed, onMounted, onBeforeUnmount, ref, watch } from 'vue';
import { tryPlatform } from '../../platform/index.ts';
import Icon from './Icon.vue';
import { i18n } from '../../core/i18n/index.ts';
import { useDialogFocus } from '../composables/useDialogFocus.ts';

const props = defineProps<{ title: string; overlay?: boolean }>();
const emit = defineEmits<{ close: []; back: [] }>();
const focus = useDialogFocus();
const handle = ref<HTMLElement>();
const savedWidth = Number(tryPlatform('storage')?.get('pref.rightSidebarWidth'));
const preferredWidth = ref(Number.isFinite(savedWidth) && savedWidth >= 280 ? savedWidth : 0);
const available = ref(window.innerWidth);
const minimum = 280;
const maximum = computed(() => Math.max(minimum, available.value - 320));
const width = computed(() =>
  Math.round(
    Math.min(
      maximum.value,
      Math.max(minimum, preferredWidth.value || Math.min(460, Math.max(320, window.innerWidth * 0.34))),
    ),
  ),
);
let observer: ResizeObserver | undefined;
let drag: { id: number; x: number; width: number; preferred: number; target: HTMLElement } | undefined;
function save() {
  tryPlatform('storage')?.set('pref.rightSidebarWidth', String(preferredWidth.value));
}
function finish(commit = false) {
  if (!drag) return;
  const previous = drag;
  drag = undefined;
  document.documentElement.classList.remove('resizing');
  if (previous.target.hasPointerCapture(previous.id)) previous.target.releasePointerCapture(previous.id);
  if (commit) save();
  else preferredWidth.value = previous.preferred;
}
function start(event: PointerEvent) {
  if (event.button !== 0) return;
  finish();
  event.preventDefault();
  const target = event.currentTarget as HTMLElement;
  target.focus({ preventScroll: true });
  target.setPointerCapture(event.pointerId);
  drag = { id: event.pointerId, x: event.clientX, width: width.value, preferred: preferredWidth.value, target };
  document.documentElement.classList.add('resizing');
}
function move(event: PointerEvent) {
  if (!drag || drag.id !== event.pointerId) return;
  preferredWidth.value = Math.round(Math.min(maximum.value, Math.max(minimum, drag.width + drag.x - event.clientX)));
}
function end(event: PointerEvent) {
  if (drag?.id !== event.pointerId) return;
  move(event);
  finish(true);
}
function keyboard(event: KeyboardEvent) {
  const next = { ArrowLeft: width.value + 16, ArrowRight: width.value - 16, Home: minimum, End: maximum.value }[
    event.key
  ];
  if (next === undefined) return;
  event.preventDefault();
  finish();
  preferredWidth.value = Math.min(maximum.value, Math.max(minimum, next));
  save();
}
function cancel() {
  finish();
}
function observeContainer() {
  observer?.disconnect();
  const container = handle.value?.parentElement?.parentElement;
  if (!container) return;
  available.value = container.clientWidth;
  observer = new ResizeObserver(() => {
    available.value = container.clientWidth;
  });
  observer.observe(container);
}
watch(handle, observeContainer);
watch(() => props.overlay, cancel);
onMounted(() => {
  observeContainer();
  window.addEventListener('blur', cancel);
});
onBeforeUnmount(() => {
  cancel();
  observer?.disconnect();
  window.removeEventListener('blur', cancel);
});
</script>

<template>
  <DialogRoot :modal="!!overlay" :open="true" @update:open="!$event && emit('close')">
    <DialogOverlay v-if="overlay" class="island-scrim" @click="emit('close')" />
    <DialogContent
      id="session-sidebar"
      class="island-sidebar"
      :class="{ 'island-overlay': overlay }"
      :style="!overlay ? { flexBasis: `${width}px` } : undefined"
      :aria-describedby="undefined"
      :disable-outside-pointer-events="false"
      @open-auto-focus="focus.opened"
      @close-auto-focus="focus.closed"
      @interact-outside.prevent
      @escape-key-down.prevent="emit('back')"
    >
      <div
        v-if="!overlay"
        ref="handle"
        class="island-resize-handle"
        role="separator"
        tabindex="0"
        aria-orientation="vertical"
        :aria-label="i18n.t('sidebar.resize')"
        :aria-valuemin="minimum"
        :aria-valuemax="maximum"
        :aria-valuenow="width"
        @pointerdown="start"
        @pointermove="move"
        @pointerup="end"
        @pointercancel="cancel"
        @lostpointercapture="cancel"
        @keydown="keyboard"
      />
      <header class="island-heading">
        <slot name="leading" />
        <DialogTitle class="island-title"
          ><slot name="title">{{ title }}</slot></DialogTitle
        >
        <div class="island-actions"><slot name="actions" /></div>
        <button class="btn ghost icon-only" :aria-label="i18n.t('common.close')" @click="emit('close')">
          <Icon name="x" />
        </button>
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
   one-pixel line gaining accent color on hover, keyboard focus, or drag. */
.island-resize-handle::after {
  content: '';
  position: absolute;
  inset-block: 0;
  left: 0;
  width: 1px;
  background: transparent;
  transition: background var(--dur-fast);
}
html.resizing .island-resize-handle::after,
.island-resize-handle:focus-visible::after {
  background: var(--accent);
}
@media (hover: hover) {
  .island-resize-handle:hover::after {
    background: var(--accent);
  }
}
.island-heading {
  flex: none;
  display: flex;
  align-items: center;
  gap: 6px;
  min-height: 44px;
  padding: 4px 8px 4px 12px;
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
@media (prefers-reduced-motion: no-preference) {
  .island-sidebar {
    animation: island-in 180ms var(--ease-out);
  }
  @keyframes island-in {
    from {
      opacity: 0;
      transform: translateX(12px);
    }
  }
}
</style>

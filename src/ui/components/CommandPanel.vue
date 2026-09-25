<script setup lang="ts">
import { onBeforeUnmount, ref, watch } from "vue";
import { usePageActivity } from '../composables/usePageActivity.ts';
const pageActive = usePageActivity();
import { DialogRoot, DialogPortal, DialogOverlay, DialogContent, DialogTitle } from 'reka-ui';
import { X } from '@lucide/vue';
import { i18n } from '../../core/i18n/index.ts';
import { useDialogLayer } from '../composables/useDialogLayer.ts';
import { useDialogFocus } from '../composables/useDialogFocus.ts';

const props = defineProps<{ title: string; busy?: boolean }>();
const emit = defineEmits<{ close: [] }>();
const focus = useDialogFocus();
const layer = useDialogLayer();
const closing = ref(false);
let closeCompleted = false;
let closeTimer: ReturnType<typeof setTimeout> | undefined;
function clearCloseTimer() {
  if (closeTimer !== undefined) clearTimeout(closeTimer);
  closeTimer = undefined;
}
function finishClose() {
  if (!closing.value || closeCompleted) return;
  closeCompleted = true;
  clearCloseTimer();
  emit('close');
}
function close() {
  if (props.busy || closing.value) return;
  if (matchMedia('(prefers-reduced-motion: reduce)').matches) emit('close');
  else {
    closeCompleted = false;
    closing.value = true;
    // An interrupted CSS animation must never leave an invisible modal mounted.
    closeTimer = setTimeout(finishClose, 300);
  }
}
function finished(event: AnimationEvent) {
  if (event.target === event.currentTarget && event.animationName === 'popup-fade-out') finishClose();
}
watch(pageActive, active => { if (!active) { clearCloseTimer(); closing.value = false; closeCompleted = false; } }, { flush: 'sync' });
onBeforeUnmount(clearCloseTimer);
defineExpose({ close });
</script>

<template>
  <DialogRoot :open="pageActive && !closing" @update:open="open => { if (!open) close(); }">
    <DialogPortal v-if="pageActive">
      <DialogOverlay class="modal-overlay" :style="{ zIndex: layer }" />
      <DialogContent @animationend="finished" class="command-panel" :style="{ zIndex: layer + 1 }" :aria-describedby="undefined" :aria-busy="busy"
        @open-auto-focus="focus.opened" @close-auto-focus="focus.closed"
        @escape-key-down="event => { if (busy) event.preventDefault(); }"
        @interact-outside="event => { if (busy) event.preventDefault(); }">
        <DialogTitle class="visually-hidden">{{ title }}</DialogTitle>
        <button class="command-close btn ghost icon-only" :aria-label="i18n.t('common.close')" :disabled="busy" @click="close"><X :size="18" /></button>
        <slot />
      </DialogContent>
    </DialogPortal>
  </DialogRoot>
</template>

<style scoped>
.command-panel { position: fixed; z-index: 61; left: 50%; top: min(12dvh, 96px); transform: translateX(-50%); width: min(92vw, 36rem); max-height: calc(100dvh - min(12dvh, 96px) - 24px); display: flex; overflow: hidden; background: var(--bg-overlay); color: var(--fg); border: 1px solid var(--line-strong); border-radius: 10px; box-shadow: var(--shadow-pop); animation: command-in var(--dur-fast) var(--ease-out); }
.command-close { position: absolute; top: 7px; right: 7px; z-index: 1; }
.command-panel :deep(.picker) { display: flex; flex-direction: column; flex: 1; min-height: 0; }
.command-panel :deep(.picker-search) { flex: none; min-height: 54px; margin: 0; padding: 12px 54px 12px 16px; border: 0; border-bottom: 1px solid var(--line); border-radius: 0; }
.command-panel :deep(.picker-viewport) { min-height: 0; flex-shrink: 1; margin-block: 8px; }
.command-panel :deep(.picker-list) { margin: 0; padding-inline: 8px; }
.command-panel :deep(.command-status) { flex: none; margin: 0; padding: 8px 16px; font-size: 12px; }
.command-panel :deep(.load-error) { margin: 0; padding: 8px; font-size: 12px; }
.command-panel[data-state="closed"] { animation: popup-fade-out 120ms ease-in; }
@keyframes command-in { from { opacity: 0; transform: translate(-50%, -6px); } to { opacity: 1; transform: translate(-50%, 0); } }
</style>

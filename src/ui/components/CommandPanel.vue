<script setup lang="ts">
import { DialogRoot, DialogPortal, DialogOverlay, DialogContent, DialogTitle } from 'reka-ui';
import { X } from '@lucide/vue';
import { i18n } from '../../core/i18n/index.js';
import { useDialogFocus } from '../composables/useDialogFocus';

defineProps<{ title: string; busy?: boolean }>();
const emit = defineEmits<{ close: [] }>();
const focus = useDialogFocus();
</script>

<template>
  <DialogRoot :open="true" @update:open="open => { if (!open && !busy) emit('close'); }">
    <DialogPortal>
      <DialogOverlay class="modal-overlay" />
      <DialogContent class="command-panel" :aria-describedby="undefined" :aria-busy="busy"
        @open-auto-focus="focus.opened" @close-auto-focus="focus.closed"
        @escape-key-down="event => { if (busy) event.preventDefault(); }"
        @interact-outside="event => { if (busy) event.preventDefault(); }">
        <DialogTitle class="visually-hidden">{{ title }}</DialogTitle>
        <button class="command-close btn ghost icon-only" :aria-label="i18n.t('common.close')" :disabled="busy" @click="emit('close')"><X :size="18" /></button>
        <slot />
      </DialogContent>
    </DialogPortal>
  </DialogRoot>
</template>

<style scoped>
.command-panel { position: fixed; z-index: 61; left: 50%; top: min(12dvh, 96px); transform: translateX(-50%); width: min(92vw, 36rem); max-height: calc(100dvh - min(12dvh, 96px) - 24px); display: flex; overflow: hidden; background: var(--bg-raised); color: var(--fg); border: 1px solid var(--line-strong); border-radius: 10px; box-shadow: var(--shadow-pop); animation: command-in var(--dur-fast) var(--ease-out); }
.command-close { position: absolute; top: 7px; right: 7px; z-index: 1; }
.command-panel :deep(.picker) { display: flex; flex-direction: column; flex: 1; min-height: 0; }
.command-panel :deep(.picker-search) { flex: none; min-height: 54px; margin: 0; padding: 12px 54px 12px 16px; border: 0; border-bottom: 1px solid var(--line); border-radius: 0; }
.command-panel :deep(.picker-list) { min-height: 0; flex-shrink: 1; margin-block: 8px; padding-inline: 8px; }
.command-panel :deep(.command-status) { flex: none; margin: 0; padding: 8px 16px; font-size: 12px; }
.command-panel :deep(.load-error) { margin: 0; padding: 8px; font-size: 12px; }
@keyframes command-in { from { opacity: 0; transform: translate(-50%, -6px); } to { opacity: 1; transform: translate(-50%, 0); } }
</style>

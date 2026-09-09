<script setup lang="ts">
// Centered confirm/content modal on Reka primitives (title/description
// wired for a11y). While `dismissable` is false no path closes it — Esc,
// overlay, close button are all suppressed; the owner resolves the busy work.
import { DialogRoot, DialogPortal, DialogOverlay, DialogContent, DialogTitle, DialogDescription } from 'reka-ui';

defineProps<{ open: boolean; title: string; wide?: boolean; dismissable?: boolean }>();
const emit = defineEmits<{ close: [] }>();
</script>

<template>
  <DialogRoot :open="open" @update:open="(v: boolean) => { if (v === false && dismissable !== false) emit('close'); }">
    <DialogPortal>
      <DialogOverlay class="modal-overlay" />
      <DialogContent class="modal-card" :class="{ wide }"
        @escape-key-down="(e: KeyboardEvent) => { if (dismissable === false) e.preventDefault(); }"
        @interact-outside="(e: Event) => { if (dismissable === false) e.preventDefault(); }"
        @pointer-down-outside="(e: Event) => { if (dismissable === false) e.preventDefault(); }">
        <div class="modal-head">
          <DialogTitle class="modal-title">{{ title }}</DialogTitle>
          <button class="btn ghost icon-only" :disabled="dismissable === false" aria-label="close"
            @click="dismissable !== false && emit('close')">
            <svg viewBox="0 0 24 24" width="16" height="16"><path d="M18 6 6 18M6 6l12 12" stroke="currentColor" stroke-width="2" fill="none" /></svg>
          </button>
        </div>
        <div class="modal-body">
          <slot />
        </div>
        <div v-if="$slots.footer" class="modal-foot">
          <DialogDescription as="div" class="visually-hidden"><slot name="description" /></DialogDescription>
          <slot name="footer" />
        </div>
      </DialogContent>
    </DialogPortal>
  </DialogRoot>
</template>

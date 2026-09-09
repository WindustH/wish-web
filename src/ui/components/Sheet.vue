<script setup lang="ts">
// Right-side overlay pane. Desktop: non-modal drawer (chat stays interactive,
// Esc closes). Mobile: full-page modal sheet (chat goes inert underneath).
import { DialogRoot, DialogPortal, DialogContent, DialogTitle } from 'reka-ui';

defineProps<{ open: boolean; title: string; mobile?: boolean }>();
const emit = defineEmits<{ close: [] }>();
</script>

<template>
  <DialogRoot :open="open" :modal="mobile === true"
    @update:open="(v: boolean) => { if (v === false) emit('close'); }">
    <DialogPortal>
      <DialogContent class="drawer" :class="{ 'sheet-page': mobile }"
        :aria-describedby="undefined">
        <div class="drawer-head">
          <button v-if="mobile" class="btn ghost icon-only" :aria-label="'back'" @click="emit('close')">
            <svg viewBox="0 0 24 24" width="18" height="18"><path d="M19 12H5m7-7-7 7 7 7" stroke="currentColor" stroke-width="2" fill="none" /></svg>
          </button>
          <DialogTitle class="drawer-title">{{ title }}</DialogTitle>
          <button class="btn ghost icon-only" aria-label="close" @click="emit('close')">
            <svg viewBox="0 0 24 24" width="16" height="16"><path d="M18 6 6 18M6 6l12 12" stroke="currentColor" stroke-width="2" fill="none" /></svg>
          </button>
        </div>
        <div class="sheet-body">
          <slot />
        </div>
      </DialogContent>
    </DialogPortal>
  </DialogRoot>
</template>

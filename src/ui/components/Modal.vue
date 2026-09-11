<script setup lang="ts">
import { usePageActivity } from '../composables/usePageActivity';
// Centered confirm/content modal on Reka primitives (title/description
// wired for a11y). While `dismissable` is false no path closes it — Esc,
// overlay, close button are all suppressed; the owner resolves the busy work.
import { DialogRoot, DialogPortal, DialogOverlay, DialogContent, DialogTitle, DialogDescription } from 'reka-ui';

import Icon from './Icon.vue';
import { i18n } from '../../core/i18n/index.js';
import { useDialogFocus } from '../composables/useDialogFocus';
const focus = useDialogFocus();
const pageActive = usePageActivity();

withDefaults(defineProps<{ open: boolean; title: string; wide?: boolean; dismissable?: boolean }>(), { dismissable: true });
const emit = defineEmits<{ close: [] }>();
</script>

<template>
  <DialogRoot :open="open" @update:open="(v: boolean) => { if (v === false && dismissable !== false) emit('close'); }">
    <DialogPortal v-if="pageActive">
      <DialogOverlay class="modal-overlay" />
      <DialogContent @open-auto-focus="focus.opened" @close-auto-focus="focus.closed" class="modal-card" :class="{ wide }" :aria-describedby="undefined"
        @escape-key-down="(e: KeyboardEvent) => { if (dismissable === false) e.preventDefault(); }"
        @interact-outside="(e: Event) => { if (dismissable === false) e.preventDefault(); }"
        @pointer-down-outside="(e: Event) => { if (dismissable === false) e.preventDefault(); }">
        <div class="modal-head">
          <DialogTitle class="modal-title">{{ title }}</DialogTitle>
          <div class="modal-head-actions">
            <slot name="actions" />
            <button type="button" class="btn ghost icon-only" :disabled="dismissable === false" :aria-label="i18n.t('common.close')"
              @click="dismissable !== false && emit('close')">
              <Icon name="x" />
            </button>
          </div>
        </div>
        <div class="modal-body">
          <slot />
        </div>
        <div v-if="$slots.footer" class="modal-foot">
          <DialogDescription v-if="$slots.description" as="div" class="visually-hidden"><slot name="description" /></DialogDescription>
          <slot name="footer" />
        </div>
      </DialogContent>
    </DialogPortal>
  </DialogRoot>
</template>

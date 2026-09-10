<script setup lang="ts">
// Right-side overlay pane. Desktop: non-modal drawer (chat stays interactive,
// Esc closes). Mobile: full-page modal sheet (chat goes inert underneath).
import { DialogRoot, DialogPortal, DialogContent, DialogTitle } from 'reka-ui';

import Icon from './Icon.vue';
import { i18n } from '../../core/i18n/index.js';
import { useDialogFocus } from '../composables/useDialogFocus';
const focus = useDialogFocus();

defineProps<{ open: boolean; title: string; mobile?: boolean }>();
const emit = defineEmits<{ close: [] }>();
</script>

<template>
  <DialogRoot :open="open" :modal="mobile === true"
    @update:open="(v: boolean) => { if (v === false) emit('close'); }">
    <DialogPortal>
      <DialogContent @interact-outside="focus.outside" @open-auto-focus="focus.opened" @close-auto-focus="focus.closed" class="session-sheet" :class="mobile ? 'sheet-page' : 'drawer'"
        :aria-describedby="undefined">
        <div class="drawer-head">
          <button v-if="mobile" class="btn ghost icon-only" :aria-label="i18n.t('chatbar.back')" @click="emit('close')">
            <Icon name="arrow-left" />
          </button>
          <DialogTitle class="drawer-title">{{ title }}</DialogTitle>
          <button v-if="!mobile" class="btn ghost icon-only" :aria-label="i18n.t('common.close')" @click="emit('close')">
            <Icon name="x" />
          </button>
          <span v-else class="sheet-head-spacer" aria-hidden="true" />
        </div>
        <div class="sheet-body">
          <slot />
        </div>
      </DialogContent>
    </DialogPortal>
  </DialogRoot>
</template>

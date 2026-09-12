<script setup lang="ts">
import { computed, onMounted, onBeforeUnmount, ref } from 'vue';
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

const props = withDefaults(defineProps<{ open: boolean; title: string; wide?: boolean; page?: boolean; contentClass?: string; dismissable?: boolean; closeButton?: boolean }>(), { dismissable: true, closeButton: true });
const emit = defineEmits<{ close: [] }>();
const closing = ref(false);
const bubble = computed(() => !props.page && !!props.contentClass?.split(' ').includes('session-window'));
const anchorStyle = ref<Record<string, string>>({});
function positionBubble() {
  if (!bubble.value) return;
  const button = document.querySelector('.chatbar [data-session-panel][aria-pressed="true"]');
  if (!button) return;
  const rect = button.getBoundingClientRect();
  const top = rect.bottom + 10;
  anchorStyle.value = { right: `${Math.max(16, innerWidth - rect.right - 8)}px`, top: `${top}px`, maxHeight: `calc(100dvh - ${top + 16}px)` };
}
onMounted(() => { positionBubble(); window.addEventListener('resize', positionBubble); });
onBeforeUnmount(() => window.removeEventListener('resize', positionBubble));
function requestClose() {
  if (!props.dismissable || closing.value) return;
  if (!props.page && props.contentClass?.split(' ').includes('session-window')) closing.value = true;
  else emit('close');
}
function finishClose(event: AnimationEvent) {
  if (closing.value && event.target === event.currentTarget) emit('close');
}
</script>

<template>
  <DialogRoot :modal="!bubble" :open="open && !closing" @update:open="(v: boolean) => { if (!v) requestClose(); }">
    <DialogPortal v-if="pageActive">
      <DialogOverlay v-if="!bubble" class="modal-overlay" />
      <DialogContent @animationend="finishClose" @open-auto-focus="focus.opened" @close-auto-focus="focus.closed" class="modal-card" :class="[{ wide, 'modal-page': page, 'session-bubble': bubble }, contentClass]" :style="bubble ? anchorStyle : undefined" :aria-describedby="undefined"
        @escape-key-down="(e: KeyboardEvent) => { if (dismissable === false) e.preventDefault(); }"
        @interact-outside="(e: Event) => { if (dismissable === false) e.preventDefault(); }"
        @pointer-down-outside="(e: Event) => { if (dismissable === false) e.preventDefault(); }">
        <DialogTitle v-if="bubble" class="visually-hidden">{{ title }}</DialogTitle>
        <div v-else class="modal-head">
          <button v-if="page" type="button" class="btn ghost icon-only" :disabled="dismissable === false"
            :aria-label="i18n.t('chatbar.back')" @click="requestClose"><Icon name="arrow-left" /></button>
          <DialogTitle class="modal-title">{{ title }}</DialogTitle>
          <div class="modal-head-actions">
            <slot name="actions" />
            <button v-if="!page && closeButton" type="button" class="btn ghost icon-only" :disabled="dismissable === false" :aria-label="i18n.t('common.close')"
              @click="requestClose">
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

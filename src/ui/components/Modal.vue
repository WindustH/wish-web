<script setup lang="ts">
import { computed, inject, nextTick, onMounted, onBeforeUnmount, ref, watch } from 'vue';
import { usePageActivity } from '../composables/usePageActivity';
// Centered confirm/content modal on Reka primitives (title/description
// wired for a11y). While `dismissable` is false no path closes it — Esc,
// overlay, close button are all suppressed; the owner resolves the busy work.
import { DialogRoot, DialogPortal, DialogOverlay, DialogContent, DialogTitle, DialogDescription } from 'reka-ui';

import { sessionPanelCloseKey } from '../composables/sessionPanel';
import Icon from './Icon.vue';
import { i18n } from '../../core/i18n/index.js';
import { useDialogFocus } from '../composables/useDialogFocus';
const focus = useDialogFocus();
const pageActive = usePageActivity();

const props = withDefaults(defineProps<{ open: boolean; title: string; wide?: boolean; page?: boolean; contentClass?: string; dismissable?: boolean; closeButton?: boolean; floating?: boolean; anchor?: HTMLElement }>(), { dismissable: true, closeButton: true });
const emit = defineEmits<{ close: [] }>();
const closing = ref(false);
const bubble = computed(() => props.floating || (!props.page && !!props.contentClass?.split(' ').includes('session-window')));
const panelClose = inject(sessionPanelCloseKey, null);
watch([bubble, pageActive], ([value, active]) => {
  if (!panelClose) return;
  if (value && active) panelClose.value = requestClose;
  else if (panelClose.value === requestClose) panelClose.value = null;
}, { immediate: true });
onBeforeUnmount(() => { if (panelClose?.value === requestClose) panelClose.value = null; });
function opened(event: Event) {
  if (bubble.value) event.preventDefault();
  else focus.opened(event);
}
function outside(event: Event) {
  const target = (event as CustomEvent).detail?.originalEvent?.target as Node | undefined;
  if (!props.dismissable || (props.floating && target && props.anchor?.contains(target)) || (bubble.value && (event.target as Element)?.closest?.('[data-session-panel]'))) event.preventDefault();
}
watch(pageActive, active => { if (!active) closing.value = false; }, { flush: 'sync' });
watch([pageActive, bubble], async ([active]) => { if (active) { await nextTick(); positionBubble(); } });
const anchorStyle = ref<Record<string, string>>({});
function positionBubble() {
  if (!bubble.value) return;
  if (props.floating) {
    const rect = props.anchor?.getBoundingClientRect();
    const width = Math.min(480, innerWidth - 40);
    let height = Math.min(560, innerHeight * .72);
    let right = 24;
    let top = innerHeight * .14;
    if (rect) {
      if (rect.left >= width + 32) {
        right = innerWidth - rect.left + 12;
        top = Math.max(20, Math.min(rect.top - 12, innerHeight - height - 20));
      } else {
        right = Math.max(20, Math.min(innerWidth - width - 20, innerWidth - rect.right));
        const below = innerHeight - rect.bottom - 28;
        const above = rect.top - 28;
        height = Math.min(height, Math.max(above, below));
        top = below >= above ? rect.bottom + 8 : rect.top - height - 8;
      }
    }
    anchorStyle.value = { right: `${right}px`, top: `${top}px`, maxHeight: `${height}px` };
    return;
  }
  const button = document.querySelector('.chatbar [data-session-panel][aria-pressed="true"]');
  if (!button) return;
  const rect = button.getBoundingClientRect();
  const top = rect.bottom + 10;
  anchorStyle.value = { right: `${Math.max(16, innerWidth - rect.right - 8)}px`, top: `${top}px`, maxHeight: `calc(100dvh - ${top + 16}px)` };
}
onMounted(() => { positionBubble(); window.addEventListener('resize', positionBubble); window.addEventListener('scroll', positionBubble, true); });
onBeforeUnmount(() => { window.removeEventListener('resize', positionBubble); window.removeEventListener('scroll', positionBubble, true); });
function requestClose() {
  if (!pageActive.value || !props.dismissable || closing.value) return;
  if (bubble.value) closing.value = true;
  else emit('close');
}
function finishClose(event: AnimationEvent) {
  if (pageActive.value && closing.value && event.target === event.currentTarget) emit('close');
}
defineExpose({ close: requestClose });
</script>

<template>
  <DialogRoot :modal="!bubble" :open="open && !closing" @update:open="(v: boolean) => { if (!v) requestClose(); }">
    <DialogPortal v-if="pageActive">
      <DialogOverlay v-if="!bubble" class="modal-overlay" />
      <DialogContent @animationend="finishClose" @open-auto-focus="opened" @close-auto-focus="focus.closed" class="modal-card" :class="[{ wide, 'modal-page': page, 'session-bubble': bubble && !floating, 'config-bubble': floating }, contentClass]" :style="bubble ? anchorStyle : undefined" :aria-describedby="undefined"
        @escape-key-down="(e: KeyboardEvent) => { if (dismissable === false) e.preventDefault(); }"
        @focus-outside="event => { if (floating) event.preventDefault(); }"
        @interact-outside="outside"
        @pointer-down-outside="outside">
        <DialogTitle v-if="bubble && !floating" class="visually-hidden">{{ title }}</DialogTitle>
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

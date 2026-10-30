<script setup lang="ts">
import { computed, nextTick, onMounted, onBeforeUnmount, ref, watch } from 'vue';
import { usePageActivity } from '../composables/usePageActivity.ts';
// Centered confirm/content modal on Reka primitives (title/description
// wired for a11y). While `dismissable` is false no path closes it — Esc,
// overlay, close button are all suppressed; the owner resolves the busy work.
import { DialogRoot, DialogPortal, DialogOverlay, DialogContent, DialogTitle, DialogDescription } from 'reka-ui';

import Icon from './Icon.vue';
import DraftActions from './DraftActions.vue';
import BubbleSurface from './BubbleSurface.vue';
import { i18n } from '../../core/i18n/index.ts';
import { useDialogLayer } from '../composables/useDialogLayer.ts';
import { imageLightbox } from '../imageLightbox.ts';
import { useDialogLifecycle } from '../composables/useDialogLifecycle.ts';
import { useDialogFocus } from '../composables/useDialogFocus.ts';
import { prefersReducedMotion } from '../motion/reducedMotion.ts';
import { useSheetDrag } from '../composables/useSheetDrag.ts';
import { useBackLayer } from '../composables/useBackLayer.ts';
import { touchButton } from '../touchButton.ts';
const focus = useDialogFocus();
const backTouch = touchButton();
const pageActive = usePageActivity();

// `sheet`: a card that slides up from the bottom of a phone's screen rather than one in its middle.
const props = withDefaults(
  defineProps<{
    open: boolean;
    title: string;
    beforeClose?: () => boolean | Promise<boolean>;
    layer?: number;
    wide?: boolean;
    page?: boolean;
    sheet?: boolean;
    back?: () => void;
    contentClass?: string;
    bodyScroll?: 'auto' | 'content';
    dismissable?: boolean;
    compact?: boolean;
    backLayer?: boolean;
    anchor?: () => HTMLElement | null;
    ignoreOutside?: (target: Element) => boolean;
  }>(),
  { dismissable: true, backLayer: true },
);
const emit = defineEmits<{ close: [] }>();
const { mounted, contentOpen, requestClose, finishClose } = useDialogLifecycle({
  open: () => props.open,
  active: () => pageActive.value,
  dismissable: () => props.dismissable,
  beforeClose: () => props.beforeClose?.(),
  reducedMotion: prefersReducedMotion,
  closed: () => emit('close'),
});
const layer = useDialogLayer(() => props.layer ?? 60);
// Presentation does not determine navigation ownership: local pickers/editors can also
// fill the screen. Routed panels opt out explicitly with backLayer=false.
useBackLayer(
  () => props.backLayer && mounted.value,
  () => {
    if (props.dismissable) return props.page && props.back ? props.back() : requestClose();
  },
  () => layer.value,
);
// Anchored presentation is explicitly selected by the caller.
const bubble = computed(() => !props.page && !!props.anchor);
// Compact cards drop the head and footer bands: the title joins the content
// flow and the actions follow it. Page sheets keep their head (back button).
const compactCard = computed(() => props.compact && !props.page);
// Counts the card's showings: it is put on the page a moment after `open`, and again when its page
// comes back, and what holds it - the sheet's drag - looks for it then.
const shown = ref(0);
function opened(event: Event) {
  shown.value++;
  if (bubble.value) event.preventDefault();
  else focus.opened(event);
}
// A drag that selects text inside a field must stay owned by that field.
// Without pointer capture the browser hands the selection to the document the
// moment the pointer crosses the window edge, and with nothing selectable
// under it (the overlay) the whole selection silently collapses — the user's
// drag-select just vanishes. Capturing keeps the drag (and the selection)
// inside the field, clamped at its bounds; dropping text between fields uses
// the drag-and-drop channel, which pointer capture does not touch.
function ownFieldDrag(event: Event) {
  const target = event.target as HTMLElement | null;
  if (target?.matches?.('input, textarea') && target.isConnected) {
    try {
      target.setPointerCapture((event as PointerEvent).pointerId);
    } catch {
      /* already gone */
    }
  }
}
// A picture opened from this window belongs to it: pressing outside or Escape closes the picture,
// not the window it was opened from. The viewer is a sibling of the window on the body, so without
// this the window reads every click on it as a click outside.
function looking() {
  return !!imageLightbox.value;
}
function outside(event: Event) {
  const target = (event as CustomEvent).detail?.originalEvent?.target as Node | undefined;
  if (
    looking() ||
    (target instanceof Element && target.closest('.pwa-update')) ||
    !props.dismissable ||
    (target instanceof Element && props.ignoreOutside?.(target))
  )
    event.preventDefault();
}
watch([pageActive, bubble], async ([active]) => {
  if (active) {
    await nextTick();
    positionBubble();
  }
});
const anchorStyle = ref<Record<string, string>>({});
// A sheet is pulled down to put it away, as a phone's own are. The card is found by a mark of its
// own: the content component's root is not the card.
const mark = `m${Math.random().toString(36).slice(2, 9)}`;
useSheetDrag(
  () =>
    props.sheet && props.open && pageActive.value && shown.value
      ? document.querySelector<HTMLElement>(`[data-modal="${mark}"]`)
      : null,
  () => !!props.sheet && props.dismissable !== false,
  () => void requestClose(),
);
function positionBubble() {
  if (!bubble.value) return;
  const button = props.anchor?.();
  if (!button) return;
  const rect = button.getBoundingClientRect();
  const top = rect.bottom + 10;
  anchorStyle.value = {
    right: `${Math.max(16, innerWidth - rect.right - 8)}px`,
    top: `${top}px`,
    maxHeight: `calc(100dvh - ${top + 16}px)`,
  };
}
const trackBubblePosition = () => {
  positionBubble();
  window.addEventListener('resize', positionBubble);
  window.addEventListener('scroll', positionBubble, true);
};
const untrackBubblePosition = () => {
  window.removeEventListener('resize', positionBubble);
  window.removeEventListener('scroll', positionBubble, true);
};
// Only bubble-mode modals follow the window. Detail modals mount inside
// every virtualized row; unconditional per-row window scroll/resize
// listeners (capture phase) turned each scroll into a rows-sized fan-out.
watch(bubble, (value) => {
  value ? trackBubblePosition() : untrackBubblePosition();
});
onMounted(() => {
  positionBubble();
  if (bubble.value) trackBubblePosition();
});
onBeforeUnmount(untrackBubblePosition);
function onCloseAnimationEnd(event: AnimationEvent) {
  if (
    event.target === event.currentTarget &&
    ['popup-fade-out', 'page-out', 'sheet-out', 'anchored-modal-out'].includes(event.animationName)
  )
    finishClose();
}
defineExpose({ close: requestClose });
</script>

<template>
  <DialogRoot
    :modal="!bubble"
    :open="contentOpen"
    @update:open="
      (v: boolean) => {
        if (!v) requestClose();
      }
    "
  >
    <!-- Once our close finishes, unmount the owned layer even if a browser stalls its CSS exit. -->
    <DialogPortal v-if="mounted">
      <DialogOverlay v-if="!bubble" class="modal-overlay" :style="{ zIndex: layer }" />
      <!-- The scrim isolates pointer input; keep the modal focus trap without locking cached pages. -->
      <DialogContent
        :disable-outside-pointer-events="false"
        data-keyboard-boundary
        :data-modal="mark"
        @pointerdown.capture="ownFieldDrag"
        @animationend="onCloseAnimationEnd"
        @open-auto-focus="opened"
        @close-auto-focus="focus.closed"
        class="modal-card"
        :class="[
          { wide, 'modal-page': page, 'modal-sheet': sheet, 'anchored-modal': bubble, compact: compactCard },
          contentClass,
        ]"
        :style="{ ...(bubble ? anchorStyle : {}), zIndex: layer + 1 }"
        :aria-describedby="undefined"
        @escape-key-down="
          (e: KeyboardEvent) => {
            if (looking()) e.preventDefault();
            else if (dismissable === false) e.preventDefault();
            else if (page && back) {
              e.preventDefault();
              back();
            }
          }
        "
        @interact-outside="outside"
        @pointer-down-outside="outside"
      >
        <BubbleSurface v-if="bubble" class="anchored-modal-surface" side="top" :tail-x="24" align-end />
        <DialogTitle v-if="bubble" class="visually-hidden">{{ title }}</DialogTitle>
        <div v-else-if="!compactCard" class="modal-head">
          <button
            v-if="page || back"
            type="button"
            class="btn ghost icon-only"
            :disabled="dismissable === false"
            :aria-label="i18n.t('chatbar.back')"
            @click="backTouch.acceptsClick($event) && (back ? back() : requestClose())"
            @touchstart.passive="backTouch.start"
            @touchmove.passive="backTouch.move"
            @touchend="backTouch.end"
            @touchcancel="backTouch.cancel"
          >
            <Icon name="arrow-left" />
          </button>
          <DialogTitle class="modal-title">{{ title }}</DialogTitle>
          <div class="modal-head-actions">
            <slot name="actions" />
            <DraftActions v-if="page" />
            <button
              v-if="!page"
              type="button"
              class="btn ghost icon-only"
              :disabled="dismissable === false"
              :aria-label="i18n.t('common.close')"
              @click="requestClose"
            >
              <Icon name="x" />
            </button>
          </div>
        </div>
        <div class="modal-body" :class="{ 'content-scroll': bodyScroll === 'content' }">
          <template v-if="compactCard">
            <DialogTitle :class="$slots['compact-heading'] ? 'visually-hidden' : 'modal-flow-title'">{{
              title
            }}</DialogTitle>
            <slot name="compact-heading" />
          </template>
          <slot />
        </div>
        <div v-if="$slots.footer" :class="compactCard ? 'modal-actions' : 'modal-foot'">
          <DialogDescription v-if="$slots.description" as="div" class="visually-hidden"
            ><slot name="description"
          /></DialogDescription>
          <slot name="footer" />
        </div>
      </DialogContent>
    </DialogPortal>
  </DialogRoot>
</template>

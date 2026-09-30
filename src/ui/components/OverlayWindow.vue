<script setup lang="ts">
// A window over the app on a desktop and a page of its own on a phone - the frame of the
// statistics and data views. Its heading holds the title, what the `tools` slot adds, and the way
// out; the default slot is the scrolling page, and `overlay` floats over the window.
// `gutter` is the page's side margin on a desktop, `mobilePadding` the page's padding on a phone.
import { inject } from 'vue';
import { DialogRoot, DialogPortal, DialogOverlay, DialogContent, DialogTitle } from 'reka-ui';
import Icon from './Icon.vue';
import { useIsMobile } from '../composables/useMedia.ts';
import { usePageActivity } from '../composables/usePageActivity.ts';
import { useDialogFocus } from '../composables/useDialogFocus.ts';
import { closeOverlayKey } from '../composables/overlay.ts';
import { i18n } from '../../core/i18n/index.ts';
import { tr } from '../../core/i18n/tr.ts';

defineOptions({ inheritAttrs: false });
defineProps<{ title: string; closeLabel?: string; gutter?: string; mobilePadding?: string }>();
const isMobile = useIsMobile();
const pageActive = usePageActivity();
const focus = useDialogFocus();
const close = inject(closeOverlayKey)!;
</script>

<template>
  <DialogRoot :open="pageActive" :modal="!isMobile" @update:open="open => { if (!open && !isMobile) close(); }">
    <DialogPortal :disabled="isMobile">
      <DialogOverlay v-if="!isMobile" class="overlay-window-scrim" />
      <DialogContent as-child :aria-describedby="undefined" @open-auto-focus="focus.opened" @close-auto-focus="focus.closed">
        <div class="overlay-window" v-bind="$attrs" :style="{ '--overlay-gutter': gutter, '--overlay-mobile-padding': mobilePadding }">
          <header class="overlay-window-heading page-bar">
            <button v-if="isMobile" class="btn ghost icon-only" :aria-label="i18n.t('chatbar.back')" @click="close"><Icon name="arrow-left" /></button>
            <DialogTitle class="overlay-window-title page-bar-title">{{ title }}</DialogTitle>
            <slot name="tools" />
            <button v-if="!isMobile" class="btn ghost icon-only" :aria-label="closeLabel ?? tr('关闭', 'Close')" @click="close"><Icon name="x" /></button>
          </header>
          <div class="overlay-window-page" data-scroll-preserve><slot /></div>
          <slot name="overlay" />
        </div>
      </DialogContent>
    </DialogPortal>
  </DialogRoot>
</template>

<style scoped>
.overlay-window { display: flex; flex-direction: column; min-height: 0; background: var(--bg); }
.overlay-window-page { flex: 1; min-height: 0; overflow: auto; padding: 0 var(--overlay-gutter, clamp(24px, 4vw, 48px)) 32px; }
.overlay-window-scrim { position: fixed; inset: 0; z-index: 50; background: var(--scrim); backdrop-filter: blur(4px); animation: overlay-window-fade 180ms var(--ease-out); }
.overlay-window-scrim[data-state='closed'] { animation: overlay-window-fade 160ms ease-in reverse forwards; pointer-events: none; }
@media (min-width: 900px) {
  .overlay-window { position: fixed; z-index: 51; top: 50%; left: 50%; transform: translate(-50%, -50%); width: min(1120px, 94vw); height: min(820px, 90dvh); border: 1px solid var(--line-strong); border-radius: 16px; box-shadow: var(--shadow-pop); overflow: hidden; animation: overlay-window-enter 180ms var(--ease-out); }
  .overlay-window[data-state='closed'] { animation: overlay-window-exit 160ms ease-in forwards; }
  /* The compact windows' heading: the title in the flow and its tools beside it, no band. */
  .overlay-window-heading { display: flex; flex: none; align-items: center; gap: 2px; min-height: 0; padding: 12px 12px 6px var(--overlay-gutter, clamp(24px, 4vw, 48px)); border-bottom: 0; background: transparent; }
  .overlay-window-title { flex: 1; min-width: 0; margin: 0 10px 0 0; font: 600 15px/1.4 var(--font); }
  .overlay-window-heading .btn.icon-only { width: 32px; height: 32px; min-height: 32px; }
  .overlay-window-heading .icon { width: 16px; height: 16px; }
  .overlay-window-heading :deep(.refresh-stamp) { margin-right: 4px; }
  .overlay-window-page { padding-top: 6px; }
}
@media (max-width: 899px) {
  .overlay-window { position: absolute; inset: 0; background: var(--bg-sunken); }
  .overlay-window-page { padding: var(--overlay-mobile-padding, 16px 16px 32px); }
}
@keyframes overlay-window-enter { from { opacity: 0; translate: 0 8px; scale: .985; } }
@keyframes overlay-window-exit { to { opacity: 0; translate: 0 8px; scale: .985; } }
@keyframes overlay-window-fade { from { opacity: 0; } }
</style>

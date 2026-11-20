<script setup lang="ts">
import { onMounted, onBeforeUnmount } from 'vue';
import { cfg } from '../../core/config.ts';
import { i18n } from '../../core/i18n/index.ts';
import Icon from './Icon.vue';

import type { ToastTone } from '../toast.ts';
const toneIcons: Record<ToastTone, string> = {
  info: 'info',
  success: 'check',
  warning: 'triangle-alert',
  error: 'circle-x',
};
const props = defineProps<{
  text: string;
  tone?: ToastTone;
  detail?: string;
  icon?: string;
  persistent?: boolean;
  dismissLabel?: string;
}>();
const emit = defineEmits<{ dismiss: [] }>();
let timer: ReturnType<typeof setTimeout> | undefined;
let hovered = false;
let focused = false;
function schedule() {
  clearTimeout(timer);
  if (!props.persistent && !hovered && !focused) timer = setTimeout(() => emit('dismiss'), cfg.notifications.toastMs);
}
function setHovered(value: boolean) {
  hovered = value;
  schedule();
}
function setFocused(value: boolean) {
  focused = value;
  schedule();
}
onMounted(schedule);
onBeforeUnmount(() => clearTimeout(timer));
</script>

<template>
  <div
    class="toast popup-palette"
    :data-tone="tone ?? 'info'"
    @mouseenter="setHovered(true)"
    @mouseleave="setHovered(false)"
    @focusin="setFocused(true)"
    @focusout="setFocused(($event.currentTarget as HTMLElement).contains($event.relatedTarget as Node | null))"
  >
    <span class="toast-mark"><Icon :name="icon || toneIcons[tone ?? 'info']" :size="17" /></span>
    <div class="toast-copy">
      <span>{{ text }}</span>
      <small v-if="detail">{{ detail }}</small>
    </div>
    <button
      type="button"
      class="btn ghost icon-only toast-close"
      :aria-label="dismissLabel || i18n.t('common.close')"
      @click="emit('dismiss')"
    >
      <Icon name="x" :size="15" />
    </button>
    <div v-if="$slots.default" class="toast-actions"><slot /></div>
  </div>
</template>

<style scoped>
.toast {
  --tone-ink: var(--fg-muted);
  display: grid;
  grid-template-columns: auto minmax(0, 1fr) auto;
  align-items: start;
  gap: 4px 10px;
  padding: 12px 12px 12px 14px;
  border-radius: var(--radius);
  background: color-mix(in srgb, var(--tone-ink) 5%, var(--bg-overlay));
  color: var(--fg);
  border: 1px solid color-mix(in srgb, var(--tone-ink) 25%, var(--line));
  box-shadow: var(--shadow-menu);
  pointer-events: auto;
}
.toast[data-tone='error'] {
  --tone-ink: var(--err);
}
.toast[data-tone='warning'] {
  --tone-ink: var(--warn);
}
.toast[data-tone='success'] {
  --tone-ink: var(--ok);
}
.toast-mark {
  width: 26px;
  height: 26px;
  display: grid;
  place-items: center;
  border-radius: 7px;
  color: var(--tone-ink);
  background: color-mix(in srgb, var(--tone-ink) 13%, transparent);
}
.toast-copy > span {
  font-weight: 600;
}
.toast-copy {
  padding-block: 2px;
  display: grid;
  gap: 3px;
  font-size: 13px;
  line-height: 1.55;
  overflow-wrap: anywhere;
  white-space: pre-line;
  max-height: min(160px, 18dvh);
  overflow-y: auto;
}
.toast-copy small {
  color: var(--fg-subtle);
  font-size: 12px;
}
.toast-close.btn {
  width: 28px;
  height: 28px;
  margin: -3px -4px 0 0;
  color: var(--fg-subtle);
}
@media (pointer: coarse), (max-width: 899px) {
  .toast-close.btn {
    width: 44px;
    height: 44px;
    margin: -8px -8px -4px 0;
  }
}
.toast-actions {
  grid-column: 2 / -1;
  display: flex;
  justify-content: flex-end;
}
</style>

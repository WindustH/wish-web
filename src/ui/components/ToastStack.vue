<script setup lang="ts">
import { useIsMobile } from '../composables/useMedia.ts';
defineProps<{ placement?: 'mobile' | 'desktop' }>();
const mobile = useIsMobile();
</script>
<template>
  <Teleport to="body">
    <div
      class="toast-region"
      :data-placement="placement ?? (mobile ? 'mobile' : 'desktop')"
      aria-live="polite"
      aria-relevant="additions"
    >
      <TransitionGroup name="toast"><slot /></TransitionGroup>
    </div>
  </Teleport>
</template>
<style scoped>
.toast-region {
  --edge: 16px;
  position: fixed;
  z-index: 300;
  right: calc(var(--edge) + env(safe-area-inset-right));
  bottom: calc(var(--edge) + max(env(safe-area-inset-bottom), var(--viewport-bottom, 0px)));
  width: min(360px, calc(100% - 2 * var(--edge) - env(safe-area-inset-left) - env(safe-area-inset-right)));
  display: grid;
  gap: 8px;
  pointer-events: none;
}
.toast-region[data-placement='mobile'] {
  --edge: 10px;
  --entry-offset: -10px;
  top: calc(var(--edge) + env(safe-area-inset-top));
  bottom: auto;
  left: calc(var(--edge) + env(safe-area-inset-left));
  margin-inline: auto;
  width: auto;
  max-width: 440px;
}
.toast-region[data-placement='mobile'] :deep(.toast) {
  padding: 9px 10px;
  border-radius: 13px;
}
.toast-region[data-placement='mobile'] :deep(.toast-actions .btn) {
  font-size: 12px;
  min-height: 32px;
  height: auto;
}

@media (prefers-reduced-motion: no-preference) {
  :deep(.toast-enter-active),
  :deep(.toast-leave-active) {
    transition:
      opacity var(--dur-fast),
      transform var(--dur-fast);
  }
  :deep(.toast-enter-from),
  :deep(.toast-leave-to) {
    opacity: 0;
    transform: translateY(var(--entry-offset, 6px));
  }
}
</style>

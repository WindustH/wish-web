<script setup lang="ts">
import WorkGlyph from './WorkGlyph.vue';
import type { WorkGlyphKind } from './workActivity.ts';
defineProps<{ activity: { glyph: WorkGlyphKind; label: string; detail?: string }; note?: string }>();
</script>
<template>
  <div class="work-readout" :data-activity="activity.glyph" role="status" aria-live="polite" aria-atomic="true">
    <div class="work-symbol">
      <Transition name="work-crossfade"><WorkGlyph :key="activity.glyph" :kind="activity.glyph" /></Transition>
    </div>
    <div class="work-copy">
      <Transition name="work-crossfade"
        ><span :key="activity.label">{{ activity.label }}</span></Transition
      >
      <small v-if="activity.detail || note">{{ [activity.detail, note].filter(Boolean).join(' · ') }}</small>
    </div>
  </div>
</template>
<style scoped>
.work-readout {
  display: flex;
  align-items: flex-start;
  gap: 9px;
  padding: 7px 0;
  min-height: 35px;
  white-space: normal;
}
.work-symbol {
  color: var(--fg-muted);
  position: relative;
  display: grid;
  place-items: center;
  flex: none;
  width: 24px;
  height: 24px;
}
.work-copy {
  position: relative;
  min-width: 0;
  display: grid;
  align-content: center;
  min-height: 24px;
  font: 500 13px/1.5 var(--font);
  color: var(--fg-muted);
}
.work-copy small {
  font: 400 12px/1.5 var(--font);
  color: var(--fg-subtle);
  overflow-wrap: anywhere;
}
@media (prefers-reduced-motion: no-preference) {
  .work-crossfade-enter-active,
  .work-crossfade-leave-active {
    transition: opacity 160ms ease;
  }
  .work-crossfade-enter-from,
  .work-crossfade-leave-to {
    opacity: 0;
  }
}
.work-crossfade-leave-active {
  position: absolute;
  pointer-events: none;
}
.work-copy > .work-crossfade-leave-active {
  top: 0;
  left: 0;
}
</style>

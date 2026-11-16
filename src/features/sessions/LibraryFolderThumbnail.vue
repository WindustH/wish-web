<script setup lang="ts">
import { useId } from 'vue';

const surface = useId();
</script>

<template>
  <span class="library-folder-thumbnail" aria-hidden="true">
    <!-- A cover-sized illustration: the tab, pages and open pocket have their own geometry. -->
    <svg viewBox="0 0 240 180" fill="none" focusable="false">
      <defs>
        <linearGradient :id="surface" x1="120" y1="75" x2="120" y2="151" gradientUnits="userSpaceOnUse">
          <stop class="folder-surface-top" />
          <stop offset="1" class="folder-surface-bottom" />
        </linearGradient>
      </defs>
      <path
        class="folder-back"
        d="M30 46a10 10 0 0 1 10-10h47a12 12 0 0 1 8 3l12 11h91a12 12 0 0 1 12 12v76a12 12 0 0 1-12 12H42a12 12 0 0 1-12-12Z"
      />
      <rect class="folder-page-back" x="46" y="54" width="147" height="87" rx="5" transform="rotate(-3 120 98)" />
      <rect class="folder-page" x="40" y="63" width="160" height="82" rx="5" />
      <path
        class="folder-front"
        :fill="`url(#${surface})`"
        d="M30 79h180a8 8 0 0 1 8 9l-9 52a13 13 0 0 1-13 11H44a13 13 0 0 1-13-11l-9-52a8 8 0 0 1 8-9Z"
      />
      <path class="folder-lip" d="M31 81h178" />
    </svg>
  </span>
</template>

<style scoped>
.library-folder-thumbnail {
  display: block;
  width: 100%;
  aspect-ratio: 4 / 3;
  border: 1px solid transparent;
  border-radius: 10px;
  pointer-events: none;
  user-select: none;
}
svg {
  display: block;
  width: 100%;
  height: 100%;
  overflow: visible;
}
.folder-back {
  fill: color-mix(in srgb, var(--bg-active) 85%, var(--fg-faint));
  stroke: var(--line-strong);
}
.folder-page-back {
  fill: var(--bg-hover);
  stroke: var(--line-strong);
}
.folder-page {
  fill: var(--bg-raised);
  stroke: var(--line-strong);
}
.folder-surface-top {
  stop-color: color-mix(in srgb, var(--bg-raised) 65%, var(--fg-faint));
}
.folder-surface-bottom {
  stop-color: color-mix(in srgb, var(--bg-raised) 82%, var(--fg-faint));
}
.folder-front {
  stroke: var(--line-strong);
}
.folder-lip {
  stroke: var(--bg-overlay);
  stroke-linecap: round;
  opacity: 0.6;
}
</style>

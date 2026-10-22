<script setup lang="ts">
import { albumColumns, ALBUM_GAP, ALBUM_WIDTH } from '../imageAlbums.ts';
import { tr } from '../../../core/i18n/tr.ts';
defineProps<{ count: number }>();
</script>

<template>
  <div class="image-grid" role="group" :aria-label="tr(`${count} 张图片的图集`, `Album of ${count} images`)"
    :style="{ gridTemplateColumns: `repeat(${albumColumns(count)}, minmax(0, 1fr))`, gap: `${ALBUM_GAP}px`, maxWidth: `${ALBUM_WIDTH}px` }">
    <slot />
  </div>
</template>

<style scoped>
.image-grid { display:grid; width:100%; min-width:0; border-radius:12px; overflow:hidden; }
.image-grid :deep(.entry-anchor), .image-grid :deep(.message-context) { min-width:0; }
.image-grid :deep(.entry) { display:block; padding:0; }
.image-grid :deep(.bubble) { width:100%; max-width:100%; }
.image-grid :deep(.message-context.user[data-state="open"] .entry.user .bubble) { transform:none; box-shadow:none; }
.image-grid :deep(.message-image) { margin:0; }
.image-grid :deep(figcaption) { display:none; }
.image-grid :deep(img), .image-grid :deep(.entry.user .bubble.image-bubble img) {
  display:block; width:100%; height:auto; max-width:100%; max-height:none; aspect-ratio:1; object-fit:cover; margin:0; border-radius:0;
}
.image-grid :deep(.message-image), .image-grid > :deep(.entry-anchor) { aspect-ratio:1; background:var(--bg-raised); }
.image-grid :deep(img:focus-visible) { outline:2px solid var(--focus-ring); outline-offset:-3px; }
.image-grid :deep(.entry-anchor.located), :global(.history-target) .image-grid { animation:located-content 3s ease-out; }
@media (prefers-reduced-motion:reduce) {
  .image-grid :deep(.entry-anchor.located), :global(.history-target) .image-grid { animation:none; box-shadow:0 0 0 2px var(--accent-soft); }
}
</style>

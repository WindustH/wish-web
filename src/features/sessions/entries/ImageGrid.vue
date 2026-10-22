<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import { albumColumns, albumPreview, ALBUM_ASPECT_RATIO, ALBUM_GAP, ALBUM_WIDTH } from '../imageAlbums.ts';
import { tr } from '../../../core/i18n/tr.ts';
import Modal from '../../../ui/components/Modal.vue';
const props = defineProps<{ count: number; forceOpen?: boolean }>();
const open = ref(false);
const preview = computed(() => albumPreview(props.count));
const spacing = { gap: `${ALBUM_GAP}px`, '--album-ratio': ALBUM_ASPECT_RATIO };
// Search can locate a picture beyond the eight shown in the transcript preview.
watch(() => props.forceOpen, value => { if (value) open.value = true; }, { immediate: true });
</script>

<template>
  <div class="image-album" :style="{ maxWidth: `${ALBUM_WIDTH}px` }">
    <div class="image-grid" role="group" :aria-label="tr(`${count} 张图片的图集`, `Album of ${count} images`)"
      :style="{ ...spacing, gridTemplateColumns: `repeat(${albumColumns(count)}, minmax(0, 1fr))` }">
      <slot :limit="preview.visible" />
      <button v-if="preview.hidden" type="button" class="image-grid-more" aria-haspopup="dialog" :aria-expanded="open"
        :aria-label="tr(`查看全部 ${count} 张图片，还有 ${preview.hidden} 张未显示`, `View all ${count} images; ${preview.hidden} more images`)" @click.stop="open = true">
        +{{ preview.hidden }}
      </button>
    </div>
    <Modal :open="open" wide :title="tr(`图集 · ${count} 张图片`, `Album · ${count} images`)" content-class="image-album-window" @close="open = false">
      <div class="image-grid image-grid-all" :style="spacing" role="group" :aria-label="tr('全部图片', 'All images')">
        <slot :limit="count" />
      </div>
    </Modal>
  </div>
</template>

<style scoped>
.image-album { width:100%; min-width:0; }
.image-grid { display:grid; width:100%; min-width:0; }
.image-grid-all { grid-template-columns:repeat(auto-fit, minmax(min(96px, 100%), 1fr)); }
.image-grid :deep(.entry-anchor), .image-grid :deep(.message-context) { min-width:0; }
.image-grid :deep(.entry) { display:block; padding:0; }
.image-grid :deep(.bubble) { width:100%; max-width:100%; }
.image-grid :deep(.message-context.user[data-state="open"] .entry.user .bubble) { transform:none; box-shadow:none; }
.image-grid :deep(.message-image) { margin:0; }
.image-grid :deep(figcaption) { display:none; }
.image-grid :deep(img), .image-grid :deep(.entry.user .bubble.image-bubble img) {
  display:block; width:100%; height:auto; max-width:100%; max-height:none; aspect-ratio:var(--album-ratio); object-fit:cover; margin:0; border-radius:8px;
}
.image-grid :deep(.message-image), .image-grid > :deep(.entry-anchor), .image-grid-more { aspect-ratio:var(--album-ratio); border-radius:8px; overflow:hidden; background:var(--bg-raised); }
.image-grid-more { display:grid; place-items:center; min-width:0; padding:0; border:1px solid var(--line); color:var(--fg-muted); font:500 20px/1 var(--font); font-variant-numeric:tabular-nums; cursor:pointer; }
@media (hover:hover) { .image-grid-more:hover { background:var(--bg-hover); color:var(--fg); } }
.image-grid-more:focus-visible { outline:2px solid var(--focus-ring); outline-offset:2px; }
.image-grid :deep(img:focus-visible) { outline:2px solid var(--focus-ring); outline-offset:-3px; }
.image-grid :deep(.entry-anchor.located), :global(.history-target) .image-grid { animation:located-content 3s ease-out; }
@media (prefers-reduced-motion:reduce) {
  .image-grid :deep(.entry-anchor.located), :global(.history-target) .image-grid { animation:none; box-shadow:0 0 0 2px var(--accent-soft); }
}
:global(.modal-card.image-album-window) { width:min(94vw, 620px); }
:global(.image-album-window .modal-body) { max-height:min(68dvh, 640px); overflow:auto; overscroll-behavior:contain; }
</style>

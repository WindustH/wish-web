<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import { albumColumns, albumPreview, ALBUM_ASPECT_RATIO, ALBUM_GAP, ALBUM_WIDTH } from '../imageAlbums.ts';
import { tr } from '../../../core/i18n/tr.ts';
import Modal from '../../../ui/components/Modal.vue';
import VirtualImageGrid from './VirtualImageGrid.vue';
const props = defineProps<{ count: number; forceOpen?: boolean; locateIndex?: number }>();
const open = ref(false);
const preview = computed(() => albumPreview(props.count));
const spacing = { gap: `${ALBUM_GAP}px`, '--album-ratio': ALBUM_ASPECT_RATIO };
// Search can locate a picture beyond the eight shown in the transcript preview.
watch(() => props.forceOpen, value => { if (value) open.value = true; }, { immediate: true });
</script>

<template>
  <div class="image-album" :style="{ maxWidth: `${ALBUM_WIDTH}px` }">
    <div class="image-grid album-thumbnails" role="group" :aria-label="tr(`${count} 张图片的图集`, `Album of ${count} images`)"
      :style="{ ...spacing, gridTemplateColumns: `repeat(${albumColumns(count)}, minmax(0, 1fr))` }">
      <slot :start="0" :limit="preview.visible" />
      <button v-if="preview.hidden" type="button" class="image-grid-more" aria-haspopup="dialog" :aria-expanded="open"
        :aria-label="tr(`查看全部 ${count} 张图片，还有 ${preview.hidden} 张未显示`, `View all ${count} images; ${preview.hidden} more images`)" @click.stop="open = true">
        +{{ preview.hidden }}
      </button>
    </div>
    <Modal :open="open" wide :title="tr(`图集 · ${count} 张图片`, `Album · ${count} images`)" content-class="image-album-window" @close="open = false">
      <div class="album-thumbnails">
        <VirtualImageGrid v-slot="range" :count="count" :locate-index="locateIndex">
          <slot v-bind="range" />
        </VirtualImageGrid>
      </div>
    </Modal>
  </div>
</template>

<style scoped>
.image-album { width:100%; min-width:0; }
.image-grid { display:grid; width:100%; min-width:0; }
.album-thumbnails :deep(.entry-anchor), .album-thumbnails :deep(.message-context) { min-width:0; }
.album-thumbnails :deep(.entry) { display:block; padding:0; }
.album-thumbnails :deep(.bubble) { width:100%; max-width:100%; }
.album-thumbnails :deep(.message-context.user[data-state="open"] .entry.user .bubble) { transform:none; box-shadow:none; }
.album-thumbnails :deep(.message-image) { margin:0; }
.album-thumbnails :deep(figcaption) { display:none; }
.album-thumbnails :deep(img), .album-thumbnails :deep(.entry.user .bubble.image-bubble img) {
  display:block; width:100%; height:auto; max-width:100%; max-height:none; aspect-ratio:var(--album-ratio); object-fit:cover; margin:0; border-radius:8px;
}
.album-thumbnails :deep(.message-image), .album-thumbnails :deep(.entry-anchor), .image-grid-more { aspect-ratio:var(--album-ratio); border-radius:8px; overflow:hidden; background:var(--bg-raised); }
.image-grid-more { display:grid; place-items:center; min-width:0; padding:0; border:1px solid var(--line); color:var(--fg-muted); font:500 20px/1 var(--font); font-variant-numeric:tabular-nums; cursor:pointer; }
@media (hover:hover) { .image-grid-more:hover { background:var(--bg-hover); color:var(--fg); } }
.image-grid-more:focus-visible { outline:2px solid var(--focus-ring); outline-offset:2px; }
.album-thumbnails :deep(img:focus-visible) { outline:2px solid var(--focus-ring); outline-offset:-3px; }
.album-thumbnails :deep(.entry-anchor.located), :global(.history-target) .image-grid { animation:located-content 3s ease-out; }
@media (prefers-reduced-motion:reduce) {
  .album-thumbnails :deep(.entry-anchor.located), :global(.history-target) .image-grid { animation:none; box-shadow:0 0 0 2px var(--accent-soft); }
}
:global(.modal-card.image-album-window) { width:min(94vw, 620px); }
:global(.image-album-window .modal-body) { max-height:min(68dvh, 640px); overflow:auto; overscroll-behavior:contain; }
</style>

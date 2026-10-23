<script setup lang="ts">
import { computed, ref } from 'vue';
import VirtualRows from '../../../ui/components/VirtualRows.vue';
import { ALBUM_ASPECT_RATIO, ALBUM_GAP } from '../imageAlbums.ts';
import { tr } from '../../../core/i18n/tr.ts';
const props = defineProps<{ count: number; locateIndex?: number }>();
const width = ref(560);
const columns = computed(() => Math.max(1, Math.floor((width.value + ALBUM_GAP) / (96 + ALBUM_GAP))));
const rowSize = computed(() => (width.value - (columns.value - 1) * ALBUM_GAP) / columns.value / ALBUM_ASPECT_RATIO + ALBUM_GAP);
</script>

<template>
  <VirtualRows :count="Math.ceil(count / columns)" :row-size="rowSize" :overscan="1" :label="tr('全部图片', 'All images')"
    :locate-index="locateIndex == null ? undefined : Math.floor(locateIndex / columns)" @resize="width = $event">
    <template #default="{ index }">
      <div class="image-grid image-grid-all" :style="{ display:'grid', gridTemplateColumns:`repeat(${columns}, minmax(0, 1fr))`, gap:`${ALBUM_GAP}px`, '--album-ratio':ALBUM_ASPECT_RATIO }">
        <slot :start="index * columns" :limit="Math.min(count, (index + 1) * columns)" />
      </div>
    </template>
  </VirtualRows>
</template>

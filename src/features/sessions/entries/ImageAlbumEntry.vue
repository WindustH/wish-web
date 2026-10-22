<script setup lang="ts">
import { computed } from 'vue';
import type { ImageAlbumItem } from '../imageAlbums.ts';
import ImageGrid from './ImageGrid.vue';
import UserBubble from './UserBubble.vue';
import AssistantEntry from './AssistantEntry.vue';

const props = defineProps<{ item: ImageAlbumItem; session?: string; forcedKeys?: ReadonlySet<string> }>();
const images = computed(() => props.item.items.flatMap(item => item.blocks.map((block, index) => ({
  block, seq: item.entry.seq, key: `${item.key}i${index}`,
}))));
// AssistantEntry keeps the first image's preceding activity attached to the same row.
const assistant = computed(() => ({ ...props.item.items[0], blocks: images.value.map(image => image.block),
  before: props.item.items.flatMap(item => item.before ?? []), imageSeqs: images.value.map(image => image.seq) }));
</script>

<template>
  <div v-if="item.items[0]?.entry.kind === 'user_message'" class="entry user">
    <ImageGrid class="user-album" :count="images.length">
      <div v-for="image in images" :key="image.key" class="entry-anchor" :data-seq="image.seq">
        <UserBubble :block="image.block" />
      </div>
    </ImageGrid>
  </div>
  <AssistantEntry v-else :item="assistant" :session="session" :forced-keys="forcedKeys" />
</template>

<style scoped>
.user-album { width:92%; }
@media (max-width:599px) { .user-album { width:100%; } }
</style>

<script setup lang="ts">
import { computed } from 'vue';
import type { ImageAlbumItem } from '../imageAlbums.ts';
import ImageGrid from './ImageGrid.vue';
import UserBubble from './UserBubble.vue';
import AssistantEntry from './AssistantEntry.vue';
import HistoryChips from './HistoryChips.vue';

const props = defineProps<{ item: ImageAlbumItem; session?: string; forcedKeys?: ReadonlySet<string>; locateSeq?: number }>();
const images = computed(() => props.item.items.flatMap(item => item.blocks.map((block, index) => ({
  block, seq: item.entry.seq, key: `${item.key}i${index}`,
}))));
const activity = computed(() => props.item.items.flatMap(item => item.before ?? []));
const locateIndex = computed(() => props.locateSeq == null ? undefined : images.value.findIndex(image => image.seq === props.locateSeq));
// AssistantEntry keeps the first image's preceding activity attached to the same row.
const assistant = computed(() => ({ ...props.item.items[0], blocks: images.value.map(image => image.block),
  before: activity.value, imageSeqs: images.value.map(image => image.seq) }));
</script>

<template>
  <div v-if="item.items[0]?.entry.kind === 'user_message'">
    <div v-if="activity.length" class="album-activity">
      <HistoryChips :chips="activity" :session="session" :forced-keys="forcedKeys" :locate-seq="locateSeq" />
    </div>
    <div class="entry user">
      <ImageGrid v-slot="{ start, limit }" class="user-album" :count="images.length" :force-open="forcedKeys?.has(item.key)" :locate-index="locateIndex">
        <div v-for="image in images.slice(start, limit)" :key="image.key" class="entry-anchor" :data-seq="image.seq">
          <UserBubble :block="image.block" />
        </div>
      </ImageGrid>
    </div>
  </div>
  <AssistantEntry v-else :item="assistant" :session="session" :forced-keys="forcedKeys" :locate-seq="locateSeq" />
</template>

<style scoped>
/* Ghost hosts only; their actual windows teleport to the dialog layer. */
.album-activity { display:none; }
.user-album { width:92%; }
@media (max-width:599px) { .user-album { width:100%; } }
</style>

<script setup lang="ts">
import { computed } from 'vue';
import type { ImageAlbumItem } from '../../chat/imageAlbums.ts';
import ImageGrid from '../../chat/entries/ImageGrid.vue';
import UserBubble from '../../chat/entries/UserBubble.vue';
import AssistantEntry from './AssistantEntry.vue';

const props = defineProps<{
  item: ImageAlbumItem;
  session?: string;
  forcedKeys?: ReadonlySet<string>;
  locateSeq?: number;
}>();
const images = computed(() =>
  props.item.items.flatMap((item) =>
    item.blocks.map((block, index) => ({
      block,
      seq: item.entry.seq,
      key: `${item.key}i${index}`,
    })),
  ),
);
const locateIndex = computed(() =>
  props.locateSeq == null ? undefined : images.value.findIndex((image) => image.seq === props.locateSeq),
);
// The album shares the assistant message renderer; its activities are owned by the session.
const assistant = computed(() => ({
  ...props.item.items[0],
  blocks: images.value.map((image) => image.block),
  imageSeqs: images.value.map((image) => image.seq),
}));
</script>

<template>
  <div v-if="item.items[0]?.entry.kind === 'user_message'">
    <div class="entry user">
      <ImageGrid
        v-slot="{ start, limit }"
        class="user-album"
        :count="images.length"
        :force-open="forcedKeys?.has(item.key)"
        :locate-index="locateIndex"
      >
        <div v-for="image in images.slice(start, limit)" :key="image.key" class="entry-anchor" :data-seq="image.seq">
          <UserBubble :block="image.block" />
        </div>
      </ImageGrid>
    </div>
  </div>
  <AssistantEntry v-else :item="assistant" :session="session" :forced-keys="forcedKeys" :locate-seq="locateSeq" />
</template>

<style scoped>
.user-album {
  width: 92%;
}
@media (max-width: 599px) {
  .user-album {
    width: 100%;
  }
}
</style>

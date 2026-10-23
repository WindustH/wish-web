<script setup lang="ts">
import { userBubbles, type ContentBlock } from '../../../core/api/userContent.ts';
import { computed } from 'vue';
import UserBubble from './UserBubble.vue';
import ImageGrid from './ImageGrid.vue';
import { imageParts } from '../imageAlbums.ts';
// A history item's message, or the blocks of one shown elsewhere (`content`), such as a group's.
const props = defineProps<{ item?: any; content?: ContentBlock[] }>();
const bubbles = computed(() => userBubbles(props.content ?? props.item.entry?.payload?.content));
const groups = computed(() => {
  const result: { files?: any[]; images?: ContentBlock[]; block?: any }[] = [];
  for (const part of imageParts(bubbles.value)) {
    if (part.type === 'album') { result.push({ images: part.blocks }); continue; }
    const block = part.block;
    if (block.type === 'file') {
      const last = result.at(-1);
      if (last?.files) last.files.push(block);
      else result.push({ files: [block] });
    } else result.push({ block });
  }
  return result;
});
</script>
<template>
  <div class="user-message-parts">
    <template v-for="(group, index) in groups" :key="index">
      <div v-if="group.images" class="entry user">
        <ImageGrid v-slot="{ start, limit }" class="user-album" :count="group.images.length">
          <UserBubble v-for="(image, imageIndex) in group.images.slice(start, limit)" :key="start + imageIndex" :block="image" />
        </ImageGrid>
      </div>
      <div v-else-if="group.files" class="file-group">
        <UserBubble v-for="(file, fileIndex) in group.files" :key="fileIndex" :block="file" />
      </div>
      <UserBubble v-else :block="group.block" />
    </template>
  </div>
</template>
<style scoped>
.user-message-parts { display:flex; flex-direction:column; gap:8px; }
.user-album { width:92%; }
@media (max-width:599px) { .user-album { width:100%; } }

.file-group { display:flex; justify-content:flex-end; flex-wrap:wrap; gap:8px; min-width:0; }
.file-group :deep(.message-context) { flex:0 1 auto; width:auto; max-width:100%; min-width:0; }
.file-group :deep(.entry.user .bubble) { width:auto; max-width:100%; }
.file-group :deep(.message-file) { width:max-content; min-width:min(180px,calc(100vw - 48px)); max-width:min(340px,100%); box-sizing:border-box; }
</style>

<script setup lang="ts">
import { userBubbles } from '../../../core/api/userContent.js';
import { computed } from 'vue';
import UserBubble from './UserBubble.vue';
const props = defineProps<{ item: any }>();
const bubbles = computed(() => userBubbles(props.item.entry?.payload?.content));
const groups = computed(() => {
  const result: { files?: any[]; block?: any }[] = [];
  for (const block of bubbles.value) {
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
      <div v-if="group.files" class="file-group">
        <UserBubble v-for="(file, fileIndex) in group.files" :key="fileIndex" :block="file" />
      </div>
      <UserBubble v-else :block="group.block" />
    </template>
  </div>
</template>
<style scoped>
.user-message-parts { display:flex; flex-direction:column; gap:8px; }
.file-group { display:flex; justify-content:flex-end; flex-wrap:wrap; gap:8px; min-width:0; }
.file-group :deep(.message-context) { flex:0 1 auto; width:auto; max-width:100%; min-width:0; }
.file-group :deep(.entry.user .bubble) { width:auto; max-width:100%; }
.file-group :deep(.message-file) { width:max-content; min-width:min(180px,calc(100vw - 48px)); max-width:min(340px,100%); box-sizing:border-box; }
</style>

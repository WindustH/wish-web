<script setup lang="ts">
import ToolImage from '../../domain/media/ToolImage.vue';
import { blobUrl } from '../../core/api/endpoints.ts';
defineProps<{ session: string; model?: string; images: { id: string; mime_type: string; path: string }[] }>();
</script>
<template>
  <section class="novelai-result">
    <header>
      NovelAI<span v-if="model"> · {{ model }}</span>
    </header>
    <ToolImage
      v-for="image in images"
      :key="image.id"
      :src="blobUrl(`${session}/${image.id}`)"
      :mime="image.mime_type"
      :path="image.path"
    />
  </section>
</template>
<style scoped>
.novelai-result {
  display: grid;
  gap: 12px;
  min-width: 0;
}
header {
  color: var(--fg-muted);
  font-size: 12px;
  overflow-wrap: anywhere;
}
</style>

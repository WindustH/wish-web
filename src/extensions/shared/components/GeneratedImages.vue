<script setup lang="ts">
import ToolImage from '../../../domain/media/ToolImage.vue';
import { blobUrl } from '../../../core/api/endpoints.ts';
defineProps<{ session: string; images: { id: string; mime_type: string; path: string }[] }>();
</script>
<template>
  <ToolImage
    v-for="image in images"
    :key="image.id"
    :src="blobUrl(`${session}/${image.id}`)"
    :mime="image.mime_type"
    :path="image.path"
  />
</template>

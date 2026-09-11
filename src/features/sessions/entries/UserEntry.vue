<script setup lang="ts">
import { computed } from 'vue';
import CopyButton from '../../../ui/components/CopyButton.vue';
import { blobUrl } from '../../../core/api/endpoints.js';
// Local (just-sent) attachments render from their object URL; durable
// history carries image blocks with base64 data or a content-addressed
// sha256 — both must show, or reloaded conversations silently lose their
// pictures (root review).
const props = defineProps<{ item: any }>();
const blocks = () => props.item.entry?.payload?.content || [];
const joined = computed(() => blocks().filter((b: any) => b.type === 'text').map((b: any) => b.text).join('\n\n'));
const images = () => props.item.entry?.payload?.__images || [];
const durableImages = () => images().length ? [] : blocks().filter((b: any) => b.type === 'image');
const blobSrc = (b: any) => b.data_base64
  ? `data:${b.mime_type || 'image/png'};base64,${b.data_base64}`
  : b.sha256 ? blobUrl(b.sha256) : null;
</script>

<template>
  <div class="entry user">
    <div class="bubble">
      <div v-for="(b, i) in blocks().filter((b: any) => b.type === 'text')" :key="i">{{ b.text }}</div>
      <img v-for="(img, i) in images()" :key="'i' + i" :src="img.localUrl" :alt="img.name || 'image'" loading="lazy" />
      <template v-for="(b, i) in durableImages()" :key="'b' + i">
        <img v-if="blobSrc(b)" :src="blobSrc(b)!" alt="" loading="lazy" />
      </template>
    </div>
    <div v-if="joined.trim()" class="meta">
      <CopyButton :text="joined" />
    </div>
  </div>
</template>

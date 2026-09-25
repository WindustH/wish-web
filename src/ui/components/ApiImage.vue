<script setup lang="ts">
// An <img> for backend URLs. A backend reached directly needs its access token,
// which an <img> cannot send, so those images are fetched and shown as blobs.
import { ref, watch } from 'vue';
import { apiFetch, needsAccessToken } from '../../core/api/client.ts';

const props = defineProps<{ src: string }>();
const url = ref('');
watch(() => props.src, async (src, _, onCleanup) => {
  if (!needsAccessToken(src)) { url.value = src; return; }
  const controller = new AbortController();
  let objectUrl = '';
  onCleanup(() => { controller.abort(); if (objectUrl) URL.revokeObjectURL(objectUrl); });
  url.value = '';
  try {
    const response = await apiFetch(src, { signal: controller.signal });
    if (!response.ok) return;
    const blob = await response.blob();
    if (controller.signal.aborted) return;
    objectUrl = URL.createObjectURL(blob);
    url.value = objectUrl;
  } catch { /* Left empty, like an image that failed to load. */ }
}, { immediate: true });
</script>

<template>
  <img v-if="url" :src="url" />
</template>

<script setup lang="ts">
// An <img> for backend URLs. A backend reached directly needs its access token,
// which an <img> cannot send, so those images are fetched and shown as blobs.
import { ref, shallowRef, useAttrs, watch } from 'vue';
import { apiFetch, needsAccessToken } from '../../core/api/client.ts';
import { openImageLightbox } from '../imageLightbox.ts';

// `zoom` off for a picture that is a control of its own: a tool's image toggles its own size.
const props = withDefaults(defineProps<{ src: string; zoom?: boolean }>(), { zoom: true });
const attrs = useAttrs();
const blob = shallowRef<Blob>();
const onOpen = () => { if (props.zoom && url.value) openImageLightbox(url.value, String(attrs.alt ?? ''), blob.value); };
const url = ref('');
watch(() => props.src, async (src, _, onCleanup) => {
  blob.value = undefined;
  if (!needsAccessToken(src)) { url.value = src; return; }
  const controller = new AbortController();
  let objectUrl = '';
  onCleanup(() => { controller.abort(); if (objectUrl) URL.revokeObjectURL(objectUrl); });
  url.value = '';
  try {
    const response = await apiFetch(src, { signal: controller.signal });
    if (!response.ok) return;
    const bytes = await response.blob();
    if (controller.signal.aborted) return;
    blob.value = bytes;
    objectUrl = URL.createObjectURL(bytes);
    url.value = objectUrl;
  } catch { /* Left empty, like an image that failed to load. */ }
}, { immediate: true });
</script>

<template>
  <img v-if="url" :src="url" :class="{ zoomable: zoom }" :tabindex="zoom ? 0 : undefined" :role="zoom ? 'button' : undefined"
    @click="onOpen" @keydown.enter.prevent="onOpen" @keydown.space.prevent="onOpen" />
</template>

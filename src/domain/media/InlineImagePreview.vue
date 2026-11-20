<script setup lang="ts">
import { ref, watch } from 'vue';
import type { InlineImage } from './useOpenImage.ts';
import { apiFetch, needsAccessToken } from '../../core/api/client.ts';
import { tr } from '../../core/i18n/tr.ts';
import { describeError } from '../../core/i18n/errorMessages.ts';
import LoadingState from '../../ui/components/LoadingState.vue';
import ImagePreview from './ImagePreview.vue';
const props = defineProps<{ image: InlineImage; toolbar?: HTMLElement }>();
const source = ref('');
const error = ref('');
const attempt = ref(0);
watch(
  [() => props.image, attempt],
  async ([image], _, cleanup) => {
    source.value = error.value = '';
    if (image.bytes && image.mime !== 'image/tiff') {
      const url = URL.createObjectURL(image.bytes);
      source.value = url;
      cleanup(() => URL.revokeObjectURL(url));
      return;
    }
    if (image.mime === 'image/tiff') {
      error.value = tr(
        '此图片将在发送时自动转换；可在库中查看预览。',
        'This image will be converted when sent; preview it in the Library.',
      );
      return;
    }
    if (!needsAccessToken(image.src)) {
      source.value = image.src;
      return;
    }
    const request = new AbortController();
    let url: string | undefined;
    cleanup(() => {
      request.abort();
      if (url) URL.revokeObjectURL(url);
    });
    try {
      const response = await apiFetch(image.src, { signal: request.signal });
      if (!response.ok) throw Error(`HTTP ${response.status}`);
      const bytes = await response.blob();
      if (!request.signal.aborted) source.value = url = URL.createObjectURL(bytes);
    } catch (cause) {
      if (!request.signal.aborted) error.value = describeError(cause).message;
    }
  },
  { immediate: true },
);
</script>
<template>
  <div v-if="error" class="library-state" role="alert">
    <p>{{ error }}</p>
    <button v-if="image.mime !== 'image/tiff'" class="btn sm" @click="attempt++">{{ tr('重试', 'Retry') }}</button>
  </div>
  <ImagePreview
    v-else-if="source"
    :key="source"
    :src="source"
    :alt="image.name || tr('图片', 'Image')"
    :toolbar="toolbar"
    @error="error = tr('图片加载失败', 'Could not load image')"
  />
  <LoadingState v-else :label="tr('正在读取图片…', 'Loading image…')" />
</template>

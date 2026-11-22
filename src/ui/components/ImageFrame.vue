<script setup lang="ts">
import { computed, ref } from 'vue';
import { frameSize, rememberImage } from '../imageFrame.ts';
import { tr } from '../../core/i18n/tr.ts';
import Icon from './Icon.vue';

const props = defineProps<{
  source: string;
  url: string;
  alt: string;
  dimensions?: readonly number[];
  failed?: boolean;
  placeholder?: string;
}>();
const emit = defineEmits<{ load: [event: Event]; error: [] }>();
const loaded = ref('');
const broken = ref('');
// Freeze the slot for this source. Learning a legacy image's dimensions must
// benefit its next mount without moving the current reader's scroll position.
const style = computed(() => frameSize(props.source, props.dimensions));
function finish(event: Event) {
  const img = event.target as HTMLImageElement;
  if (img.getAttribute('src') !== props.url) return;
  rememberImage(props.source, img);
  loaded.value = props.url;
  emit('load', event);
}
</script>
<template>
  <span class="image-frame" :style="style" :class="{ 'image-ready': url && loaded === url }">
    <img v-if="placeholder && (!url || loaded !== url)" class="image-placeholder" :src="placeholder" alt="" />
    <img
      v-if="url"
      :key="url"
      :src="url"
      :alt="alt"
      decoding="async"
      @load="finish"
      @error="
        broken = url;
        $emit('error');
      "
    />
    <span
      v-if="!placeholder && (failed || (url && broken === url))"
      class="image-failed"
      role="img"
      :aria-label="tr('图片加载失败', 'Image unavailable')"
      ><Icon name="image"
    /></span>
  </span>
</template>

<style scoped>
.image-frame > .image-placeholder {
  opacity: 1;
}
</style>

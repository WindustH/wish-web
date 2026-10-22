<script setup lang="ts">
// The image, whole: as large as the window allows, on a dimmed page. A click anywhere, the close
// button, or Escape puts it away; focus goes to the close button and back to the page after.
import { nextTick, ref, watch } from 'vue';
import Icon from './Icon.vue';
import { closeImageLightbox, imageLightbox } from '../imageLightbox.ts';
import { tr } from '../../core/i18n/tr.ts';

const closeButton = ref<HTMLElement | null>(null);
let returnTo: HTMLElement | null = null;

function onKey(event: KeyboardEvent) {
  if (event.key !== 'Escape') return;
  event.stopPropagation();
  closeImageLightbox();
}

watch(imageLightbox, async (image, previous) => {
  if (image) {
    returnTo = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    window.addEventListener('keydown', onKey, true);
    await nextTick();
    closeButton.value?.focus();
    return;
  }
  window.removeEventListener('keydown', onKey, true);
  if (previous) returnTo?.focus?.();
  returnTo = null;
}, { immediate: true });
</script>

<template>
  <Teleport to="body">
    <div v-if="imageLightbox" class="image-lightbox" role="dialog" aria-modal="true" :aria-label="imageLightbox.alt || tr('图片', 'Image')" @click="closeImageLightbox">
      <img class="image-lightbox-img" :src="imageLightbox.src" :alt="imageLightbox.alt || ''" @click.stop="closeImageLightbox" />
      <button ref="closeButton" type="button" class="btn ghost icon-only image-lightbox-close" :aria-label="tr('关闭', 'Close')" @click.stop="closeImageLightbox">
        <Icon name="x" />
      </button>
    </div>
  </Teleport>
</template>

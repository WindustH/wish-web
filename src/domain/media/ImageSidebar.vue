<script setup lang="ts">
import { computed, onBeforeUnmount, ref } from 'vue';
import { sidebarImage, closeSidebarImage } from '../../ui/imageSidebar.ts';
import { useBackLayer } from '../../ui/composables/useBackLayer.ts';
import { useIsMobile } from '../../ui/composables/useMedia.ts';
import { tr } from '../../core/i18n/tr.ts';
import IslandSidebar from '../../ui/components/IslandSidebar.vue';
import InlineImagePreview from './InlineImagePreview.vue';

const mobile = useIsMobile();
const toolbar = ref<HTMLElement>();
const title = computed(() => sidebarImage.value?.name || tr('图片', 'Image'));
useBackLayer(
  () => !!sidebarImage.value,
  closeSidebarImage,
  () => 200,
);
onBeforeUnmount(closeSidebarImage);
</script>
<template>
  <Teleport to="body">
    <div v-if="sidebarImage" class="image-sidebar-layer">
      <IslandSidebar
        standalone
        :open="true"
        :overlay="mobile"
        :title="title"
        @back="closeSidebarImage"
        @close="closeSidebarImage"
      >
        <template #toolbar><div ref="toolbar" /></template>
        <InlineImagePreview :image="sidebarImage" :toolbar="toolbar" />
      </IslandSidebar>
    </div>
  </Teleport>
</template>
<style scoped>
.image-sidebar-layer {
  position: fixed;
  inset: 0;
  z-index: 200;
  pointer-events: auto;
}
</style>

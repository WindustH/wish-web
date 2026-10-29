<script setup lang="ts">
import MediaJobs from '../shared/components/MediaJobs.vue';
import type { MediaJob } from '../../core/mediaGeneration.ts';
import { tr } from '../../core/i18n/tr.ts';
defineProps<{ session: string; jobs: MediaJob[]; collection?: boolean }>();
</script>
<template>
  <section class="xai-video-result">
    <header>xAI Video</header>
    <MediaJobs
      :session="session"
      :jobs="jobs"
      :collection="collection"
      :empty-text="tr('此会话还没有 xAI 视频任务。', 'This session has no xAI video jobs yet.')"
    />
  </section>
</template>
<style scoped>
.xai-video-result {
  display: grid;
  gap: 12px;
  min-width: 0;
}
header {
  color: var(--fg-muted);
  font-size: 12px;
}
</style>

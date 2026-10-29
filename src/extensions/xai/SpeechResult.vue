<script setup lang="ts">
import MediaJobs from '../shared/components/MediaJobs.vue';
import type { MediaJob } from '../../core/mediaGeneration.ts';
import { tr } from '../../core/i18n/tr.ts';
defineProps<{ session: string; jobs: MediaJob[]; collection?: boolean }>();
</script>
<template>
  <section class="xai-speech-result">
    <header>xAI Speech</header>
    <MediaJobs
      :session="session"
      :jobs="jobs"
      :collection="collection"
      :empty-text="tr('此会话还没有 xAI 语音任务。', 'This session has no xAI speech jobs yet.')"
    />
  </section>
</template>
<style scoped>
.xai-speech-result {
  display: grid;
  gap: 12px;
  min-width: 0;
}
header {
  color: var(--fg-muted);
  font-size: 12px;
}
</style>

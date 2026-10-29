<script setup lang="ts">
import MediaJobs from '../shared/components/MediaJobs.vue';
import type { MediaJob } from '../../core/mediaGeneration.ts';
import { tr } from '../../core/i18n/tr.ts';
defineProps<{ session: string; jobs: MediaJob[]; collection?: boolean }>();
</script>
<template>
  <section class="minimax-result">
    <header>MiniMax Speech</header>
    <MediaJobs
      :session="session"
      :jobs="jobs"
      :collection="collection"
      :empty-text="tr('此会话还没有 MiniMax 语音任务。', 'This session has no MiniMax speech jobs yet.')"
    />
  </section>
</template>
<style scoped>
.minimax-result {
  display: grid;
  gap: 12px;
  min-width: 0;
}
header {
  color: var(--fg-muted);
  font-size: 12px;
}
</style>

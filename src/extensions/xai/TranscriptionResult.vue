<script setup lang="ts">
import Transcript from '../shared/components/Transcript.vue';
import type { MediaArtifact } from '../../core/mediaGeneration.ts';
defineProps<{
  session: string;
  output: {
    text: string;
    model?: string;
    language?: string;
    truncated?: boolean;
    word_timestamps?: boolean;
    transcript?: MediaArtifact;
  };
}>();
</script>
<template>
  <section class="xai-transcription-result">
    <header>
      xAI<span v-if="output.model"> · {{ output.model }}</span>
    </header>
    <Transcript :session="session" :output="output" />
  </section>
</template>
<style scoped>
.xai-transcription-result {
  display: grid;
  gap: 12px;
  min-width: 0;
}
header {
  color: var(--fg-muted);
  font-size: 12px;
  overflow-wrap: anywhere;
}
</style>

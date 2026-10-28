<script setup lang="ts">
import { blobUrl } from '../../../core/api/endpoints.ts';
import type { MediaArtifact } from '../../../core/mediaGeneration.ts';
import { tr } from '../../../core/i18n/tr.ts';
import { downloadApiFile } from '../../../ui/download.ts';
import CopyButton from '../../../ui/components/CopyButton.vue';
defineProps<{
  session: string;
  output: {
    text: string;
    language?: string;
    truncated?: boolean;
    word_timestamps?: boolean;
    transcript?: MediaArtifact;
  };
}>();
</script>
<template>
  <section class="tool-transcript">
    <div class="transcript-actions">
      <span v-if="output.language">{{ tr('语言', 'Language') }} · {{ output.language }}</span>
      <span v-if="output.word_timestamps">{{ tr('包含时间戳', 'Includes timestamps') }}</span>
      <CopyButton :text="output.text" />
      <a
        v-if="output.transcript?.id"
        class="btn sm"
        :href="blobUrl(`${session}/${output.transcript.id}`)"
        @click="downloadApiFile($event, blobUrl(`${session}/${output.transcript.id}`), 'transcript.json')"
        >{{ tr('下载完整转写', 'Download full transcript') }}</a
      >
    </div>
    <p class="transcript-text">{{ output.text }}</p>
    <p v-if="output.truncated" class="detail-muted">
      {{
        tr(
          '此处显示部分文本，完整内容和时间戳可下载查看。',
          'This preview is truncated. Download the full transcript and timestamps.',
        )
      }}
    </p>
  </section>
</template>
<style scoped>
.tool-transcript {
  min-width: 0;
}
.transcript-actions {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 8px;
  color: var(--fg-muted);
}
.transcript-text {
  white-space: pre-wrap;
  overflow-wrap: anywhere;
  line-height: 1.7;
}
</style>

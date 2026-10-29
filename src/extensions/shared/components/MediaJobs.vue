<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import MediaJobView from './MediaJob.vue';
import type { MediaJob } from '../../../core/mediaGeneration.ts';
import { tr } from '../../../core/i18n/tr.ts';
const props = defineProps<{ session: string; jobs: MediaJob[]; collection?: boolean; emptyText?: string }>();
const visibleCount = ref(20);
const opened = ref(new Set<string>());
watch(
  () => [props.session, props.jobs],
  () => {
    visibleCount.value = 20;
    opened.value = new Set();
  },
);
const visible = computed(() => props.jobs.slice(0, visibleCount.value));
function toggle(event: Event, id: string) {
  const next = new Set(opened.value);
  if ((event.target as HTMLDetailsElement).open) next.add(id);
  else next.delete(id);
  opened.value = next;
}
const statusLabel = (status: string) =>
  ({
    submitting: tr('提交中', 'Submitting'),
    running: tr('处理中', 'Processing'),
    downloading: tr('下载中', 'Downloading'),
    succeeded: tr('已保存', 'Saved'),
    failed: tr('失败', 'Failed'),
    outcome_unknown: tr('结果未知', 'Outcome unknown'),
  })[status] ?? status;
</script>
<template>
  <section class="media-jobs">
    <template v-if="collection">
      <details
        v-for="job in visible"
        :key="job.job_id"
        :open="opened.has(job.job_id)"
        @toggle="toggle($event, job.job_id)"
      >
        <summary>
          {{ statusLabel(job.status) }} · {{ job.model }} <code>{{ job.job_id.slice(0, 12) }}</code>
        </summary>
        <MediaJobView v-if="opened.has(job.job_id)" :session="session" :output="job" />
      </details>
      <button v-if="visibleCount < jobs.length" class="btn ghost" @click="visibleCount += 20">
        {{ tr('查看更多任务', 'Show more jobs') }}
      </button>
    </template>
    <MediaJobView v-else v-for="job in jobs" :key="job.job_id" :session="session" :output="job" />
    <p v-if="!jobs.length">
      {{ emptyText ?? tr('此会话还没有任务。', 'This session has no jobs yet.') }}
    </p>
  </section>
</template>
<style scoped>
.media-jobs {
  display: grid;
  gap: 12px;
  min-width: 0;
}
header,
p {
  color: var(--fg-muted);
  font-size: 12px;
}
p {
  margin: 0;
}
details {
  border: 1px solid var(--line);
  border-radius: 10px;
  padding: 12px;
}
summary {
  cursor: pointer;
  overflow-wrap: anywhere;
}
details[open] summary {
  margin-bottom: 12px;
}
summary code {
  color: var(--fg-muted);
  font-size: 12px;
}
</style>

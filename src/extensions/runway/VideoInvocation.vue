<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import { tr } from '../../core/i18n/tr.ts';
import { blobUrl } from '../../core/api/endpoints.ts';
import ToolImage from '../../domain/media/ToolImage.vue';
const props = defineProps<{ request: Record<string, unknown>; session?: string }>();
const expanded = ref(false);
watch(
  () => props.request,
  () => {
    expanded.value = false;
  },
);
const record = (v: unknown): Record<string, unknown> =>
  v && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, unknown>) : {};
const inputs = computed(() => {
  const rows: { label: string; source: string; image: boolean; local: boolean }[] = [];
  const add = (value: unknown, label: string, image = true) => {
    const asset = record(value);
    const source = String(asset.blob ?? asset.url ?? '');
    rows.push({ label, source, image, local: typeof asset.blob === 'string' && /^[a-f0-9]{64}$/.test(asset.blob) });
  };
  if (props.request.image) add(props.request.image, tr('首帧', 'First frame'));
  if (props.request.first_frame) add(props.request.first_frame, tr('首帧指导图', 'First guidance frame'));
  if (props.request.last_frame) add(props.request.last_frame, tr('尾帧', 'Last frame'));
  if (props.request.video) add(props.request.video, tr('源视频', 'Source video'), false);
  if (Array.isArray(props.request.keyframes))
    props.request.keyframes.slice(0, 5).forEach((value, index) => {
      const frame = record(value);
      const window = record(frame.range);
      const time =
        typeof frame.seconds === 'number'
          ? frame.seconds + ' s'
          : typeof frame.at === 'number'
            ? frame.at * 100 + '%'
            : '';
      const range =
        typeof window.start_seconds === 'number' && typeof window.end_seconds === 'number'
          ? ' · ' + tr('编辑区间', 'Edit window') + ' ' + window.start_seconds + '–' + window.end_seconds + ' s'
          : '';
      add(frame.image, tr('关键帧', 'Keyframe') + ' ' + (index + 1) + ' · ' + time + range);
    });
  return rows;
});
const actionTitle = computed(
  () =>
    ({
      generate: tr('生成视频', 'Generate video'),
      edit: tr('编辑视频', 'Edit video'),
      status: tr('恢复任务并读取状态', 'Resume job and read status'),
      list_jobs: tr('查看此会话的 Runway 视频任务', 'List this session’s Runway video jobs'),
    })[String(props.request.action)] ?? String(props.request.action),
);
const fields = computed(() =>
  [
    ['output_format', tr('输出格式', 'Output format')],
    ['prores_profile', tr('ProRes 编码规格', 'ProRes profile')],
    ['seed', tr('随机种子', 'Seed')],
    ['target_aspect_ratio', tr('扩画面比例', 'Outpaint aspect ratio')],
    ['duration', tr('时长（秒）', 'Duration (seconds)')],
    ['aspect_ratio', tr('画面比例', 'Aspect ratio')],
  ].filter(([key]) => props.request[key] !== undefined),
);
</script>
<template>
  <section class="runway-video-invocation">
    <header>Runway Video · {{ actionTitle }}</header>
    <p v-if="['generate', 'edit'].includes(String(request.action))" class="service">
      {{ request.service ?? tr('按配置优先级', 'Configured priority') }}
    </p>
    <p v-if="request.prompt" class="prompt">{{ request.prompt }}</p>
    <code v-if="request.job_id">{{ request.job_id }}</code>
    <dl v-if="fields.length">
      <div v-for="[key, label] in fields" :key="key">
        <dt>{{ label }}</dt>
        <dd>
          {{ typeof request[key] === 'boolean' ? (request[key] ? tr('开启', 'On') : tr('关闭', 'Off')) : request[key] }}
        </dd>
      </div>
    </dl>
    <template v-if="inputs.length">
      <button class="btn ghost input-toggle" :aria-expanded="expanded" @click="expanded = !expanded">
        {{ tr('参考素材', 'Reference assets') }} · {{ inputs.length }}
      </button>
      <div v-if="expanded" class="inputs">
        <section v-for="(input, i) in inputs" :key="i">
          <h4>{{ input.label }}</h4>
          <ToolImage
            v-if="session && input.image && input.local"
            :src="blobUrl(session + '/' + input.source)"
            mime="image/*"
            :path="input.source"
          />
          <code v-else>{{ input.source }}</code>
        </section>
      </div>
    </template>
  </section>
</template>
<style scoped>
.runway-video-invocation,
.inputs {
  display: grid;
  gap: 12px;
  min-width: 0;
}
header,
.service,
dt {
  color: var(--fg-muted);
}
header,
.service,
h4 {
  font-size: 12px;
}
p,
dl,
dd,
h4 {
  margin: 0;
}
h4 {
  font-weight: 500;
  margin-bottom: 8px;
}
.prompt {
  white-space: pre-wrap;
}
p,
code,
dd,
li {
  overflow-wrap: anywhere;
}
dl {
  display: grid;
  gap: 8px;
}
dl > div {
  display: grid;
  grid-template-columns: minmax(90px, 1fr) minmax(0, 2fr);
  gap: 12px;
}
.inputs > section {
  min-width: 0;
  border: 1px solid var(--line);
  border-radius: 10px;
  padding: 12px;
}
</style>

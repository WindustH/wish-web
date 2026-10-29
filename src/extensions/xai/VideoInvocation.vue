<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import { tr } from '../../core/i18n/tr.ts';
import { blobUrl } from '../../core/api/endpoints.ts';
import ToolImage from '../../ui/domain/media/ToolImage.vue';
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
  if (props.request.last_frame) add(props.request.last_frame, tr('尾帧', 'Last frame'));
  if (props.request.video) add(props.request.video, tr('源视频', 'Source video'), false);
  if (Array.isArray(props.request.reference_images))
    props.request.reference_images
      .slice(0, 14)
      .forEach((v, i) => add(v, tr('参考图', 'Reference image') + ' ' + (i + 1)));
  if (Array.isArray(props.request.keyframes))
    props.request.keyframes.slice(0, 4).forEach((v) => {
      const k = record(v);
      add(k.image, tr('关键帧', 'Keyframe') + ' · ' + k.timestamp_s + ' s');
    });
  return rows;
});
const voices = computed(() =>
  Array.isArray(props.request.reference_voices) ? props.request.reference_voices.slice(0, 3) : [],
);
const actionTitle = computed(
  () =>
    ({
      generate: tr('生成视频', 'Generate video'),
      edit: tr('编辑视频', 'Edit video'),
      extend: tr('延长视频', 'Extend video'),
      status: tr('恢复任务并读取状态', 'Resume job and read status'),
      list_jobs: tr('查看此会话的 xAI 视频任务', 'List this session’s xAI video jobs'),
    })[String(props.request.action)] ?? String(props.request.action),
);
const fields = computed(() =>
  [
    ['generate_audio', tr('生成音轨', 'Generate audio')],
    ['duration', tr('时长（秒）', 'Duration (seconds)')],
    ['resolution', tr('分辨率', 'Resolution')],
    ['aspect_ratio', tr('画面比例', 'Aspect ratio')],
  ].filter(([key]) => props.request[key] !== undefined),
);
</script>
<template>
  <section class="xai-video-invocation">
    <header>xAI Video · {{ actionTitle }}</header>
    <p v-if="['generate', 'edit', 'extend'].includes(String(request.action))" class="service">
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
    <ul v-if="voices.length" class="voices">
      <li v-for="(voice, i) in voices" :key="i">&lt;AUDIO_{{ i }}&gt; · {{ voice }}</li>
    </ul>
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
.xai-video-invocation,
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
.voices {
  margin: 0;
  padding-left: 20px;
}
.inputs > section {
  min-width: 0;
  border: 1px solid var(--line);
  border-radius: 10px;
  padding: 12px;
}
</style>

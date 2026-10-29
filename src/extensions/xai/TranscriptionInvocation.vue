<script setup lang="ts">
import { computed } from 'vue';
import { tr } from '../../core/i18n/tr.ts';
const props = defineProps<{ request: Record<string, unknown> }>();
const fields = computed(() =>
  [
    ['diarize', tr('区分说话人', 'Speaker diarization')],
    ['format', tr('规范数字与金额', 'Normalize numbers and currency')],
    ['multichannel', tr('独立转写各声道', 'Separate audio channels')],
    ['filler_words', tr('保留语气词', 'Keep filler words')],
    ['vad_threshold', tr('语音检测阈值', 'Speech detection threshold')],
  ].filter(([key]) => props.request[key] !== undefined),
);
const terms = computed(() =>
  Array.isArray(props.request.keyterms)
    ? props.request.keyterms.filter((value): value is string => typeof value === 'string').slice(0, 100)
    : [],
);
const valueText = (value: unknown) =>
  typeof value === 'boolean' ? (value ? tr('开启', 'On') : tr('关闭', 'Off')) : String(value);
</script>
<template>
  <section class="xai-transcription-invocation">
    <header>xAI · {{ request.service ?? tr('按配置优先级', 'Configured priority') }}</header>
    <dl>
      <div>
        <dt>{{ tr('音频文件', 'Audio file') }}</dt>
        <dd>
          <code>{{ request.audio }}</code>
        </dd>
      </div>
      <div>
        <dt>{{ tr('语言', 'Language') }}</dt>
        <dd>{{ request.language ?? tr('自动识别', 'Automatic') }}</dd>
      </div>
      <div v-for="[key, label] in fields" :key="key">
        <dt>{{ label }}</dt>
        <dd>{{ valueText(request[key]) }}</dd>
      </div>
    </dl>
    <div v-if="terms.length" class="terms">
      <span class="terms-label">{{ tr('重点词汇', 'Key terms') }}</span>
      <ul>
        <li v-for="(term, index) in terms" :key="index">{{ term }}</li>
      </ul>
    </div>
  </section>
</template>
<style scoped>
.xai-transcription-invocation {
  display: grid;
  gap: 12px;
  min-width: 0;
}
header,
dt,
.terms-label {
  color: var(--fg-muted);
}
header {
  font-size: 12px;
  overflow-wrap: anywhere;
}
dl,
dd {
  margin: 0;
}
dl {
  display: grid;
  gap: 8px;
}
dl > div {
  display: grid;
  grid-template-columns: minmax(100px, 1fr) minmax(0, 2fr);
  gap: 12px;
}
dt,
dd,
code {
  overflow-wrap: anywhere;
}
code {
  font-size: 12px;
}
.terms {
  display: grid;
  gap: 8px;
}
ul {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  list-style: none;
  margin: 0;
  padding: 0;
}
li {
  border: 1px solid var(--line);
  border-radius: 6px;
  padding: 3px 8px;
  overflow-wrap: anywhere;
  max-width: 100%;
}
</style>

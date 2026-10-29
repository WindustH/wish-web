<script setup lang="ts">
import { computed } from 'vue';
import { tr } from '../../core/i18n/tr.ts';
const props = defineProps<{ request: Record<string, unknown> }>();
const record = (value: unknown): Record<string, unknown> | undefined =>
  value !== null && typeof value === 'object' && !Array.isArray(value) ? (value as Record<string, unknown>) : undefined;
const fields = computed(() =>
  [
    ['voice_id', tr('音色', 'Voice')],
    ['language', tr('语言', 'Language')],
    ['speed', tr('语速', 'Speed')],
    ['text_normalization', tr('文本规范化', 'Text normalization')],
    ['with_timestamps', tr('字符时间戳', 'Character timestamps')],
  ].filter(([key]) => props.request[key] !== undefined),
);
const format = computed(() => record(props.request.output_format));
const replacements = computed(() => Object.entries(record(props.request.replace) ?? {}));
const display = (value: unknown) =>
  typeof value === 'boolean' ? (value ? tr('开启', 'On') : tr('关闭', 'Off')) : String(value);
</script>
<template>
  <section class="xai-speech-invocation">
    <header>xAI Speech · {{ request.service ?? tr('按配置优先级', 'Configured priority') }}</header>
    <template v-if="request.action === 'run'">
      <p class="speech-text">{{ request.text }}</p>
      <dl>
        <div v-for="[key, label] in fields" :key="key">
          <dt>{{ label }}</dt>
          <dd>{{ display(request[key]) }}</dd>
        </div>
        <div v-if="format">
          <dt>{{ tr('输出格式', 'Output format') }}</dt>
          <dd>
            {{ format.codec }}<span v-if="format.sample_rate"> · {{ format.sample_rate }} Hz</span
            ><span v-if="format.bit_rate"> · {{ format.bit_rate }} bps</span>
          </dd>
        </div>
      </dl>
      <details v-if="request.replace !== undefined" class="pronunciation">
        <summary>{{ tr('发音替换', 'Pronunciation replacements') }} · {{ replacements.length }}</summary>
        <dl v-if="replacements.length">
          <div v-for="[phrase, spoken] in replacements.slice(0, 200)" :key="phrase">
            <dt>{{ phrase }}</dt>
            <dd>{{ spoken }}</dd>
          </div>
        </dl>
        <p v-else>{{ tr('本次不使用配置中的发音替换。', 'Configured replacements are disabled for this call.') }}</p>
      </details>
    </template>
    <template v-else-if="request.action === 'status'"
      ><p>{{ tr('恢复任务并读取状态', 'Resume job and read status') }}</p>
      <code>{{ request.job_id }}</code></template
    >
    <p v-else>{{ tr('查看此会话的 xAI 语音任务', 'List this session’s xAI speech jobs') }}</p>
  </section>
</template>
<style scoped>
.xai-speech-invocation {
  display: grid;
  gap: 12px;
  min-width: 0;
}
header,
dt {
  color: var(--fg-muted);
}
header {
  font-size: 12px;
  overflow-wrap: anywhere;
}
p,
dl,
dd {
  margin: 0;
}
.speech-text {
  white-space: pre-wrap;
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
dd,
dt,
p,
code {
  overflow-wrap: anywhere;
}
details {
  border: 1px solid var(--line);
  border-radius: 10px;
  padding: 12px;
}
summary {
  cursor: pointer;
}
details[open] summary {
  margin-bottom: 12px;
}
</style>

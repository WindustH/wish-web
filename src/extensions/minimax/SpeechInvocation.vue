<script setup lang="ts">
import { computed } from 'vue';
import { tr } from '../../core/i18n/tr.ts';
const props = defineProps<{ request: Record<string, unknown> }>();
const voice = computed(() => {
  const value = props.request.voice;
  return value && typeof value === 'object' && !Array.isArray(value) ? Object.entries(value) : [];
});
const record = (value: unknown): Record<string, unknown> =>
  value && typeof value === 'object' && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
const parameters = computed(() => record(props.request.parameters));
const details = computed(() => {
  const rows: [string, unknown][] = [];
  for (const [key, value] of Object.entries(parameters.value)) {
    if (key === 'pronunciation_dict' || key === 'timbre_weights') continue;
    if (key === 'audio_setting' || key === 'voice_modify') {
      for (const [field, setting] of Object.entries(record(value))) rows.push([key + '.' + field, setting]);
    } else rows.push([key, value]);
  }
  return rows;
});
const mixedVoices = computed(() => {
  const value = parameters.value.timbre_weights;
  return Array.isArray(value) ? value.slice(0, 4).map(record) : [];
});
const pronunciation = computed(() => {
  const tone = record(parameters.value.pronunciation_dict).tone;
  return Array.isArray(tone) ? tone.filter((s): s is string => typeof s === 'string') : [];
});
const display = (value: unknown) =>
  typeof value === 'boolean' ? (value ? tr('开启', 'On') : tr('关闭', 'Off')) : String(value);
const label = (key: string) =>
  ({
    id: tr('音色', 'Voice'),
    speed: tr('语速', 'Speed'),
    volume: tr('音量', 'Volume'),
    pitch: tr('音调', 'Pitch'),
    emotion: tr('情绪', 'Emotion'),
    subtitle_enable: tr('生成字幕', 'Generate subtitles'),
    subtitle_type: tr('字幕粒度', 'Subtitle granularity'),
    language_boost: tr('语言增强', 'Language boost'),
    text_normalization_mode: tr('文本规范化', 'Text normalization'),
    latex_read: tr('LaTeX 朗读', 'LaTeX reading'),
    'audio_setting.format': tr('音频格式', 'Audio format'),
    'audio_setting.sample_rate': tr('采样率（Hz）', 'Sample rate (Hz)'),
    'audio_setting.bitrate': tr('比特率（bps）', 'Bit rate (bps)'),
    'audio_setting.channel': tr('声道数', 'Channels'),
    'voice_modify.pitch': tr('音效 · 音高', 'Effect · Pitch'),
    'voice_modify.intensity': tr('音效 · 强度', 'Effect · Intensity'),
    'voice_modify.timbre': tr('音效 · 音色', 'Effect · Timbre'),
    'voice_modify.sound_effects': tr('声音效果', 'Sound effect'),
  })[key] ?? key;
</script>
<template>
  <section class="minimax-invocation">
    <header>MiniMax Speech</header>
    <template v-if="request.action === 'run'">
      <p class="service">{{ request.service ?? tr('按配置优先级', 'Configured priority') }}</p>
      <p class="speech-text">{{ request.text }}</p>
      <dl v-if="voice.length" class="voice-controls">
        <div v-for="[key, value] in voice" :key="key">
          <dt>{{ label(key) }}</dt>
          <dd>{{ value }}</dd>
        </div>
      </dl>
      <dl v-if="details.length" class="native-parameters">
        <div v-for="[key, value] in details" :key="key">
          <dt>{{ label(key) }}</dt>
          <dd>{{ display(value) }}</dd>
        </div>
      </dl>
      <section v-if="mixedVoices.length" class="mixed-voices">
        <h4>{{ tr('混合音色', 'Mixed voices') }}</h4>
        <p>
          {{ tr('按相对权重混合，替代配置中的单个音色。', 'Relative weights replace the configured single voice.') }}
        </p>
        <table>
          <thead>
            <tr>
              <th scope="col">{{ tr('音色', 'Voice') }}</th>
              <th scope="col">{{ tr('权重', 'Weight') }}</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="(mixed, index) in mixedVoices" :key="index">
              <td>{{ mixed.voice_id }}</td>
              <td>{{ mixed.weight }}</td>
            </tr>
          </tbody>
        </table>
      </section>
      <details v-if="parameters.pronunciation_dict !== undefined" class="pronunciation">
        <summary>{{ tr('发音词典', 'Pronunciation dictionary') }} · {{ pronunciation.length }}</summary>
        <ul v-if="pronunciation.length">
          <li v-for="(rule, index) in pronunciation.slice(0, 1000)" :key="index">{{ rule }}</li>
        </ul>
        <p v-else>{{ tr('未指定发音规则', 'No pronunciation rules') }}</p>
      </details>
    </template>
    <template v-else-if="request.action === 'status'">
      <p>{{ tr('恢复任务并读取状态', 'Resume job and read status') }}</p>
      <code>{{ request.job_id }}</code>
    </template>
    <p v-else>{{ tr('查看此会话的 MiniMax 语音任务', 'List this session’s MiniMax speech jobs') }}</p>
  </section>
</template>
<style scoped>
.minimax-invocation {
  display: grid;
  gap: 10px;
  min-width: 0;
}
header,
.service,
dt {
  color: var(--fg-muted);
}
header,
.service {
  font-size: 12px;
}
p,
dl,
dd {
  margin: 0;
}
.speech-text {
  white-space: pre-wrap;
}
p,
code,
dd {
  overflow-wrap: anywhere;
}
dl {
  display: grid;
  gap: 8px;
}
dl > div {
  display: grid;
  grid-template-columns: minmax(80px, 1fr) minmax(0, 2fr);
  gap: 12px;
}
details {
  border: 1px solid var(--line);
  border-radius: 10px;
  padding: 12px;
}
summary {
  cursor: pointer;
}
li,
dt {
  overflow-wrap: anywhere;
}
ul {
  padding-left: 20px;
  margin-bottom: 0;
}
details[open] summary {
  margin-bottom: 12px;
}
.mixed-voices {
  display: grid;
  gap: 8px;
  min-width: 0;
}
h4 {
  margin: 0;
  font-size: 13px;
  font-weight: 500;
}
.mixed-voices p {
  font-size: 12px;
  color: var(--fg-muted);
}
table {
  width: 100%;
  table-layout: fixed;
  border-collapse: collapse;
  font-size: 13px;
}
th,
td {
  text-align: left;
  padding: 6px 0;
  overflow-wrap: anywhere;
}
th {
  color: var(--fg-muted);
  font-weight: 400;
}
th:last-child,
td:last-child {
  width: 60px;
  text-align: right;
}
</style>

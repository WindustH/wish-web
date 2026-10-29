<script setup lang="ts">
import { computed } from 'vue';
import SpeechOutputRows from './SpeechOutputRows.vue';
import type { MediaOptions } from '../../core/mediaGeneration.ts';
import { tr } from '../../core/i18n/tr.ts';
const options = defineModel<MediaOptions>({ required: true });
const props = defineProps<{ model: string; protocol?: string }>();
const xai = computed(() => props.protocol === 'xai_speech');
const controls = computed(() =>
  xai.value
    ? [{ key: 'speed' as const, label: tr('语速', 'Speed'), min: 0.7, max: 1.5, step: 'any', placeholder: '1' }]
    : [
        { key: 'speed' as const, label: tr('语速', 'Speed'), min: 0.5, max: 2, step: 'any', placeholder: '1' },
        { key: 'volume' as const, label: tr('音量', 'Volume'), min: 0, max: 10, step: 'any', placeholder: '1' },
        { key: 'pitch' as const, label: tr('音高', 'Pitch'), min: -12, max: 12, step: 1, placeholder: '0' },
      ],
);
const emotions = computed(() => [
  ['happy', tr('开心', 'Happy')],
  ['sad', tr('悲伤', 'Sad')],
  ['angry', tr('愤怒', 'Angry')],
  ['fearful', tr('害怕', 'Fearful')],
  ['disgusted', tr('厌恶', 'Disgusted')],
  ['surprised', tr('惊讶', 'Surprised')],
  ['calm', tr('平静', 'Calm')],
  ...(['speech-2.6-hd', 'speech-2.6-turbo'].includes(props.model)
    ? [
        ['fluent', tr('流畅', 'Fluent')],
        ['whisper', tr('耳语', 'Whisper')],
      ]
    : []),
]);
function setNumber(key: 'speed' | 'volume' | 'pitch', event: Event) {
  const input = event.target as HTMLInputElement;
  options.value = { ...options.value, [key]: input.value === '' ? null : input.valueAsNumber };
}
</script>
<template>
  <label v-for="control in controls" :key="control.key" class="set-row stacked">
    <span class="set-label">{{ control.label }}</span>
    <input
      class="input"
      type="number"
      :name="control.key"
      :value="options[control.key]"
      :min="control.min"
      :max="control.max"
      :step="control.step"
      :placeholder="control.placeholder"
      @input="setNumber(control.key, $event)"
    />
  </label>
  <label v-if="xai" class="set-row stacked">
    <span class="set-label">{{ tr('语言', 'Language') }}</span>
    <input
      class="input"
      :value="options.language"
      placeholder="auto"
      @input="options = { ...options, language: ($event.target as HTMLInputElement).value || null }"
    />
    <small>{{
      tr(
        '留空自动识别，也可指定 en、zh、pt-BR 等语言代码。',
        'Leave empty for automatic detection, or enter a language code such as en, zh or pt-BR.',
      )
    }}</small>
  </label>
  <label v-if="!xai" class="set-row stacked">
    <span class="set-label">{{ tr('情绪', 'Emotion') }}</span>
    <select
      class="input"
      :value="options.emotion ?? ''"
      @change="options = { ...options, emotion: ($event.target as HTMLSelectElement).value || null }"
    >
      <option value="">{{ tr('根据文本自动选择', 'Automatic from text') }}</option>
      <option v-for="[value, label] in emotions" :key="value" :value="value">{{ label }}</option>
    </select>
    <small v-if="options.emotion && !emotions.some(([value]) => value === options.emotion)">
      {{
        tr(
          '当前模型不支持已选情绪，请重新选择。',
          'The selected emotion is unavailable for this model. Choose another emotion.',
        )
      }}
    </small>
  </label>
  <SpeechOutputRows v-if="xai" v-model="options" />
</template>

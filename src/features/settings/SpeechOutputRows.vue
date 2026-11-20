<script setup lang="ts">
import SelectField from '../../ui/components/SelectField.vue';
import type { MediaOptions } from '../../core/mediaGeneration.ts';
import { tr } from '../../core/i18n/tr.ts';
import KeyValueEditor from '../../domain/settings/KeyValueEditor.vue';
import SwitchRow from '../../domain/settings/SwitchRow.vue';
const options = defineModel<MediaOptions>({ required: true });
function codec(value: string) {
  if (value !== '' && value !== 'mp3' && value !== 'wav') return;
  options.value = {
    ...options.value,
    speech_output: value
      ? {
          ...options.value.speech_output,
          codec: value,
          bit_rate: value === 'wav' ? null : options.value.speech_output?.bit_rate,
        }
      : null,
  };
}
function number(key: 'sample_rate' | 'bit_rate', value: string) {
  options.value = {
    ...options.value,
    speech_output: { codec: 'mp3', ...options.value.speech_output, [key]: value ? Number(value) : null },
  };
}
</script>
<template>
  <label class="set-row stacked"
    ><span class="set-label">{{ tr('音频格式', 'Audio format') }}</span>
    <SelectField
      :aria-label="tr('音频格式', 'Audio format')"
      :model-value="String(options.speech_output?.codec ?? '')"
      :options="[
        { value: '', label: tr('服务默认值（MP3）', 'Service default (MP3)') },
        { value: 'mp3', label: 'MP3' },
        { value: 'wav', label: 'WAV' },
      ]"
      @update:model-value="codec"
    />
  </label>
  <label class="set-row stacked"
    ><span class="set-label">{{ tr('采样率', 'Sample rate') }}</span>
    <SelectField
      :aria-label="tr('采样率', 'Sample rate')"
      :model-value="String(options.speech_output?.sample_rate ?? '')"
      :options="[
        { value: '', label: tr('服务默认值', 'Service default') },
        ...[8000, 16000, 22050, 24000, 44100, 48000].map((rate) => ({ value: String(rate), label: rate + ' Hz' })),
      ]"
      @update:model-value="number('sample_rate', $event)"
    />
  </label>
  <label v-if="options.speech_output?.codec !== 'wav'" class="set-row stacked"
    ><span class="set-label">{{ tr('比特率', 'Bit rate') }}</span>
    <SelectField
      :aria-label="tr('比特率', 'Bit rate')"
      :model-value="String(options.speech_output?.bit_rate ?? '')"
      :options="[
        { value: '', label: tr('服务默认值', 'Service default') },
        ...[32000, 64000, 96000, 128000, 192000].map((rate) => ({ value: String(rate), label: rate / 1000 + ' kbps' })),
      ]"
      @update:model-value="number('bit_rate', $event)"
    />
  </label>
  <SwitchRow
    :model-value="options.text_normalization ?? false"
    :name="tr('规范数字与符号读法', 'Normalize numbers and symbols')"
    @update:model-value="options = { ...options, text_normalization: $event }"
  />
  <SwitchRow
    :model-value="options.with_timestamps ?? false"
    :name="tr('保存逐字时间戳', 'Save character timestamps')"
    @update:model-value="options = { ...options, with_timestamps: $event }"
  />
  <div class="set-row stacked">
    <span class="set-label">{{ tr('发音替换', 'Pronunciation replacements') }}</span>
    <small>{{
      tr(
        '为品牌名或术语指定读法，支持音标。最多 200 条规则。',
        'Set pronunciations for names or terms, including IPA. Up to 200 rules.',
      )
    }}</small>
    <KeyValueEditor
      :model-value="options.pronunciation ?? undefined"
      :secret-values="false"
      :name-placeholder="tr('原词或短语', 'Word or phrase')"
      :value-placeholder="tr('读法或音标', 'Pronunciation or IPA')"
      :add-label="tr('添加发音规则', 'Add pronunciation rule')"
      @update:model-value="options = { ...options, pronunciation: $event }"
    />
  </div>
</template>

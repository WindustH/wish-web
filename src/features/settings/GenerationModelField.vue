<script setup lang="ts">
import { computed, ref, useId } from 'vue';
import type { GenerationPreset } from '../../core/generationPresets.ts';
import { generationModelPreset } from '../../domain/settings/generationServices.ts';
import SelectField from '../../ui/components/SelectField.vue';
import { tr } from '../../core/i18n/tr.ts';

const props = defineProps<{ preset: string; model: string; presets: GenerationPreset[] }>();
const emit = defineEmits<{ choose: [preset: string]; 'update:model': [model: string] }>();
const inputId = useId();
const manual = ref(false);
const known = computed(() => generationModelPreset(props.presets, props.preset, props.model));
const custom = computed(() => manual.value || !known.value);
const options = computed(() => [
  ...props.presets.map((preset) => ({ value: preset.id, label: preset.model })),
  { value: 'custom', label: tr('自定义模型 ID', 'Custom model ID') },
]);
function choose(id: string) {
  manual.value = id === 'custom';
  if (!manual.value) emit('choose', id);
}
</script>

<template>
  <div class="set-row stacked generation-model-field">
    <template v-if="presets.length > 1">
      <span class="set-label">{{ tr('模型', 'Model') }}</span>
      <SelectField
        mobile-page
        searchable
        :aria-label="tr('模型', 'Model')"
        :picker-title="tr('选择模型', 'Choose model')"
        :model-value="custom ? 'custom' : known!.id"
        :options="options"
        @update:model-value="choose"
      />
    </template>
    <template v-if="presets.length <= 1 || custom">
      <label class="set-label" :for="inputId">{{ tr('模型 ID', 'Model ID') }}</label>
      <input
        :id="inputId"
        class="input"
        :value="model"
        autocomplete="off"
        spellcheck="false"
        @input="emit('update:model', ($event.target as HTMLInputElement).value)"
      />
    </template>
  </div>
</template>

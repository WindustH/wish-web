<script setup lang="ts">
import { computed, inject, ref, watch } from 'vue';
import type { SearchProviderStatus } from '../../core/api/endpoints.ts';
import { tr } from '../../core/i18n/tr.ts';
import ExtensionCategoryPicker from '../tool-settings/ExtensionCategoryPicker.vue';
import { useIsMobile } from '../../ui/composables/useMedia.ts';
import ToolSwitchRows from '../tool-settings/ToolSwitchRows.vue';
import { configDraftKey } from './useConfigDraft.ts';
import { extensionSections } from './settingsSections.ts';
import ImageGenerationSettings from './ImageGenerationSettings.vue';
import MediaGenerationSettings from './MediaGenerationSettings.vue';
import FetchSettings from './FetchSettings.vue';
import SearchSettings from './SearchSettings.vue';

const props = defineProps<{
  initialSection?: string;
  save: () => Promise<boolean>;
  searchAvailable: boolean | null;
  statuses: Record<string, SearchProviderStatus>;
  statusesKnown: boolean;
}>();
const emit = defineEmits<{ checked: []; selected: [section: string] }>();
const { draft, busy, serverDirty, providerOptions, searchCatalog } = inject(configDraftKey)!;
type Section = (typeof extensionSections.value)[number]['id'];
const mobile = useIsMobile();
const selected = ref<Section>('image_generation');
const overview = computed(() => mobile.value && !props.initialSection);
watch(
  () => props.initialSection,
  (value) => {
    if (value && extensionSections.value.some((section) => section.id === value)) selected.value = value as Section;
  },
  { immediate: true },
);
const current = computed(() => extensionSections.value.find((item) => item.id === selected.value)!);
</script>

<template>
  <div class="extension-tools-settings">
    <ExtensionCategoryPicker
      v-if="!mobile || overview"
      :model-value="selected"
      :pages="mobile"
      @update:model-value="
        selected = $event as Section;
        emit('selected', $event);
      "
    />
    <template v-if="!overview">
      <header v-if="!mobile" class="set-section-head">
        <h3>{{ current.label }}</h3>
        <p>{{ current.summary }}</p>
      </header>
      <fieldset v-if="draft.defaults.tools" class="settings-form extension-defaults" :disabled="busy">
        <div class="set-card">
          <ToolSwitchRows
            v-model="draft.defaults.tools"
            :include="[current.toolKey]"
            :search-available="searchAvailable"
            in-settings
          />
        </div>
        <p class="extension-defaults-note">
          {{
            tr(
              '启用方式作为新会话的默认值，已有会话可单独配置。',
              'Delivery modes are defaults for new sessions. Existing sessions keep their own settings.',
            )
          }}
        </p>
      </fieldset>
      <ImageGenerationSettings v-if="selected === 'image_generation'" />
      <MediaGenerationSettings
        v-else-if="
          selected === 'video_generation' || selected === 'audio_generation' || selected === 'audio_transcription'
        "
        :key="selected"
        :section="selected"
      />
      <FetchSettings v-else-if="selected === 'fetch'" :save="save" />
      <SearchSettings
        v-else
        :config="draft"
        :models="providerOptions"
        :presets="searchCatalog"
        :save="save"
        :busy="busy"
        :dirty="serverDirty"
        :statuses="statuses"
        :statuses-known="statusesKnown"
        @checked="$emit('checked')"
      />
    </template>
  </div>
</template>

<style scoped>
.extension-tools-settings {
  display: grid;
  gap: 20px;
  min-width: 0;
}
.extension-defaults-note {
  margin: 10px 0 0;
  color: var(--fg-subtle);
  font-size: 12px;
  line-height: 1.6;
}
</style>

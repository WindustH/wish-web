<script setup lang="ts">
import { computed, inject, ref, watch } from 'vue';
import type { SearchProviderStatus } from '../../core/api/endpoints.ts';
import { tr } from '../../core/i18n/tr.ts';
import Icon from '../../ui/components/Icon.vue';
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
const selected = ref<Section>('image_generation');
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
    <nav class="extension-categories" :aria-label="tr('扩展工具分类', 'Extension tool categories')">
      <button
        v-for="item in extensionSections"
        :key="item.id"
        type="button"
        :aria-pressed="selected === item.id"
        :class="{ selected: selected === item.id }"
        @click="
          selected = item.id as Section;
          emit('selected', item.id);
        "
      >
        <Icon :name="item.icon" />
        <span>{{ item.label }}</span>
      </button>
    </nav>
    <header class="set-section-head">
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
  </div>
</template>

<style scoped>
.extension-tools-settings {
  display: grid;
  gap: 20px;
  min-width: 0;
}
.extension-categories {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 6px;
}
.extension-categories button {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 10px;
  border: 1px solid transparent;
  border-radius: 10px;
  background: transparent;
  color: var(--fg-muted);
  font: inherit;
  font-size: 13px;
  cursor: pointer;
  text-align: start;
}
.extension-categories .icon {
  width: 18px;
  height: 18px;
  flex: none;
}
.extension-categories button.selected {
  background: var(--bg-group);
  border-color: var(--line);
  color: var(--fg);
}
.extension-categories button.selected .icon {
  color: var(--accent);
}
@media (hover: hover) {
  .extension-categories button:hover {
    background: var(--bg-hover);
  }
}
.extension-defaults-note {
  margin: 10px 0 0;
  color: var(--fg-subtle);
  font-size: 12px;
  line-height: 1.6;
}
@media (max-width: 599px) {
  .extension-categories {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
}
</style>

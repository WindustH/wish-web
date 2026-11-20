<script setup lang="ts">
import { extensionSwitchRows } from '../../extensions/settings.ts';

import { computed, inject } from 'vue';
import type { SearchProviderStatus } from '../../core/api/endpoints.ts';
import Icon from '../../ui/components/Icon.vue';
import { tr } from '../../core/i18n/tr.ts';
import ExtensionCategoryPicker from '../../domain/settings/ExtensionCategoryPicker.vue';
import { useIsMobile } from '../../ui/composables/useMedia.ts';
import ToolSwitchRows from '../../domain/settings/ToolSwitchRows.vue';
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
const mobile = useIsMobile();
const current = computed(() => extensionSections.value.find((item) => item.id === props.initialSection));
</script>

<template>
  <div class="extension-tools-settings">
    <template v-if="!current">
      <ExtensionCategoryPicker
        v-if="mobile"
        :categories="extensionSections"
        pages
        @update:model-value="emit('selected', $event)"
      />
      <nav v-else class="extension-categories settings-link-list" :aria-label="tr('扩展工具', 'Extension tools')">
        <div v-for="item in extensionSections" :key="item.id" class="set-card">
          <div class="set-row inline">
            <span class="settings-link-label"><Icon :name="item.icon" />{{ item.label }}</span>
            <button
              class="btn settings-page-link"
              type="button"
              :aria-label="tr('配置', 'Configure') + ' ' + item.label"
              @click="emit('selected', item.id)"
            >
              {{ tr('配置', 'Configure') }}<Icon name="arrow-up-right" :size="15" />
            </button>
          </div>
        </div>
      </nav>
    </template>
    <template v-else>
      <fieldset v-if="draft.defaults.tools" class="settings-form extension-defaults" :disabled="busy">
        <div class="set-card">
          <ToolSwitchRows
            :extension-rows="extensionSwitchRows"
            v-model="draft.defaults.tools"
            dropdown
            :delivery-help="
              tr(
                '此设置用于新会话，已有会话可以单独配置。命令方式需要启用 Shell。',
                'This sets the default for new sessions. Existing sessions can be configured separately. Command mode requires Shell.',
              )
            "
            :include="[current.toolKey]"
            :search-available="searchAvailable"
          />
        </div>
      </fieldset>
      <ImageGenerationSettings v-if="current.id === 'image_generation'" />
      <MediaGenerationSettings
        v-else-if="
          current.id === 'video_generation' || current.id === 'audio_generation' || current.id === 'audio_transcription'
        "
        :key="current.id"
        :section="current.id"
      />
      <FetchSettings v-else-if="current.id === 'fetch'" :save="save" />
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
</style>

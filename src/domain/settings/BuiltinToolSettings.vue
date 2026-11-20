<script setup lang="ts">
import { ref } from 'vue';
import type { ToolSwitches } from '../../core/api/projections.ts';
import { i18n } from '../../core/i18n/index.ts';
import SwitchRow from './SwitchRow.vue';
import { tr } from '../../core/i18n/tr.ts';
import Icon from '../../ui/components/Icon.vue';
import SettingsPage from '../../ui/components/SettingsPage.vue';
import { useIsMobile } from '../../ui/composables/useMedia.ts';
import ToolSwitchRows from './ToolSwitchRows.vue';

defineProps<{ disabled?: boolean; note?: string }>();
const tools = defineModel<ToolSwitches>({ required: true });
const open = ref(false);
const mobile = useIsMobile();
</script>

<template>
  <SwitchRow v-model="tools.shell" name="Shell" :disabled="disabled" :hint="note ?? i18n.t('tools.shell.hint')" />
  <div class="set-row inline">
    <span class="settings-link-label"><Icon name="tool" />{{ tr('内置工具', 'Built-in tools') }}</span>
    <button type="button" class="btn settings-page-link" :disabled="disabled" @click="open = true">
      {{ tr('配置', 'Configure') }}<Icon name="arrow-up-right" :size="15" />
    </button>
  </div>
  <SettingsPage
    v-if="open"
    :page="mobile"
    content-class="settings-editor mobile-settings-page"
    :title="tr('内置工具', 'Built-in tools')"
    @close="open = false"
  >
    <div class="set-card">
      <ToolSwitchRows v-model="tools" :disabled="disabled" />
    </div>
  </SettingsPage>
</template>

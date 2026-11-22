<script setup lang="ts">
import { ref } from 'vue';
import type { ToolSwitches } from '../../core/api/projections.ts';
import { i18n } from '../../core/i18n/index.ts';
import SwitchRow from './SwitchRow.vue';
import { tr } from '../../core/i18n/tr.ts';
import ToolSwitchRows from './ToolSwitchRows.vue';
import ToolSettingsDialog from './ToolSettingsDialog.vue';
import ToolSettingsEntry from './ToolSettingsEntry.vue';

defineProps<{ disabled?: boolean; note?: string }>();
const tools = defineModel<ToolSwitches>({ required: true });
const open = ref(false);
</script>

<template>
  <SwitchRow v-model="tools.shell" name="Shell" :disabled="disabled" :hint="note ?? i18n.t('tools.shell.hint')" />
  <ToolSettingsEntry :title="tr('内置工具', 'Built-in tools')" icon="tool" :disabled="disabled" @click="open = true" />
  <ToolSettingsDialog :open="open" :title="tr('内置工具', 'Built-in tools')" :disabled="disabled" @close="open = false">
    <ToolSwitchRows v-model="tools" :disabled="disabled" short-labels />
  </ToolSettingsDialog>
</template>

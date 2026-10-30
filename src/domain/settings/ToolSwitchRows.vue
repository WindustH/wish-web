<script setup lang="ts">
import { i18n } from '../../core/i18n/index.ts';
// The switches of a session's built-in tools, or of new sessions'. MCP servers and skills are
// switched on their own pages and sections: they are not tools in the model's list.
import { computed } from 'vue';
import { tr } from '../../core/i18n/tr.ts';
import type { ToolSwitches } from '../../core/api/projections.ts';
import SegmentedControl from '../../ui/components/SegmentedControl.vue';
import type { ToolDelivery } from '../../core/api/projections.ts';
import SwitchRow from './SwitchRow.vue';

const props = defineProps<{
  searchAvailable: boolean | null;
  extensionRows?: readonly {
    key: Exclude<keyof ToolSwitches, 'mcp' | 'skills' | `${string}_delivery`>;
    name: string;
    hint: string;
  }[];
  compact?: boolean;
  include?: readonly (keyof ToolSwitches)[];
  /** Shown inside settings, where web search providers are a page away rather than a menu. */
  inSettings?: boolean;
  /** Said in every row instead of what the tool does, while the switches cannot be saved. */
  note?: string;
}>();
const tools = defineModel<ToolSwitches>({ required: true });
const rows = computed(() =>
  [
    { key: 'shell' as const, name: 'Shell', hint: i18n.t('tools.shell.hint') },
    {
      key: 'sessions' as const,
      name: 'Session',
      hint: i18n.t('tools.sessions.hint'),
    },
    {
      key: 'history_search' as const,
      name: 'History Search',
      hint: i18n.t('tools.history.hint'),
    },
    {
      key: 'ask_user' as const,
      name: 'Ask User',
      hint: i18n.t('tools.ask.hint'),
    },
    ...(props.extensionRows ?? []).map((row) =>
      row.key === 'web_search' && props.searchAvailable === false
        ? {
            ...row,
            hint: tr(
              '还没有能用的搜索服务，请在扩展工具中配置',
              'No search service is available; configure one under Extension tools',
            ),
          }
        : row,
    ),
  ].filter((row) => !props.include || props.include.includes(row.key)),
);
const deliveryOptions = computed(() => [
  { value: 'command', icon: 'terminal', label: i18n.t('tools.command'), disabled: !tools.value.shell },
  { value: 'tool', icon: 'tool', label: i18n.t('tools.direct') },
]);
const taskOptions = computed(() => [
  {
    value: 'off',
    icon: 'x',
    tone: 'danger' as const,
    label: i18n.t('tools.shellOff'),
    disabled: true,
  },
  ...deliveryOptions.value.map((option) => ({ ...option, disabled: !tools.value.shell })),
]);
const capabilityOptions = computed(() => [
  { value: 'off', icon: 'x', tone: 'danger' as const, label: i18n.t('tools.off') },
  ...deliveryOptions.value,
]);
function setCapability(
  key:
    | 'video_generate'
    | 'audio_generate'
    | 'audio_transcribe'
    | 'image_generate'
    | 'ask_user'
    | 'web_fetch'
    | 'web_search'
    | 'history_search'
    | 'sessions',
  value: string,
) {
  tools.value[key] = value !== 'off';
  if (value !== 'off') tools.value[deliveryKey(key)] = value as ToolDelivery;
}
function deliveryKey(
  key:
    | 'shell'
    | 'video_generate'
    | 'audio_generate'
    | 'audio_transcribe'
    | 'image_generate'
    | 'ask_user'
    | 'web_fetch'
    | 'web_search'
    | 'history_search'
    | 'sessions',
) {
  return key === 'shell'
    ? ('task_delivery' as const)
    : (`${key}_delivery` as
        | 'video_generate_delivery'
        | 'audio_generate_delivery'
        | 'audio_transcribe_delivery'
        | 'image_generate_delivery'
        | 'ask_user_delivery'
        | 'web_fetch_delivery'
        | 'web_search_delivery'
        | 'history_search_delivery'
        | 'sessions_delivery');
}
function delivery(
  key:
    | 'shell'
    | 'video_generate'
    | 'audio_generate'
    | 'audio_transcribe'
    | 'image_generate'
    | 'ask_user'
    | 'web_fetch'
    | 'web_search'
    | 'history_search'
    | 'sessions',
): ToolDelivery {
  return tools.value[deliveryKey(key)] ?? (key === 'shell' || key === 'sessions' ? 'command' : 'tool');
}
</script>

<template>
  <!-- A single-row picker changes the tool in place. Keep its SelectField mounted so
       closing the menu can restore focus instead of dismissing the containing panel. -->
  <template v-for="row in rows" :key="$slots.label && rows.length === 1 ? 'capability-picker' : row.key">
    <SwitchRow v-if="row.key === 'shell'" v-model="tools.shell" :name="row.name" :hint="note ?? row.hint" />
    <div v-else class="set-row inline capability-row" :class="{ compact }" :data-tool="row.key">
      <div v-if="$slots.label" class="capability-picker"><slot name="label" :row="row" /></div>
      <template v-else>
        <span class="set-label"
          ><span>{{ row.name }}</span
          ><small v-if="!compact || note">{{ note ?? row.hint }}</small></span
        >
      </template>
      <SegmentedControl
        class="tool-delivery"
        :label="`${row.name} ${i18n.t('tools.delivery')}`"
        :model-value="
          (row.key === 'history_search' ? tools.history_search === false : !tools[row.key])
            ? 'off'
            : tools.shell
              ? delivery(row.key)
              : 'tool'
        "
        :options="capabilityOptions"
        @update:model-value="setCapability(row.key, $event)"
      />
    </div>
    <div v-if="row.key === 'shell'" class="set-row inline capability-row">
      <span class="set-label"
        ><span>Task</span><small>{{ note ?? i18n.t('tools.taskHint') }}</small></span
      >
      <SegmentedControl
        class="tool-delivery"
        :label="i18n.t('tools.taskDelivery')"
        :model-value="tools.shell ? delivery('shell') : 'off'"
        :options="taskOptions"
        @update:model-value="tools.shell && $event !== 'off' && (tools.task_delivery = $event as ToolDelivery)"
      />
    </div>
  </template>
</template>

<style scoped>
.tool-delivery {
  width: 144px;
  max-width: 100%;
  flex-shrink: 0;
  justify-self: end;
  margin-inline-start: auto;
}
.capability-row {
  grid-template-columns: minmax(0, 1fr) auto;
  gap: 16px;
}
.capability-picker,
.capability-row .set-label {
  min-width: 0;
}
.capability-row.compact {
  min-height: 52px;
  padding: 6px 12px;
  gap: 8px;
}
.compact .tool-delivery {
  width: 132px;
}
.capability-row.compact:has(.capability-picker) {
  padding: 4px;
  gap: 4px;
}
.compact .capability-picker :deep(.control-select) {
  border-color: transparent;
  background: transparent;
  min-width: 0;
}
@media (max-width: 640px) {
  .capability-row {
    grid-template-columns: minmax(0, 1fr) auto;
    gap: 12px;
  }
  .tool-delivery {
    align-self: flex-end;
  }
}
</style>

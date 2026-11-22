<script setup lang="ts">
import { i18n } from '../../core/i18n/index.ts';
// The switches of a session's built-in tools, or of new sessions'. MCP servers and skills are
// switched on their own pages and sections: they are not tools in the model's list.
import { computed } from 'vue';
import { tr } from '../../core/i18n/tr.ts';
import type { ToolSwitches } from '../../core/api/projections.ts';
import type { ToolDelivery } from '../../core/api/projections.ts';
import SelectField from '../../ui/components/SelectField.vue';
import Icon from '../../ui/components/Icon.vue';
import SettingHint from './SettingHint.vue';

type ToolRow = {
  key: Exclude<keyof ToolSwitches, 'mcp' | 'skills' | `${string}_delivery`>;
  name: string;
  hint: string;
  icon?: string;
};
const props = defineProps<{
  searchAvailable?: boolean | null;
  disabled?: boolean;
  extensionRows?: readonly ToolRow[];
  shortLabels?: boolean;
  deliveryHelp?: string;
  include?: readonly (keyof ToolSwitches)[];
}>();
const tools = defineModel<ToolSwitches>({ required: true });
const rows = computed(() => {
  const candidates: readonly ToolRow[] = props.extensionRows ?? [
    { key: 'shell' as const, name: 'Shell', hint: i18n.t('tools.shell.hint') },
    {
      key: 'browser' as const,
      name: tr('浏览器', 'Browser'),
      hint: tr('与会话侧栏共用浏览器', 'Share a browser with the session sidebar'),
    },
    { key: 'blob' as const, name: 'Blob', hint: i18n.t('tools.blob.hint') },
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
  ];
  return candidates
    .filter((row) => !props.include || props.include.includes(row.key))
    .map((row) =>
      row.key === 'web_search' && props.searchAvailable === false
        ? {
            ...row,
            hint: tr(
              '还没有能用的搜索服务，请在扩展工具中配置',
              'No search service is available; configure one under Extension tools',
            ),
          }
        : row,
    );
});
const deliveryChoices = computed(() => [
  { value: 'off', label: tr('停用', 'Off') },
  {
    value: 'command',
    label: props.shortLabels ? tr('命令', 'Command') : tr('通过命令调用', 'Use as a command'),
    disabled: !tools.value.shell,
  },
  { value: 'tool', label: props.shortLabels ? tr('工具', 'Tool') : tr('作为工具调用', 'Use as a tool') },
]);
const taskChoices = computed(() =>
  tools.value.shell
    ? deliveryChoices.value.filter((choice) => choice.value !== 'off')
    : [{ value: 'off', label: i18n.t('tools.shellOff') }],
);
function setCapability(
  key:
    | 'video_generate'
    | 'audio_generate'
    | 'audio_transcribe'
    | 'image_generate'
    | 'browser'
    | 'ask_user'
    | 'web_fetch'
    | 'web_search'
    | 'blob'
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
    | 'browser'
    | 'ask_user'
    | 'web_fetch'
    | 'web_search'
    | 'blob'
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
        | 'browser_delivery'
        | 'ask_user_delivery'
        | 'web_fetch_delivery'
        | 'web_search_delivery'
        | 'blob_delivery'
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
    | 'browser'
    | 'ask_user'
    | 'web_fetch'
    | 'web_search'
    | 'blob'
    | 'history_search'
    | 'sessions',
): ToolDelivery {
  return (
    tools.value[deliveryKey(key)] ??
    (key === 'shell' || key === 'sessions' || key === 'browser' || key === 'blob' ? 'command' : 'tool')
  );
}
function capabilityValue(key: Exclude<(typeof rows.value)[number]['key'], 'shell'>) {
  const off = key === 'history_search' || key === 'blob' ? tools.value[key] === false : !tools.value[key];
  return off ? 'off' : tools.value.shell ? delivery(key) : 'tool';
}
</script>

<template>
  <template v-for="row in rows" :key="row.key">
    <div
      v-if="row.key !== 'shell'"
      class="set-row"
      :class="{ 'inline capability-row': deliveryHelp }"
      :data-tool="row.key"
    >
      <div v-if="deliveryHelp" class="set-field-heading">
        <span>{{ tr('启用方式', 'Delivery mode') }}</span>
        <SettingHint
          icon-only
          :text="[row.hint, deliveryHelp].join('\n\n')"
          :label="tr('启用方式说明', 'About delivery modes')"
        />
      </div>
      <div v-else class="tool-row-label">
        <Icon v-if="row.icon" :name="row.icon" />
        <span class="set-label"
          ><span>{{ row.name }}</span
          ><small>{{ row.hint }}</small></span
        >
      </div>
      <SelectField
        :disabled="disabled"
        class="delivery-select"
        :aria-label="`${row.name} ${i18n.t('tools.delivery')}`"
        :model-value="capabilityValue(row.key)"
        :options="deliveryChoices"
        @update:model-value="setCapability(row.key, $event)"
      />
    </div>
    <div v-if="row.key === 'shell'" class="set-row" data-tool="task">
      <span class="set-label"
        ><span>Task</span><small>{{ i18n.t('tools.taskHint') }}</small></span
      >
      <SelectField
        class="delivery-select"
        :disabled="disabled || !tools.shell"
        :aria-label="i18n.t('tools.taskDelivery')"
        :model-value="tools.shell ? delivery('shell') : 'off'"
        :options="taskChoices"
        @update:model-value="tools.shell && $event !== 'off' && (tools.task_delivery = $event as ToolDelivery)"
      />
    </div>
  </template>
</template>

<style scoped>
.tool-row-label {
  display: flex;
  align-items: center;
  gap: 10px;
  min-width: 0;
}
.tool-row-label .icon {
  flex: none;
  width: 17px;
  height: 17px;
  color: var(--fg-muted);
}
.delivery-select {
  justify-self: end;
  max-width: 100%;
}
.capability-row {
  grid-template-columns: minmax(0, 1fr) auto;
  gap: 16px;
}
.capability-row .set-label {
  min-width: 0;
}
@media (min-width: 900px) {
  .capability-row:has(.delivery-select) {
    grid-template-columns: minmax(0, 1fr) minmax(0, 1.3fr);
    column-gap: 24px;
  }
}
@media (max-width: 640px) {
  .capability-row {
    grid-template-columns: minmax(0, 1fr) auto;
    gap: 12px;
  }
}
</style>

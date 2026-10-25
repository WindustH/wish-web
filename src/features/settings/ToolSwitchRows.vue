<script setup lang="ts">
// The switches of a session's built-in tools, or of new sessions'. MCP servers and skills are
// switched on their own pages and sections: they are not tools in the model's list.
import { computed } from 'vue';
import { tr } from '../../core/i18n/tr.ts';
import type { ToolSwitches } from '../../core/api/projections.ts';
import SelectField from '../../ui/components/SelectField.vue';
import type { ToolDelivery } from '../../core/api/projections.ts';
import SwitchRow from './SwitchRow.vue';

const props = defineProps<{
  searchAvailable: boolean | null;
  /** Shown inside settings, where web search providers are a page away rather than a menu. */
  inSettings?: boolean;
  /** Said in every row instead of what the tool does, while the switches cannot be saved. */
  note?: string;
}>();
const tools = defineModel<ToolSwitches>({ required: true });
const rows = computed(() => [
  { key: 'web_fetch' as const, name: 'Web Fetch', hint: tr('通过网页读取提供商获取链接正文','Read webpages through configured fetch providers') },
  { key: 'shell' as const, name: 'Shell', hint: tr('在工作目录中执行命令', 'Run commands in the working directory') },
  { key: 'ask_user' as const, name: 'Ask User', hint: tr('需要你决定时，给出选项或请你填写', 'Offer choices or ask you to fill in details when your call is needed') },
  { key: 'web_search' as const, name: 'Web Search', hint: props.searchAvailable === false
    ? (props.inSettings ? tr('还没有能用的搜索提供商，先在「联网搜索」里添加', 'No search provider can answer yet; add one under Web search') : tr('还没有能用的搜索提供商，先在「设置 → 联网搜索」里添加', 'No search provider can answer yet; add one under Settings → Web search'))
    : tr('在网上搜索资料，由搜索提供商完成', 'Search the web through the search providers') },
]);
const deliveryOptions = computed(() => [
  { value: 'tool', label: tr('直接工具', 'Direct tool') },
  { value: 'command', label: tr('Wish 命令', 'Wish command'), disabled: !tools.value.shell },
]);
function deliveryKey(key: 'shell' | 'ask_user' | 'web_fetch' | 'web_search') {
  return key === 'shell' ? 'task_delivery' as const : `${key}_delivery` as 'ask_user_delivery' | 'web_fetch_delivery' | 'web_search_delivery';
}
function delivery(key: 'shell' | 'ask_user' | 'web_fetch' | 'web_search'): ToolDelivery {
  return tools.value[deliveryKey(key)] ?? (key === 'shell' ? 'command' : 'tool');
}
</script>

<template>
  <template v-for="row in rows" :key="row.key">
    <SwitchRow :model-value="!!tools[row.key]" @update:model-value="tools[row.key]=$event" :name="row.name" :hint="note ?? row.hint">
      <SelectField v-if="row.key !== 'shell' && tools[row.key]" class="tool-delivery" :aria-label="`${row.name} ${tr('提供方式', 'delivery')}`" :model-value="tools.shell ? delivery(row.key) : 'tool'" :options="deliveryOptions" @update:model-value="tools[deliveryKey(row.key)]=$event as ToolDelivery" />
    </SwitchRow>
    <div v-if="row.key === 'shell' && tools.shell" class="set-row inline">
      <span class="set-label"><span>Task</span><small>{{ tr('管理命令、输入输出及后台任务', 'Manage commands, input/output and background tasks') }}</small></span>
      <SelectField class="tool-delivery" :aria-label="tr('Task 提供方式', 'Task delivery')" :model-value="delivery('shell')" :options="deliveryOptions" @update:model-value="tools.task_delivery=$event as ToolDelivery" />
    </div>
  </template>
</template>

<style scoped>
.tool-delivery { width: 145px; max-width: 100%; flex-shrink: 0; }
@media (max-width: 640px) {
  .tool-delivery { width: 112px; }
  :deep(.toggle-row) { column-gap: 10px; }
}
</style>

<script setup lang="ts">
// The switches of a session's built-in tools, or of new sessions'. MCP servers and skills are
// switched on their own pages and sections: they are not tools in the model's list.
import { computed } from 'vue';
import { tr } from '../../core/i18n/tr.ts';
import type { ToolSwitches } from '../../core/api/projections.ts';
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
  { key: 'shell' as const, name: 'Shell', hint: tr('在工作目录中执行命令', 'Run commands in the working directory') },
  { key: 'ask_user' as const, name: 'Ask User', hint: tr('需要你决定时，给出选项或请你填写', 'Offer choices or ask you to fill in details when your call is needed') },
  { key: 'web_search' as const, name: 'Web Search', hint: props.searchAvailable === false
    ? (props.inSettings ? tr('还没有能用的搜索提供商，先在「联网搜索」里添加', 'No search provider can answer yet; add one under Web search') : tr('还没有能用的搜索提供商，先在「设置 → 联网搜索」里添加', 'No search provider can answer yet; add one under Settings → Web search'))
    : tr('在网上搜索资料，由搜索提供商完成', 'Search the web through the search providers') },
]);
</script>

<template>
  <SwitchRow v-for="row in rows" :key="row.key" v-model="tools[row.key]" :name="row.name" :hint="note ?? row.hint" />
</template>

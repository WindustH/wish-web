<script setup lang="ts">
// The switches of a session's built-in tools, or of new sessions'. MCP servers and skills are
// switched on their own pages and sections: they are not tools in the model's list.
import { computed } from 'vue';
import { tr } from '../../../core/i18n/tr.ts';
import type { ToolSwitches } from '../../../core/api/projections.ts';
import SegmentedControl from '../../components/SegmentedControl.vue';
import type { ToolDelivery } from '../../../core/api/projections.ts';
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
  {
    key: 'video_generate' as const,
    name: 'Video Generate',
    hint: tr('生成视频并保存到会话，支持继续查询任务', 'Generate videos into session blobs and resume task queries'),
  },
  {
    key: 'audio_generate' as const,
    name: 'Audio Generate',
    hint: tr('生成配音、音乐或音效', 'Generate speech, music or sound effects'),
  },
  {
    key: 'audio_transcribe' as const,
    name: 'Audio Transcribe',
    hint: tr('转写音频或视频中的语音，保留时间戳', 'Transcribe audio/video speech with timestamps'),
  },
  { key: 'shell' as const, name: 'Shell', hint: tr('在工作目录中执行命令', 'Run commands in the working directory') },
  {
    key: 'sessions' as const,
    name: 'Session',
    hint: tr('查看、创建和联系其他会话与群组', 'View, create and message other sessions and groups'),
  },
  {
    key: 'history_search' as const,
    name: 'History Search',
    hint: tr('搜索和读取当前会话的历史记录', 'Search and read this session’s history'),
  },
  {
    key: 'web_fetch' as const,
    name: 'Web Fetch',
    hint: tr('通过网页读取提供商获取链接正文', 'Read webpages through configured fetch providers'),
  },
  {
    key: 'image_generate' as const,
    name: 'Image Generate',
    hint: tr(
      '使用已配置的生图服务，结果保存到会话 blob',
      'Generate images using configured services and save to session blobs',
    ),
  },
  {
    key: 'ask_user' as const,
    name: 'Ask User',
    hint: tr(
      '需要你决定时，给出选项或请你填写',
      'Offer choices or ask you to fill in details when your call is needed',
    ),
  },
  {
    key: 'web_search' as const,
    name: 'Web Search',
    hint:
      props.searchAvailable === false
        ? props.inSettings
          ? tr(
              '还没有能用的搜索提供商，先在「联网搜索」里添加',
              'No search provider can answer yet; add one under Web search',
            )
          : tr(
              '还没有能用的搜索提供商，先在「设置 → 联网搜索」里添加',
              'No search provider can answer yet; add one under Settings → Web search',
            )
        : tr('在网上搜索资料，由搜索提供商完成', 'Search the web through the search providers'),
  },
]);
const deliveryOptions = computed(() => [
  { value: 'command', icon: 'terminal', label: tr('Wish 命令', 'Wish command'), disabled: !tools.value.shell },
  { value: 'tool', icon: 'tool', label: tr('直接工具', 'Direct tool') },
]);
const taskOptions = computed(() => [
  {
    value: 'off',
    icon: 'x',
    tone: 'danger' as const,
    label: tr('随 Shell 关闭', 'Off when Shell is off'),
    disabled: true,
  },
  ...deliveryOptions.value.map((option) => ({ ...option, disabled: !tools.value.shell })),
]);
const capabilityOptions = computed(() => [
  { value: 'off', icon: 'x', tone: 'danger' as const, label: tr('关闭', 'Off') },
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
  <template v-for="row in rows" :key="row.key">
    <SwitchRow v-if="row.key === 'shell'" v-model="tools.shell" :name="row.name" :hint="note ?? row.hint" />
    <div v-else class="set-row inline capability-row">
      <span class="set-label"
        ><span>{{ row.name }}</span
        ><small>{{ note ?? row.hint }}</small></span
      >
      <SegmentedControl
        class="tool-delivery"
        :label="`${row.name} ${tr('提供方式', 'delivery')}`"
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
        ><span>Task</span
        ><small>{{
          note ?? tr('管理命令、输入输出及后台任务', 'Manage commands, input/output and background tasks')
        }}</small></span
      >
      <SegmentedControl
        class="tool-delivery"
        :label="tr('Task 提供方式', 'Task delivery')"
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
.capability-row .set-label {
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

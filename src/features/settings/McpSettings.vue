<script setup lang="ts">
// The MCP servers sessions can call from their shell, edited in the settings draft.
import { computed, ref, toRef } from 'vue';
import Icon from '../../ui/components/Icon.vue';
import Modal from '../../ui/components/Modal.vue';
import SelectField from '../../ui/components/SelectField.vue';
import McpServer, { type McpServerConfig } from './McpServer.vue';
import { mcpServers, type McpServerStatus } from '../../core/api/endpoints.ts';
import { tr } from '../../core/i18n/tr.ts';
import { useStatuses } from './useStatuses.ts';

const props = defineProps<{
  config: any;
  providers: { value: string; label: string; brand?: string }[];
  save: () => Promise<boolean>;
  busy: boolean;
  dirty: boolean;
  revision: string;
}>();

const servers = computed<Record<string, McpServerConfig>>(() => (props.config.mcp ??= { servers: {} }).servers);
// A save may close instances or change servers, so they are read again after one.
const { statuses, refresh } = useStatuses(mcpServers, (list: McpServerStatus[]) => list, toRef(props, 'revision'));

const adding = ref(false);
const newName = ref('');
const newTransport = ref<'stdio' | 'http'>('stdio');
const opened = ref('');
const nameProblem = computed(() => {
  const name = newName.value.trim();
  if (!name) return '';
  if (!/^[A-Za-z0-9_-]+$/.test(name)) return tr('只能使用字母、数字、- 和 _', 'Letters, digits, - and _ only');
  if (servers.value[name]) return tr('已有同名服务器', 'A server has this name');
  return '';
});
const transports = [
  { value: 'stdio', label: tr('本地程序', 'Local program'), description: tr('在这台机器上启动，例如 npx、uvx', 'Started on this machine, such as npx or uvx') },
  { value: 'http', label: tr('远程服务', 'Remote server'), description: tr('通过网址连接', 'Reached by URL') },
];
function startAdding() {
  newName.value = '';
  newTransport.value = 'stdio';
  adding.value = true;
}
function add() {
  const name = newName.value.trim();
  if (!name || nameProblem.value) return;
  const common = { enabled: true, proxy_enabled: true, scope: 'session' as const, idle_timeout: 1800, timeout: 300 };
  servers.value[name] = newTransport.value === 'stdio'
    ? { ...common, transport: 'stdio', command: '', args: [], env: {} }
    : { ...common, transport: 'http', url: '', headers: {} };
  opened.value = name;
  adding.value = false;
}
</script>

<template>
  <section class="set-section">
    <header class="set-section-head"><h3>{{ tr('MCP 服务器', 'MCP servers') }}</h3><p>{{ tr('智能体在会话的 Shell 里用 wish mcp 调用这些服务器。它们的工具不进入模型的工具列表，增删服务器、在会话里开关 MCP 都不会让提示缓存失效。', 'The agent calls these servers with wish mcp in a session\'s shell. Their tools stay out of the model\'s tool list, so adding or removing servers, or switching MCP for a session, never resets the prompt cache.') }}</p></header>
    <div class="mcp-list">
      <McpServer v-for="(server, id) in servers" :key="id" :id="String(id)" :value="server" :status="statuses[id]" :providers="providers" :initially-open="id === opened" :save="save" :dirty="dirty" :busy="busy" @remove="delete servers[id]" @checked="refresh" />
      <p v-if="!Object.keys(servers).length" class="mcp-empty">{{ tr('还没有 MCP 服务器。', 'No MCP servers yet.') }}</p>
      <button type="button" class="provider-add" :disabled="busy" @click="startAdding"><span class="provider-add-icon"><Icon name="plus" /></span><span>{{ tr('添加 MCP 服务器', 'Add MCP server') }}</span></button>
    </div>
  </section>
  <Modal compact :open="adding" :title="tr('添加 MCP 服务器', 'Add MCP server')" @close="adding = false">
    <form class="mcp-add" @submit.prevent="add">
      <label class="mcp-add-field">{{ tr('名称', 'Name') }}<input class="input set-mono" v-model="newName" placeholder="context7" autocomplete="off" autocapitalize="off" spellcheck="false" /><small :class="{ problem: nameProblem }">{{ nameProblem || tr('模型用 wish mcp call 名称/工具 调用它', 'The model calls it as wish mcp call name/tool') }}</small></label>
      <div class="mcp-add-field">{{ tr('连接方式', 'Transport') }}<SelectField segmented v-model="newTransport" :options="transports" /></div>
    </form>
    <template #footer><button class="btn" @click="adding = false">{{ tr('取消', 'Cancel') }}</button><button class="btn primary" :disabled="!newName.trim() || !!nameProblem" @click="add">{{ tr('添加', 'Add') }}</button></template>
  </Modal>
</template>

<style scoped>
.mcp-list { display: grid; gap: 12px; }
.mcp-empty { margin: 0; padding: 18px 16px; border: 1px dashed var(--line-strong); border-radius: 12px; color: var(--fg-subtle); font-size: 13px; text-align: center; }
.mcp-add { display: grid; gap: 16px; }
.mcp-add-field { display: grid; gap: 8px; font-size: 13px; font-weight: 500; color: var(--fg); }
.mcp-add-field small { font-weight: 400; font-size: 12px; color: var(--fg-subtle); }
.mcp-add-field small.problem { color: var(--err); }
.mcp-add .input::placeholder { font-family: var(--font); }
@media (max-width: 899px) {
  /* A grouped list: rows one step above the page, parted by a sliver of it. */
  .mcp-list { gap: 0; overflow: hidden; border: 0; border-radius: 18px; background: var(--bg-sunken); }
  .mcp-list > * + * { border-top: 2px solid transparent; }
  .mcp-empty { border: 0; border-radius: 0; background: var(--bg-group); background-clip: padding-box; }
}
</style>

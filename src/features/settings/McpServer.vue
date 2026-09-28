<script setup lang="ts">
// One MCP server: a card with what is known of it, and its editor.
import { computed, ref } from 'vue';
import { SwitchRoot, SwitchThumb } from 'reka-ui';
import Icon from '../../ui/components/Icon.vue';
import Hint from '../../ui/components/Hint.vue';
import Modal from '../../ui/components/Modal.vue';
import SelectField from '../../ui/components/SelectField.vue';
import AnimatedDetails from '../../ui/components/AnimatedDetails.vue';
import KeyValueEditor from './KeyValueEditor.vue';
import { useMedia } from '../../ui/composables/useMedia.ts';
import { mcpCheck, type McpServerStatus } from '../../core/api/endpoints.ts';
import { showError } from '../../ui/errorDialog.ts';
import { toast } from '../../ui/toast.ts';
import { describeError } from '../../core/i18n/errorMessages.ts';
import { tr } from './fields.ts';

export interface McpServerConfig {
  enabled: boolean;
  transport: 'stdio' | 'http';
  command?: string;
  args?: string[];
  env?: Record<string, string>;
  cwd?: string | null;
  url?: string;
  headers?: Record<string, string>;
  auth_provider?: string | null;
  proxy_enabled: boolean;
  scope: 'session' | 'shared';
  idle_timeout: number;
  timeout: number;
}

const props = defineProps<{
  id: string;
  value: McpServerConfig;
  status?: McpServerStatus;
  providers: { value: string; label: string; brand?: string }[];
  initiallyOpen?: boolean;
  save?: () => Promise<boolean>;
  dirty?: boolean;
  busy?: boolean;
}>();
const emit = defineEmits<{ remove: []; checked: [] }>();
const isMobile = useMedia('(max-width: 899px)');
const editing = ref(props.initiallyOpen ?? false);
const checking = ref(false);

const stdio = computed(() => props.value.transport === 'stdio');
const target = computed(() => stdio.value
  ? [props.value.command, ...(props.value.args ?? [])].filter(Boolean).join(' ')
  : props.value.url ?? '');
const tools = computed(() => props.status?.tools ?? null);
const summary = (text?: string) => text?.split('\n').map(line => line.trim()).find(Boolean) ?? '';
// The server's message leads; the program's own output follows it on later lines.
const errorSummary = computed(() => props.status?.error ? describeError(props.status.error.split('\n')[0]).message : '');
const state = computed(() => {
  if (!props.value.enabled) return { kind: 'disabled', text: tr('已停用', 'Disabled') };
  if (props.status?.error) return { kind: 'error', text: tr('连接失败', 'Failed') };
  if (tools.value) return { kind: 'ok', text: tr(`${tools.value.length} 个工具`, `${tools.value.length} tool${tools.value.length === 1 ? '' : 's'}`) };
  return { kind: 'idle', text: tr('尚未连接', 'Not connected yet') };
});
const running = computed(() => props.status?.instances
  ? tr(`${props.status.instances} 个实例运行中`, `${props.status.instances} running`) : '');

const argsText = computed({
  get: () => (props.value.args ?? []).join('\n'),
  set: (text: string) => { props.value.args = text.split('\n').map(line => line.trim()).filter(Boolean); },
});
const cwd = computed({
  get: () => props.value.cwd ?? '',
  set: (text: string) => { props.value.cwd = text.trim() || null; },
});
const authProvider = computed({
  get: () => props.value.auth_provider ?? '',
  set: (id: string) => { props.value.auth_provider = id || null; },
});
const transports = [
  { value: 'stdio', label: tr('本地程序', 'Local program'), description: 'stdio' },
  { value: 'http', label: tr('远程服务', 'Remote server'), description: 'Streamable HTTP' },
];
const scopes = [
  { value: 'session', label: tr('每个会话一份', 'One per session'), description: tr('推荐。在会话的工作目录里启动，互不影响', 'Recommended. Started in the session\'s directory, kept apart') },
  { value: 'shared', label: tr('所有会话共用', 'Shared by all sessions'), description: tr('只适合不保存状态的服务器', 'Only for servers that keep no state') },
];
const providerOptions = computed(() => [{ value: '', label: tr('不使用', 'None') }, ...props.providers]);

// The server connects to what is saved, so unsaved edits are saved first.
async function check() {
  if (checking.value) return;
  checking.value = true;
  try {
    if (props.dirty && props.save && !(await props.save())) return;
    const result = await mcpCheck(props.id);
    toast(tr(`${props.id} 已连接，找到 ${result.tools.length} 个工具`, `${props.id} connected: ${result.tools.length} tool${result.tools.length === 1 ? '' : 's'}`));
  } catch (error) {
    showError({ title: tr('无法连接 MCP 服务器', 'Could not connect to the MCP server'), error });
  } finally {
    checking.value = false;
    emit('checked');
  }
}
</script>

<template>
  <div class="mcp-item">
    <button v-if="isMobile" type="button" class="mobile-settings-row mcp-navigation" @click="editing = true">
      <span class="mcp-mark"><Icon :name="stdio ? 'terminal' : 'globe'" /></span>
      <span>{{ id }}<small class="row-preview">{{ target || (stdio ? tr('未填写命令', 'No command') : tr('未填写地址', 'No URL')) }}</small></span>
      <small class="mcp-state" :class="state.kind">{{ state.text }}</small>
      <Icon name="chevron-right" />
    </button>
    <header v-else class="mcp-heading" @click="($event.target as Element).closest('button') || (editing = true)">
      <span class="mcp-mark"><Icon :name="stdio ? 'terminal' : 'globe'" /></span>
      <div class="mcp-identity">
        <div class="mcp-title-line"><h2>{{ id }}</h2><span class="mcp-state" :class="state.kind">{{ state.text }}</span><small v-if="running" class="mcp-running">{{ running }}</small></div>
        <small>{{ stdio ? tr('本地程序', 'Local program') : tr('远程服务', 'Remote server') }} · <span class="set-mono">{{ target || '—' }}</span></small>
      </div>
      <div class="mcp-actions">
        <Hint :text="tr('连接并列出工具', 'Connect and list tools')"><button type="button" class="btn ghost icon-only" :disabled="checking || busy" :aria-label="tr('检查 ', 'Check ') + id" @click="check"><Icon :name="checking ? 'loader-circle' : 'refresh-cw'" :class="{ spin: checking }" /></button></Hint>
        <Hint :text="tr('编辑服务器', 'Edit server')"><button type="button" class="btn ghost icon-only" :aria-label="tr('编辑 ', 'Edit ') + id" @click="editing = true"><Icon name="pencil" /></button></Hint>
        <Hint :text="tr('删除服务器', 'Delete server')"><button type="button" class="btn ghost icon-only mcp-remove" :aria-label="tr('删除 ', 'Delete ') + id" @click="emit('remove')"><Icon name="trash-2" /></button></Hint>
      </div>
    </header>
    <div v-if="!isMobile && status?.error" class="mcp-error">
      <Icon name="triangle-alert" /><div><p>{{ errorSummary }}</p><details><summary>{{ tr('完整信息', 'Full message') }}</summary><pre>{{ status.error }}</pre></details></div>
    </div>
    <AnimatedDetails v-if="!isMobile && tools?.length" class="mcp-tools">
      <summary><span class="mcp-tools-label"><Icon name="wrench" />{{ tr('工具', 'Tools') }}</span><span class="mcp-tool-count">{{ tools.length }}</span><Icon name="chevron-down" class="mcp-tools-chevron" /></summary>
      <ul><li v-for="tool in tools" :key="tool.name"><code>{{ tool.name }}</code><span>{{ summary(tool.description) }}</span></li></ul>
    </AnimatedDetails>

    <Modal compact wide :page="isMobile" :open="editing" :content-class="isMobile ? 'settings-editor mobile-settings-page' : 'settings-editor'" :title="isMobile ? id : tr('编辑 MCP 服务器 · ', 'Edit MCP server · ') + id" @close="editing = false">
      <div class="mcp-form">
        <div class="set-card">
          <div class="set-row inline toggle-row"><span class="set-label"><span>{{ tr('启用', 'Enabled') }}</span><small>{{ tr('停用后保留配置，但会话不能调用', 'Kept in the configuration, but sessions cannot call it') }}</small></span><SwitchRoot v-model="value.enabled" class="cfg-switch" :aria-label="tr('启用', 'Enabled')"><SwitchThumb class="cfg-switch-thumb" /></SwitchRoot></div>
          <label class="set-row"><span class="set-label"><span>{{ tr('连接方式', 'Transport') }}</span><small>{{ stdio ? tr('在这台机器上启动，通过标准输入输出通信', 'Started on this machine; talks over standard input and output') : tr('通过 Streamable HTTP 连接', 'Reached over Streamable HTTP') }}</small></span><SelectField mobile-page :picker-title="tr('连接方式', 'Transport')" v-model="value.transport" :options="transports" /></label>
        </div>

        <div v-if="stdio" class="set-card">
          <label class="set-row"><span class="set-label"><span>{{ tr('命令', 'Command') }}</span><small>{{ tr('不是路径时在 PATH 中查找', 'Looked up on PATH unless it is a path') }}</small></span><input class="input set-mono" v-model.trim="value.command" placeholder="npx" autocomplete="off" autocapitalize="off" spellcheck="false" /></label>
          <label class="set-row"><span class="set-label"><span>{{ tr('参数', 'Arguments') }}</span><small>{{ tr('每行一个', 'One per line') }}</small></span><textarea class="input set-mono" rows="3" v-model.lazy="argsText" placeholder="-y&#10;@upstash/context7-mcp" autocomplete="off" autocapitalize="off" spellcheck="false" /></label>
          <label class="set-row"><span class="set-label"><span>{{ tr('工作目录', 'Working directory') }}</span><small>{{ tr('留空时在会话的工作目录中启动', 'Empty starts it in the session\'s directory') }}</small></span><input class="input set-mono" v-model.lazy="cwd" :placeholder="tr('会话的工作目录', 'The session\'s directory')" autocomplete="off" autocapitalize="off" spellcheck="false" /></label>
          <div class="set-row stacked"><span class="set-label"><span>{{ tr('环境变量', 'Environment') }}</span><small>{{ tr('加在 wish 自身的环境之上，常用来传入密钥', 'Added to wish\'s own environment; often carries keys') }}</small></span><KeyValueEditor v-model="value.env" :name-placeholder="tr('变量名', 'Name')" :value-placeholder="tr('值', 'Value')" :add-label="tr('添加变量', 'Add variable')" /></div>
        </div>
        <div v-else class="set-card">
          <label class="set-row"><span class="set-label"><span>{{ tr('地址', 'URL') }}</span><small>{{ tr('服务器的 MCP 端点', 'The server\'s MCP endpoint') }}</small></span><input class="input set-mono" v-model.trim="value.url" placeholder="https://example.com/mcp" autocomplete="off" autocapitalize="off" spellcheck="false" /></label>
          <label class="set-row"><span class="set-label"><span>{{ tr('使用提供商的密钥', 'Use a provider\'s key') }}</span><small>{{ tr('服务器随订阅附带时，直接用那个提供商的密钥认证', 'For a server that comes with a subscription a provider already has') }}</small></span><SelectField mobile-page :picker-title="tr('使用提供商的密钥', 'Use a provider\'s key')" v-model="authProvider" :options="providerOptions" /></label>
          <div class="set-row stacked"><span class="set-label"><span>{{ tr('请求头', 'Headers') }}</span><small>{{ tr('每个请求都会带上', 'Sent with every request') }}</small></span><KeyValueEditor v-model="value.headers" :name-placeholder="tr('名称', 'Name')" :value-placeholder="tr('值', 'Value')" :add-label="tr('添加请求头', 'Add header')" /></div>
          <div class="set-row inline toggle-row"><span class="set-label"><span>{{ tr('使用代理', 'Use proxy') }}</span><small>{{ tr('按「提供商」中的网络代理设置连接', 'Connect through the network proxy set under Providers') }}</small></span><SwitchRoot v-model="value.proxy_enabled" class="cfg-switch" :aria-label="tr('使用代理', 'Use proxy')"><SwitchThumb class="cfg-switch-thumb" /></SwitchRoot></div>
        </div>

        <div class="set-card">
          <label class="set-row"><span class="set-label"><span>{{ tr('实例', 'Instances') }}</span><small>{{ tr('服务器第一次被调用时启动', 'Started when first called') }}</small></span><SelectField mobile-page :picker-title="tr('实例', 'Instances')" v-model="value.scope" :options="scopes" /></label>
          <label class="set-row inline"><span class="set-label"><span>{{ tr('空闲关闭', 'Close when idle') }}</span><small>{{ tr('多久没有调用就关闭，单位秒；0 表示不关闭', 'Seconds without a call; 0 keeps it open') }}</small></span><span class="set-number"><input class="input" type="number" min="0" inputmode="numeric" v-model.number="value.idle_timeout" /></span></label>
          <label class="set-row inline"><span class="set-label"><span>{{ tr('调用超时', 'Call timeout') }}</span><small>{{ tr('多久没有结果或进度就放弃，单位秒', 'Seconds without a result or progress') }}</small></span><span class="set-number"><input class="input" type="number" min="1" inputmode="numeric" v-model.number="value.timeout" /></span></label>
        </div>

        <div v-if="isMobile" class="set-card">
          <div class="set-row inline"><span class="set-label"><span>{{ state.text }}</span><small>{{ running || tr('连接一次，读取它提供的工具', 'Connect once and read its tools') }}</small></span><button type="button" class="btn" :disabled="checking || busy" @click="check"><Icon v-if="checking" name="loader-circle" class="spin" />{{ tr('检查', 'Check') }}</button></div>
          <div v-if="status?.error" class="mcp-error"><Icon name="triangle-alert" /><div><p>{{ errorSummary }}</p><details><summary>{{ tr('完整信息', 'Full message') }}</summary><pre>{{ status.error }}</pre></details></div></div>
          <div v-for="tool in tools ?? []" :key="tool.name" class="set-row stacked mcp-tool-row"><span class="set-label"><span class="set-mono">{{ tool.name }}</span><small>{{ summary(tool.description) }}</small></span></div>
        </div>
        <button v-if="isMobile" type="button" class="btn danger mcp-mobile-remove" @click="editing = false; emit('remove')"><Icon name="trash-2" />{{ tr('删除服务器', 'Delete server') }}</button>
      </div>
      <template v-if="!isMobile" #footer><span class="hint">{{ tr('修改保留在设置草稿中，保存后生效。', 'Changes remain in the settings draft until saved.') }}</span><button class="btn primary" @click="editing = false">{{ tr('完成', 'Done') }}</button></template>
    </Modal>
  </div>
</template>

<style scoped>
.mcp-item { min-width: 0; border: 1px solid var(--line); border-radius: 12px; background: var(--bg-raised); overflow: hidden; }
.mcp-heading { display: flex; align-items: center; gap: 12px; padding: 14px 16px; cursor: pointer; transition: background var(--dur-fast); }
@media (hover: hover) { .mcp-heading:hover { background: var(--bg-hover); } }
.mcp-mark { display: grid; place-items: center; flex: none; width: 40px; height: 40px; border: 1px solid var(--line); border-radius: 10px; background: var(--bg); color: var(--fg-muted); }
.mcp-mark .icon { width: 18px; height: 18px; }
.mcp-identity { flex: 1; min-width: 0; }
.mcp-title-line { display: flex; align-items: center; flex-wrap: wrap; gap: 8px; }
.mcp-heading h2 { margin: 0; font-size: 15px; line-height: 1.4; }
.mcp-heading small { display: block; color: var(--fg-subtle); font-size: 12px; line-height: 1.5; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.mcp-heading small .set-mono { font-size: calc(12px * var(--mono-scale)) !important; }
.mcp-running { display: inline !important; }
.mcp-state { display: inline-flex; align-items: center; gap: 5px; padding: 1px 8px 1px 7px; border-radius: 99px; font-size: 11px; font-weight: 500; line-height: 1.6; white-space: nowrap; background: var(--bg-sunken); color: var(--fg-subtle); }
.mcp-state::before { content: ''; width: 6px; height: 6px; border-radius: 50%; background: currentColor; }
.mcp-state.ok { background: color-mix(in srgb, var(--ok) 13%, transparent); color: var(--ok); }
.mcp-state.error { background: var(--err-bg); color: var(--err); }
.mcp-actions { display: flex; align-items: center; gap: 4px; flex: none; }
.mcp-remove { color: var(--fg-subtle); }
@media (hover: hover) { .mcp-remove:hover { color: var(--err); background: var(--err-bg); } }
.mcp-error { display: flex; gap: 10px; padding: 10px 16px 12px; border-top: 1px solid var(--line); color: var(--err); font-size: 12.5px; line-height: 1.6; }
.mcp-error > .icon { flex: none; width: 15px; height: 15px; margin-top: 3px; }
.mcp-error > div { min-width: 0; }
.mcp-error p { margin: 0; overflow-wrap: anywhere; }
.mcp-error summary { cursor: pointer; color: var(--fg-subtle); }
.mcp-error pre { margin: 6px 0 0; padding: 8px 10px; max-height: 240px; overflow: auto; border-radius: 8px; background: var(--bg-sunken); color: var(--fg-muted); font: calc(12px * var(--mono-scale))/1.6 var(--mono); white-space: pre-wrap; overflow-wrap: anywhere; }
.mcp-tools { margin: 0; border-top: 1px solid var(--line); }
.mcp-tools > summary { display: flex; align-items: center; gap: 8px; min-height: 42px; padding: 8px 16px; cursor: pointer; color: var(--fg-muted); font-size: 12px; list-style: none; transition: background var(--dur-fast), color var(--dur-fast); }
.mcp-tools > summary::-webkit-details-marker { display: none; }
@media (hover: hover) { .mcp-tools > summary:hover { background: var(--bg-hover); color: var(--fg); } }
.mcp-tools-label { display: inline-flex; align-items: center; gap: 8px; }
.mcp-tools-label .icon { width: 14px; height: 14px; }
.mcp-tool-count { min-width: 22px; padding: 1px 6px; border-radius: 5px; background: var(--bg-sunken); text-align: center; font-variant-numeric: tabular-nums; }
.mcp-tools-chevron { width: 15px; height: 15px; margin-left: auto; transition: transform var(--dur-fast); }
.mcp-tools[open] .mcp-tools-chevron { transform: rotate(180deg); }
.mcp-tools ul { display: grid; gap: 2px; margin: 0; padding: 0 16px 12px; list-style: none; }
.mcp-tools li { display: grid; grid-template-columns: minmax(0, 14em) minmax(0, 1fr); gap: 12px; padding: 5px 0; font-size: 12.5px; line-height: 1.55; }
.mcp-tools code { font: calc(12.5px * var(--mono-scale))/1.55 var(--mono); color: var(--fg); overflow-wrap: anywhere; }
.mcp-tools li span { color: var(--fg-subtle); }
.mcp-form { display: grid; gap: 16px; }
.mcp-form .set-row input::placeholder, .mcp-form .set-row textarea::placeholder { font-family: var(--font); }
.mcp-form textarea { min-height: 80px; resize: vertical; }
.mcp-form .set-row.inline > .btn { display: inline-flex; align-items: center; gap: 6px; }
.mcp-tool-row { min-height: 0; }
.hint { font-size: 12px; color: var(--fg-subtle); margin-right: auto; }
@media (max-width: 899px) {
  /* Servers are rows of one grouped list; dividers start after the icon. */
  .mcp-item { border: 0; border-radius: 0; background: transparent; }
  .mcp-item + .mcp-item { background: linear-gradient(var(--line), var(--line)) right top / calc(100% - 62px) 1px no-repeat; }
  .mcp-navigation { width: 100%; min-height: 64px; gap: 14px; }
  .mcp-navigation .mcp-mark { width: 34px; height: 34px; }
  .mcp-navigation .mcp-state { flex: none; }
  .mcp-navigation .row-preview { font-family: var(--mono); font-size: calc(11.5px * var(--mono-scale)); }
  .mcp-mobile-remove { width: 100%; min-height: 52px; border: 1px solid var(--line); border-radius: 14px; background: var(--bg-raised); color: var(--err); }
}
</style>

<script setup lang="ts">
// Settings that belong to this session alone: context compaction and its shell.
// New sessions keep taking the defaults from Settings → Service & sessions.
import { computed, onMounted, onUnmounted, ref, watch } from 'vue';
import { SwitchRoot, SwitchThumb } from 'reka-ui';
import { get } from '../../core/api/client.js';
import * as api from '../../core/api/endpoints.js';
import { chat } from '../../core/state/chatSlice.js';
import { i18n } from '../../core/i18n/index.js';
import { tr } from '../../core/i18n/tr';
import Modal from '../../ui/components/Modal.vue';
import Icon from '../../ui/components/Icon.vue';
import { useMedia } from '../../ui/composables/useMedia.js';
import { showError } from '../../ui/errorDialog';
import { toast } from '../../ui/toast';
import { compactionFields } from '../settings/fields';
import ServerShellSettings, { type ShellCatalog } from '../settings/ServerShellSettings.vue';
import '../settings/settings.css';

defineEmits<{ close: [] }>();
const isMobile = useMedia('(max-width: 899px)');
const snapshot = computed(() => chat.snapshot.value);
const running = computed(() => snapshot.value?.phase !== 'idle');
const hasShell = computed(() => !!snapshot.value?.descriptor?.shell);

type Compaction = { trigger_tokens: number; target_tokens: number; segment_tokens: number; [key: string]: unknown };
type Shell = { program: string; args: string[] | null };
const compaction = ref<Compaction | null>(null);
const ownShell = ref(false);
const shell = ref<Shell>({ program: '', args: null });
const source = ref('');
const draftValue = () => JSON.stringify({ compaction: compaction.value, shell: ownShell.value ? shell.value : null });
const dirty = computed(() => !!source.value && draftValue() !== source.value);

let loadedFor: string | null = null;
function reset() {
  const current = snapshot.value;
  if (!current) return;
  loadedFor = current.id;
  compaction.value = current.config?.compaction ? structuredClone(current.config.compaction) : null;
  const own = current.descriptor?.shell_command;
  ownShell.value = !!own;
  shell.value = own ? { program: own.program ?? '', args: own.args ?? null } : { program: '', args: null };
  source.value = draftValue();
}
// The page can open before the session's snapshot arrives (a direct link);
// build the draft once it does, and again for another session — never over edits.
watch(snapshot, value => { if (value && value.id !== loadedFor) reset(); }, { immediate: true });

// What the global settings would give: the reset target and the shell label.
const defaults = ref<Compaction | null>(null);
const catalog = ref<ShellCatalog | null>(null);
const globalShell = ref<Shell | null>(null);
let alive = true;
onUnmounted(() => { alive = false; });
onMounted(async () => {
  const [base, shells, config] = await Promise.allSettled([get('/defaults'), get('/shells'), get('/config')]);
  if (!alive) return;
  if (base.status === 'fulfilled') defaults.value = base.value.session_config?.compaction ?? null;
  if (shells.status === 'fulfilled') catalog.value = shells.value;
  if (config.status === 'fulfilled') globalShell.value = config.value.config.shell ?? null;
});
const shellName = (value: Shell | null) => {
  const program = value?.program || catalog.value?.default.program;
  return program ? program.split(/[\\/]/).pop() : tr('系统默认', 'System default');
};
const differsFromDefaults = computed(() => !!defaults.value && JSON.stringify(compaction.value) !== JSON.stringify(defaults.value));

// Leaving the global shell starts from its values rather than a blank choice.
function setOwnShell(own: boolean) {
  ownShell.value = own;
  if (own && !snapshot.value?.descriptor?.shell_command && globalShell.value) shell.value = { program: globalShell.value.program ?? '', args: globalShell.value.args ?? null };
}
const useDefaults = () => { compaction.value = structuredClone(defaults.value); };
function setCompaction(enabled: boolean) {
  compaction.value = enabled ? structuredClone(snapshot.value?.config?.compaction ?? defaults.value) : null;
}
const compactTokens = (value: unknown) => typeof value === 'number' && value > 0
  ? new Intl.NumberFormat(i18n.locale.value === 'zh' ? 'zh-CN' : 'en', { notation: 'compact', maximumFractionDigits: 1 }).format(value)
  : '';

const busy = ref(false);
async function save() {
  const id = chat.sessionId.value;
  const current = snapshot.value;
  if (!id || !current || busy.value) return;
  const saved = JSON.parse(source.value);
  busy.value = true;
  try {
    if (JSON.stringify(compaction.value) !== JSON.stringify(saved.compaction)) {
      const next = await api.sessionUpdateConfig(id, { ...current.config, compaction: compaction.value }, current.revision);
      if (chat.sessionId.value === id) chat.snapshot.value = next;
    }
    const wanted = ownShell.value ? shell.value : null;
    if (JSON.stringify(wanted) !== JSON.stringify(saved.shell)) {
      const next = await api.sessionSetShell(id, wanted);
      if (chat.sessionId.value === id) chat.snapshot.value = next;
    }
    if (chat.sessionId.value === id) { reset(); toast(tr('会话设置已保存。', 'Session settings saved.')); }
  } catch (error) {
    showError({ title: tr('无法保存会话设置', 'Could not save session settings'), error });
  } finally {
    busy.value = false;
  }
}

// Context actions that used to live in the management window.
const confirmClear = ref(false);
async function act(kind: 'compact' | 'clear') {
  const id = chat.sessionId.value;
  if (!id || busy.value) return;
  busy.value = true;
  try {
    if (kind === 'compact') {
      await api.sessionCompact(id);
      toast(tr('已开始压缩上下文。', 'Compaction started.'));
    } else {
      await api.sessionClearContext(id);
      confirmClear.value = false;
      await chat.reload();
      toast(tr('已清空当前上下文，历史记录仍然保留。', 'Context cleared. History is kept.'));
    }
  } catch (error) {
    showError({ title: kind === 'compact' ? tr('无法压缩上下文', 'Could not compact the context') : tr('无法清空上下文', 'Could not clear the context'), error });
  } finally {
    busy.value = false;
  }
}
</script>

<template>
  <Modal :open="true" content-class="session-window session-settings-window" :title="tr('会话设置', 'Session settings')" :page="isMobile" @close="$emit('close')">
    <p class="session-settings-intro">{{ tr('只影响这个会话。新建会话仍使用「设置 → 服务与会话」中的默认值。', 'These apply to this session only. New sessions keep using the defaults in Settings → Service & sessions.') }}</p>

    <section class="set-section">
      <header class="set-section-head"><h3>{{ tr('上下文压缩', 'Context compaction') }}</h3><p>{{ tr('对话接近上限时，把较早的内容压缩成摘要。', 'Summarizes earlier turns as the conversation approaches its limit.') }}</p></header>
      <div class="set-card">
        <div class="set-row inline toggle-row"><span class="set-label"><span>{{ tr('自动压缩', 'Compact automatically') }}</span><small v-if="running">{{ tr('运行结束后才能保存这项修改', 'Can be saved once the current run ends') }}</small></span><SwitchRoot :model-value="!!compaction" class="cfg-switch" :aria-label="tr('自动压缩', 'Compact automatically')" @update:model-value="setCompaction"><SwitchThumb class="cfg-switch-thumb" /></SwitchRoot></div>
        <template v-if="compaction">
          <label v-for="field in compactionFields()" :key="field.key" class="set-row inline"><span class="set-label"><span>{{ field.label }}</span><small>{{ field.hint }}</small></span><span class="set-number"><em>{{ compactTokens(compaction[field.key]) }}</em><input class="input" type="number" min="1" inputmode="numeric" v-model.number="compaction[field.key]" /></span></label>
        </template>
      </div>
      <button v-if="compaction && differsFromDefaults" type="button" class="btn ghost set-reset" @click="useDefaults"><Icon name="refresh-cw" />{{ tr('使用全局默认值', 'Use the global defaults') }}</button>
      <div class="set-card context-actions">
        <div class="set-row inline"><span class="set-label"><span>{{ tr('立即压缩', 'Compact now') }}</span><small>{{ tr('现在就把较早的内容压缩成摘要', 'Summarize earlier turns right away') }}</small></span><button type="button" class="btn" :disabled="busy || !snapshot?.config?.compaction" @click="act('compact')">{{ tr('压缩', 'Compact') }}</button></div>
        <div class="set-row inline"><span class="set-label"><span>{{ tr('清空上下文', 'Clear the context') }}</span><small>{{ tr('之后从空白上下文继续，历史记录保留', 'Continue from an empty context; history is kept') }}</small></span><button type="button" class="btn danger" :disabled="busy" @click="confirmClear = true">{{ tr('清空', 'Clear') }}</button></div>
      </div>
    </section>

    <section v-if="hasShell" class="set-section">
      <header class="set-section-head"><h3>Shell</h3><p>{{ tr('修改后从这个会话的下一条命令开始生效。', 'Applies from this session\'s next command.') }}</p></header>
      <div class="set-card">
        <div class="set-row inline toggle-row"><span class="set-label"><span>{{ tr('跟随全局设置', 'Follow the global setting') }}</span><small>{{ tr('当前全局：', 'Global: ') }}{{ shellName(globalShell) }}</small></span><SwitchRoot :model-value="!ownShell" class="cfg-switch" :aria-label="tr('跟随全局设置', 'Follow the global setting')" @update:model-value="setOwnShell(!$event)"><SwitchThumb class="cfg-switch-thumb" /></SwitchRoot></div>
        <ServerShellSettings v-if="ownShell" :value="shell" :catalog="catalog" />
      </div>
    </section>

    <template #footer>
      <span class="session-settings-status">{{ dirty ? tr('有未保存的修改', 'Unsaved changes') : tr('没有未保存的修改', 'No unsaved changes') }}</span>
      <button type="button" class="btn ghost" :disabled="busy || !dirty" @click="reset">{{ tr('放弃', 'Discard') }}</button>
      <button type="button" class="btn primary" :disabled="busy || !dirty" @click="save"><Icon :name="busy ? 'loader-circle' : 'save'" :class="{ spin: busy }" />{{ tr('保存', 'Save') }}</button>
    </template>
  </Modal>
  <Modal compact :open="confirmClear" :dismissable="!busy" :title="tr('清空当前上下文？', 'Clear the current context?')" @close="confirmClear = false">
    <p>{{ tr('模型之后看不到之前的对话内容，历史记录仍然保留并可以搜索。', 'The model will no longer see earlier turns. History stays available and searchable.') }}</p>
    <template #footer><button class="btn ghost" :disabled="busy" @click="confirmClear = false">{{ tr('取消', 'Cancel') }}</button><button class="btn danger" :disabled="busy" @click="act('clear')">{{ tr('清空', 'Clear') }}</button></template>
  </Modal>
</template>

<style>
.modal-card.session-settings-window:not(.modal-page) { width: min(92vw, 30rem); }
.session-settings-intro { margin: 0 0 18px; font-size: 12px; line-height: 1.6; color: var(--fg-subtle); }
.session-settings-window .set-row.inline { grid-template-columns: minmax(0, 1fr) auto; }
.session-settings-window .set-number input { width: 11ch; }
@media (max-width: 599px) { .session-settings-window .set-number input { width: 9ch; } .session-settings-window .set-number { gap: 8px; } }
.session-settings-window .context-actions { margin-top: 12px; }
.session-settings-window .context-actions .btn { min-width: 64px; }
.session-settings-window .set-reset { display: inline-flex; align-items: center; gap: 6px; margin: 8px 0 0; font-size: 12px; color: var(--fg-muted); }
.session-settings-window .set-reset .icon { width: 13px; height: 13px; }
.session-settings-window .modal-foot { align-items: center; }
.session-settings-status { margin-right: auto; font-size: 12px; color: var(--fg-subtle); }
.session-settings-window .modal-foot .btn { display: inline-flex; align-items: center; gap: 6px; }
.session-settings-window .modal-foot .icon { width: 15px; height: 15px; }
</style>

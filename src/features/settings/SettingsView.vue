<script setup lang="ts">
import { ref, computed, inject, onMounted, provide, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { DialogRoot, DialogPortal, DialogOverlay, DialogContent, DialogTitle } from 'reka-ui';
import Icon from '../../ui/components/Icon.vue';
import { useIsMobile } from '../../ui/composables/useMedia.ts';
import { usePageActivity } from '../../ui/composables/usePageActivity.ts';
import { useDialogFocus } from '../../ui/composables/useDialogFocus.ts';
import { tr } from '../../core/i18n/tr.ts';
import UiSettings from './UiSettings.vue';
import DebugSettings from './DebugSettings.vue';
import MobileSessionSettings from './MobileSessionSettings.vue';
import Modal from '../../ui/components/Modal.vue';
import ToolSettings from './ToolSettings.vue';
import McpSettings from './McpSettings.vue';
import SkillsSettings from './SkillsSettings.vue';
import SearchSettings from './SearchSettings.vue';
import { useStatuses } from './useStatuses.ts';
import { searchProviders } from '../../core/api/endpoints.ts';
import './settings.css';
import { configDraftKey, useConfigDraft } from './useConfigDraft.ts';
import SessionDefaults from './SessionDefaults.vue';
import ProviderSettings from './ProviderSettings.vue';
import Wordmark from '../../ui/components/Wordmark.vue';
import { cfg } from '../../core/config.ts';
import { useSettingsGuard } from './useSettingsGuard.ts';
import { closeOverlayKey } from '../../ui/composables/overlay.ts';

const isMobile = useIsMobile();
const pageActive = usePageActivity();
const focus = useDialogFocus();

function handleOutside(event: CustomEvent) {
  if ((event.detail.originalEvent.target as Element)?.closest?.('.pwa-update')) event.preventDefault();
}

const closeSettings = inject(closeOverlayKey)!;

const sections = computed(() => [
  { id: 'service', icon: 'service', label: tr('会话', 'Sessions'),
    summary: tr('默认模型、提示词与上下文', 'Model, instructions and context'),
    description: tr('新会话的默认模型、工作目录、提示词和上下文压缩。', 'Defaults for new sessions: model, working directory, instructions and context compaction.') },
  { id: 'providers', icon: 'providers', label: tr('提供商', 'Providers'),
    summary: tr('连接、认证与模型管理', 'Connections, credentials and models'),
    description: tr('管理模型提供商、凭据与网络代理，保存后对新的调用生效。', 'Model providers, credentials and the network proxy. Saved changes apply to new calls.') },
  { id: 'tools', icon: 'tool', label: tr('工具', 'Tools'),
    summary: tr('内置工具与 Shell', 'Built-in tools and the shell'),
    description: tr('新会话默认启用的内置工具，以及 Shell 执行命令的环境。', 'Built-in tools new sessions start with, and where the shell runs commands.') },
  { id: 'search', icon: 'globe', label: tr('联网搜索', 'Web search'),
    summary: tr('Web Search 用哪些搜索服务', 'The services Web Search asks'),
    description: tr('Web Search 工具按顺序询问这些搜索提供商。订阅附带的搜索直接借用模型提供商的账户。', 'The Web Search tool asks these providers in order. Search that comes with a subscription uses the model provider\'s account.') },
  { id: 'mcp', icon: 'mcp', label: 'MCP',
    summary: tr('会话可以调用的 MCP 服务器', 'MCP servers sessions can call'),
    description: tr('智能体在会话的 Shell 里调用这些服务器。保存后从下一次调用开始生效。', 'Servers the agent calls from a session\'s shell. Saved changes apply from the next call.') },
  { id: 'skills', icon: 'skill', label: tr('Skill', 'Skills'),
    summary: tr('智能体按需查找和读取的 Skill', 'Skills the agent finds and reads as needed'),
    description: tr('智能体在会话的 Shell 里查找和读取这些 Skill。保存后从下一条命令开始生效。', 'Skills the agent finds and reads from a session\'s shell. Saved changes apply from the next command.') },
  { id: 'ui', icon: 'appearance', label: tr('界面', 'Interface'),
    summary: tr('外观、通知与本地偏好', 'Appearance, notifications and preferences'),
    description: tr('外观、输入与本地数据，只保存在这个浏览器中。', 'Appearance, input and local data, stored in this browser only.') },
  { id: 'debug', icon: 'diagnostics', label: tr('调试', 'Debug'),
    summary: tr('连接诊断与引导预览', 'Diagnostics and setup preview'),
    description: tr('检查与服务器的连接，预览首次使用引导。这里不会修改任何配置。', 'Check the connection to the server and preview the first-run setup. Nothing here changes your configuration.') },
]);
const current = computed(() => sections.value.find(item => item.id === tab.value));
// Whether some search provider could answer now, for the Web Search switch's hint.

const route = useRoute();
const router = useRouter();
const desktopSection = ref('service');
const mobileSection = computed(() =>
  sections.value.some((item) => item.id === route.query.section) ? String(route.query.section) : ''
);
const tab = computed(() => (isMobile.value ? mobileSection.value : desktopSection.value));

function selectSection(id: string) {
  if (isMobile.value) router.push({ path: '/settings', query: { section: id } });
  else desktopSection.value = id;
}

// Desktop tabs share one scroller; each tab starts at its top.
const content = ref<HTMLElement>();
watch(tab, () => { if (!isMobile.value && content.value) content.value.scrollTop = 0; });

function backToCategories() {
  router.replace({ path: '/settings' });
}

const configDraft = useConfigDraft();
provide(configDraftKey, configDraft);
const {
  draft,
  revision,
  source,
  busy,
  shells,
  serverDirty,
  providerOptions,
  effortOptions,
  accept,
  load,
  saveConfig,
} = configDraft;
// Search providers as the server knows them: whether web search can run, and each one's state.
const search = useStatuses(searchProviders, reply => reply.providers, revision);
const searchAvailable = computed(() => search.reply.value?.available ?? null);

const {
  dirty,
  save,
  discard,
  discardChanges,
  leave,
  leaveBusy,
  resolveLeave,
  saveAndReturn,
} = useSettingsGuard({
  isMobile,
  serverDirty,
  source,
  revision,
  accept,
  load,
  saveConfig,
});

onMounted(load);
</script>
<template>
  <DialogRoot :open="pageActive" :modal="!isMobile" @update:open="open => { if (!open && !isMobile) closeSettings(); }">
  <DialogPortal :disabled="isMobile">
    <DialogOverlay v-if="!isMobile" class="settings-overlay"/>
    <DialogContent as-child :aria-describedby="undefined" @open-auto-focus="focus.opened" @close-auto-focus="focus.closed" @interact-outside="handleOutside">
  <div class="page native-settings">
    <aside v-show="!isMobile||!mobileSection" class="settings-sidebar">
      <header class="settings-heading settings-home-heading page-bar">
        <button v-if="isMobile" class="btn ghost icon-only" :aria-label="tr('返回','Back')" @click="closeSettings"><Icon name="arrow-left"/></button>
        <DialogTitle class="settings-title page-bar-title">{{tr('设置','Settings')}}</DialogTitle>
      </header>
      <div class="settings-sidebar-body">
      <nav :aria-label="tr('设置分类','Settings categories')">
        <button v-for="item in sections" :key="item.id" class="settings-section" :class="{selected:!isMobile&&tab===item.id}" :aria-current="tab===item.id?'page':undefined" @click="selectSection(item.id)">
          <span class="settings-section-icon"><Icon :name="item.icon"/></span>
          <span class="settings-section-text">{{item.label}}<small v-if="isMobile" class="category-description">{{item.summary}}</small></span>
          <Icon v-if="isMobile" name="chevron-right" class="section-chevron"/>
        </button>
      </nav>
      <footer class="settings-brand" aria-hidden="true"><img src="/app-icons/mark.svg" alt=""/><Wordmark class="settings-brand-word"/><span>{{cfg.meta.appVersion}}</span></footer>
      </div>
    </aside>
    <section v-show="!isMobile||mobileSection" :key="isMobile?mobileSection:'desktop'" class="settings-detail">
    <header class="settings-heading page-bar">
      <button v-if="isMobile" class="btn ghost icon-only" :aria-label="tr('返回设置','Back to settings')" @click="backToCategories"><Icon name="arrow-left"/></button>
      <div class="settings-heading-text"><h2 class="page-bar-title">{{current?.label}}</h2><p v-if="!isMobile">{{current?.description}}</p></div>
      <button v-if="!isMobile" class="btn ghost icon-only" :aria-label="tr('关闭设置','Close settings')" @click="closeSettings"><Icon name="x"/></button>
    </header>
    <div ref="content" class="settings-content" data-scroll-preserve>
    <UiSettings v-if="tab==='ui'"/>
    <DebugSettings v-else-if="tab==='debug'"/>
    <template v-else-if="draft">
      <MobileSessionSettings v-if="isMobile&&tab==='service'" :config="draft" :providers="providerOptions" :efforts="effortOptions"/>
      <SessionDefaults v-else-if="tab==='service'"/>
      <ToolSettings v-else-if="tab==='tools'" :config="draft" :shells="shells" :busy="busy" :search-available="searchAvailable"/>
      <SearchSettings v-else-if="tab==='search'" :config="draft" :models="providerOptions" :save="save" :busy="busy" :dirty="serverDirty" :statuses="search.statuses.value" @checked="search.refresh"/>
      <McpSettings v-else-if="tab==='mcp'" :config="draft" :providers="providerOptions" :save="save" :busy="busy" :dirty="serverDirty" :revision="revision"/>
      <SkillsSettings v-else-if="tab==='skills'" :config="draft" :busy="busy" :revision="revision"/>
      <ProviderSettings v-else :save="save"/>
    </template>
    <div v-else-if="!busy" class="settings-empty"><p>{{tr('设置尚未载入。','Settings are not loaded.')}}</p><button class="btn" @click="load"><Icon name="refresh-cw"/>{{tr('重新载入','Reload')}}</button></div>
    </div>
      <footer v-if="draft&&tab!=='ui'&&tab!=='debug'&&!isMobile" class="settings-footer">
        <span class="settings-status" :class="{dirty}"><i aria-hidden="true"/>{{dirty?tr('有未保存的修改','Unsaved changes'):tr('所有修改已保存','All changes saved')}}</span>
        <button class="btn ghost" :disabled="busy||!dirty" @click="discard=true">{{tr('放弃修改','Discard')}}</button>
        <button class="btn primary" :disabled="busy||!dirty" @click="save"><Icon :name="busy?'loader-circle':'save'" :class="{spin:busy}"/>{{busy?tr('保存中…','Saving…'):tr('保存','Save')}}</button>
      </footer>
    </section>

    <Modal compact :open="discard" :title="tr('放弃修改？','Discard changes?')" @close="discard=false"><p>{{tr('丢弃未保存的修改，恢复已保存的配置。','Discard unsaved changes and restore the saved configuration.')}}</p><template #footer><button class="btn" @click="discard=false">{{tr('继续编辑','Keep editing')}}</button><button class="btn danger" @click="discardChanges">{{tr('放弃修改','Discard changes')}}</button></template></Modal>
    <Modal compact :layer="120" :dismissable="!leaveBusy" :open="leave" :title="isMobile?tr('保存修改？','Save changes?'):tr('尚未保存','Unsaved changes')" @close="resolveLeave(false)"><p>{{tr('返回前是否保存已进行的修改？','Save your changes before returning?')}}</p><template #footer><button class="btn ghost" :disabled="leaveBusy" @click="resolveLeave(false)">{{tr('继续编辑','Keep editing')}}</button><button class="btn danger" :disabled="leaveBusy" @click="resolveLeave(true)">{{tr('放弃修改','Discard')}}</button><button class="btn primary" :disabled="leaveBusy" @click="saveAndReturn"><Icon v-if="leaveBusy" name="loader-circle" class="spinner"/>{{leaveBusy?tr('保存中…','Saving…'):tr('保存并返回','Save & return')}}</button></template></Modal>
  </div>
    </DialogContent>
  </DialogPortal>
  </DialogRoot>
</template>
<style scoped>
.native-settings { width: 100%; height: 100%; min-height: 0; margin: 0 auto; overflow: hidden; }
.settings-sidebar { flex: none; display: flex; flex-direction: column; min-height: 0; }
.settings-sidebar-body { display: flex; flex-direction: column; flex: 1; min-height: 0; }
.settings-sidebar nav { display: flex; flex-direction: column; gap: 2px; }
.settings-section { display: flex; align-items: center; gap: 10px; width: 100%; padding: 6px 10px 6px 6px; border: 0; border-radius: 9px; background: transparent; color: var(--fg-muted); font: inherit; font-size: 13.5px; text-align: left; cursor: pointer; transition: background var(--dur-fast), color var(--dur-fast); }
.settings-section-icon { display: grid; place-items: center; flex: none; width: 28px; height: 28px; border-radius: 8px; color: var(--fg-subtle); transition: background var(--dur-fast), color var(--dur-fast); }
.settings-section-icon .icon { width: 18px; height: 18px; }
.settings-section-text { flex: 1; min-width: 0; }
@media (hover: hover) { .settings-section:hover { background: var(--bg-hover); color: var(--fg); } }
.settings-section.selected { background: var(--bg-raised); color: var(--fg); font-weight: 500; box-shadow: 0 0 0 1px var(--line), 0 1px 3px rgb(0 0 0 / 5%); }
.settings-section.selected .settings-section-icon { background: var(--accent-soft); color: var(--accent); }
.settings-brand { display: flex; align-items: center; gap: 8px; margin-top: auto; color: var(--fg); }
.settings-brand img { display: block; width: 26px; height: auto; }
.settings-brand-word { height: 12px; }
.settings-brand span { margin-left: auto; font-size: 11px; color: var(--fg-faint); font-variant-numeric: tabular-nums; }

.settings-detail { display: flex; flex-direction: column; flex: 1; min-width: 0; min-height: 0; }
.settings-heading { display: flex; align-items: center; flex: none; }
.settings-heading-text { flex: 1; min-width: 0; }
.settings-heading-text p { margin: 2px 0 0; font-size: 12px; line-height: 1.5; color: var(--fg-subtle); }
.settings-content { flex: 1; min-height: 0; overflow: auto; }
.settings-empty { display: grid; justify-items: center; gap: 14px; padding: 56px 0; color: var(--fg-subtle); }
.settings-empty p { margin: 0; }
.settings-empty .btn { display: inline-flex; align-items: center; gap: 7px; }
.settings-empty .icon { width: 15px; height: 15px; }
.code { width: 100%; padding: .75em; font-family: var(--mono); font-size: calc(1em * var(--mono-scale)); line-height: 1.8; }
.input { min-width: 0; max-width: 100%; }

.settings-footer { flex: none; display: flex; align-items: center; gap: 10px; border-top: 1px solid var(--line); }
.settings-status { display: inline-flex; align-items: center; gap: 8px; margin-right: auto; font-size: 12px; color: var(--fg-subtle); }
.settings-status i { width: 7px; height: 7px; border-radius: 50%; background: var(--ok); opacity: .8; }
.settings-status.dirty { color: var(--fg-muted); }
.settings-status.dirty i { background: var(--accent); opacity: 1; box-shadow: 0 0 0 3px var(--accent-soft); }
.settings-footer .btn { display: inline-flex; align-items: center; gap: 7px; }
.settings-footer .btn .icon { width: 15px; height: 15px; }
.settings-overlay { position: fixed; inset: 0; z-index: 50; background: var(--scrim); backdrop-filter: blur(4px); }

@media (min-width: 900px) {
  .native-settings { position: fixed; z-index: 51; top: 50%; left: 50%; transform: translate(-50%, -50%); display: flex; flex-direction: row; width: min(980px, 92vw); height: min(740px, 88dvh); max-width: none; margin: 0; padding: 0; background: var(--bg); border: 1px solid var(--line-strong); border-radius: 16px; box-shadow: var(--shadow-pop); animation: settings-enter 180ms var(--ease-out); }
  .native-settings[data-state='closed'] { animation: settings-exit 180ms ease-in forwards; }
  .settings-overlay[data-state='closed'] { animation: settings-overlay-out 180ms ease-in forwards; pointer-events: none; }
  .settings-sidebar { width: 216px; padding: 20px 12px 16px; border-right: 1px solid var(--line); background: var(--bg-sunken); }
  .settings-heading { gap: 12px; }
  .settings-title { margin: 0; font-size: 16px; font-weight: 600; }
  .settings-heading h2 { margin: 0; font-size: 18px; font-weight: 600; line-height: 1.4; }
  .settings-home-heading { padding: 0 8px 16px; }
  .settings-brand { padding: 12px 8px 0; }
  .settings-detail > .settings-heading { padding: 18px 20px 14px 28px; border-bottom: 1px solid var(--line); }
  .settings-content { padding: 22px 28px 28px; }
  .settings-footer { padding: 12px 20px 12px 28px; background: var(--bg); }
}

@media (max-width: 899px) {
  .native-settings { background: var(--bg-sunken); }
  /* Tablets keep the phone layout, centered at a readable width. */
  .settings-sidebar { width: 100%; height: 100%; }
  .settings-sidebar-body { overflow: auto; padding: 20px max(16px, calc((100% - 640px) / 2)) max(20px, env(safe-area-inset-bottom)); }
  /* A grouped list: rows one step above the page, parted by a sliver of it. It keeps its own height,
     since clipped for its corners it would otherwise shrink to the screen. */
  .settings-sidebar nav { flex: none; gap: 0; border: 0; border-radius: 18px; background: var(--bg-sunken); overflow: hidden; }
  .settings-section { min-height: 66px; padding: 12px 14px; gap: 14px; border-radius: 0; background: var(--bg-group); background-clip: padding-box; color: var(--fg); font-size: 15px; font-weight: 500; }
  .settings-section + .settings-section { border-top: 2px solid transparent; }
  .settings-section:active { background-color: var(--bg-group-active); }
  .settings-section-icon { width: 28px; height: 28px; border-radius: 0; background: none; color: var(--fg-muted); }
  .settings-section-icon .icon { width: 21px; height: 21px; }
  .category-description { display: block; margin-top: 2px; font-size: 12px; font-weight: 400; color: var(--fg-subtle); }
  .section-chevron { flex: none; width: 16px; color: var(--fg-faint); }
  .settings-brand { flex-direction: column; justify-content: center; gap: 8px; padding: 40px 0 8px; }
  .settings-brand img { width: 40px; }
  .settings-brand-word { height: 18px; }
  .settings-brand span { margin: 0; }
  .settings-content { padding: 20px max(16px, calc((100% - 640px) / 2)) max(32px, env(safe-area-inset-bottom)); }
  .native-settings[data-state='closed'] { animation: settings-page-out 180ms ease-in forwards; pointer-events: none; }
}
@keyframes settings-exit { from { opacity: 1; translate: 0 0; scale: 1; } to { opacity: 0; translate: 0 8px; scale: .985; } }
@keyframes settings-overlay-out { from { opacity: 1; } to { opacity: 0; } }
@keyframes settings-page-out { from { opacity: 1; transform: translateX(0); } to { opacity: 0; transform: translateX(24px); } }
</style>

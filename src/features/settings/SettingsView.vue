<script setup lang="ts">
import DefaultModelPicker from './DefaultModelPicker.vue';
import { ref, computed, inject, onMounted } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { DialogRoot, DialogPortal, DialogOverlay, DialogContent, DialogTitle } from 'reka-ui';
import Icon from '../../ui/components/Icon.vue';
import { useMedia } from '../../ui/composables/useMedia';
import { usePageActivity } from '../../ui/composables/usePageActivity';
import { useDialogFocus } from '../../ui/composables/useDialogFocus';
import { tr, compactionFields } from './fields';
import UiSettings from './UiSettings.vue';
import MobileSessionSettings from './MobileSessionSettings.vue';
import Modal from '../../ui/components/Modal.vue';
import AddProvider from './AddProvider.vue';
import PresetProvider from './PresetProvider.vue';
import ServerProxySettings from './ServerProxySettings.vue';
import ServerShellSettings from './ServerShellSettings.vue';
import './settings.css';
import { useConfigDraft } from './useConfigDraft';
import { useSettingsGuard } from './useSettingsGuard';

const isMobile = useMedia('(max-width: 899px)');
const pageActive = usePageActivity();
const focus = useDialogFocus();

function handleOutside(event: CustomEvent) {
  if ((event.detail.originalEvent.target as Element)?.closest?.('.pwa-update')) event.preventDefault();
}

const closeSettings = inject<() => unknown>('closeSettings')!;

const sections = computed(() => [
  { id: 'service', icon: 'settings', label: tr('服务与会话', 'Service & sessions') },
  { id: 'providers', icon: 'bot', label: tr('提供商', 'Providers') },
  { id: 'ui', icon: 'settings-2', label: tr('界面', 'Interface') },
]);

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

function backToCategories() {
  router.replace({ path: '/settings' });
}

const {
  draft,
  revision,
  source,
  busy,
  error,
  notice,
  catalog,
  proxyEnvironment,
  shells,
  adding,
  newProviderId,
  advanced,
  advancedPending,
  serverDirty,
  providerOptions,
  effortOptions,
  protocolOptions,
  findPreset,
  accept,
  load,
  applyAdvanced,
  saveConfig,
  addProvider,
  changeProtocol,
  removeProvider,
} = useConfigDraft();

const {
  dirty,
  save,
  discard,
  discardChanges,
  leave,
  leaveBusy,
  leaveError,
  resolveLeave,
  saveAndReturn,
} = useSettingsGuard({
  isMobile,
  serverDirty,
  source,
  revision,
  error,
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
      <header class="settings-heading settings-home-heading">
      <button v-if="isMobile" class="btn ghost icon-only settings-back" :aria-label="tr('返回','Back')" @click="closeSettings"><Icon name="arrow-left"/></button>
      <DialogTitle class="settings-title">{{tr('设置','Settings')}}</DialogTitle>
      </header>
      <nav :aria-label="tr('设置分类','Settings categories')">
        <button v-for="item in sections" :key="item.id" class="settings-section" :class="{selected:!isMobile&&tab===item.id}" :aria-current="tab===item.id?'page':undefined" @click="selectSection(item.id)"><Icon :name="item.icon"/><span>{{item.label}}<small v-if="isMobile" class="category-description">{{item.id==='service'?tr('默认模型、提示词与上下文','Model, instructions and context'):item.id==='providers'?tr('连接、认证与模型管理','Connections, credentials and models'):tr('外观、通知与本地偏好','Appearance, notifications and preferences')}}</small></span><Icon v-if="isMobile" name="chevron-right" class="section-chevron"/></button>
      </nav>
    </aside>
    <section v-show="!isMobile||mobileSection" :key="isMobile?mobileSection:'desktop'" class="settings-detail">
    <header class="settings-heading"><button v-if="isMobile" class="btn ghost icon-only" :aria-label="tr('返回设置','Back to settings')" @click="backToCategories"><Icon name="arrow-left"/></button><h2>{{sections.find(item=>item.id===tab)?.label}}</h2><button v-if="!isMobile" class="btn ghost icon-only" :aria-label="tr('关闭设置','Close settings')" @click="closeSettings"><Icon name="x"/></button></header>
    <div class="settings-content" data-scroll-preserve>
    <p v-if="error" class="load-error" role="alert">{{error}}</p><p v-if="notice && tab!=='ui'" role="status">{{notice}}</p>
    <UiSettings v-if="tab==='ui'"/>
    <template v-else-if="draft">
      <MobileSessionSettings v-if="isMobile&&tab==='service'" :config="draft" :shells="shells" :providers="providerOptions" :efforts="effortOptions" :save="save" :busy="busy" :error="error"/>
      <fieldset :disabled="busy" v-else-if="tab==='service'" class="settings-form">
        <section class="settings-group"><h2>{{tr('默认会话','Session defaults')}}</h2><p class="settings-default-note">{{tr('保存后仅用于新建会话，不会更改已有会话的配置。','Saved defaults apply only to new sessions. Existing sessions keep their configuration.')}}</p><div class="settings-fields">
        <label>{{tr('默认模型','Default model')}}<DefaultModelPicker :config="draft" :providers="providerOptions" :efforts="effortOptions"/></label>
        <label>{{tr('工作目录（绝对路径）','Working directory (absolute path)')}}<input class="input" v-model="draft.defaults.cwd"/></label>
        <label>{{tr('固定提示词','Instructions')}}<textarea class="input" rows="6" v-model="draft.defaults.instructions"/></label>
        <template v-if="draft.defaults.compaction"><label v-for="field in compactionFields()" :key="field.key">{{field.label}}<input class="input" type="number" min="1" v-model.number="draft.defaults.compaction[field.key]"/></label></template>
        </div></section>
        <section v-if="draft.shell" class="settings-group"><h2>Shell</h2><p class="settings-default-note">{{tr('保存后下一条命令即使用新的 Shell，包括已打开的会话；正在运行的命令不受影响。','Saved changes apply to the next command in every session, including open ones. Running commands are unaffected.')}}</p><ServerShellSettings :value="draft.shell" :catalog="shells"/></section>
      </fieldset>
      <div v-else class="provider-settings">
        <p v-if="!isMobile" class="hint">{{tr('选择预置服务商后填写密钥，也可以使用服务器环境变量。保存后对新的模型调用生效。','Choose a provider preset and enter credentials or server environment variables. Saved changes apply to new calls.')}}</p>
        <ServerProxySettings v-if="draft.proxy" :value="draft.proxy" :environment="proxyEnvironment" />
        <PresetProvider v-for="(provider,id) in draft.providers" :key="id" :id="String(id)" :initially-open="id===newProviderId" :value="provider" :preset="findPreset(provider.preset)" :protocols="protocolOptions" :save="save" :saving="busy" :save-error="error" :disabled="busy" @remove="removeProvider(String(id))" @protocol="changeProtocol(String(id),$event)" @login-complete="load">
          <details class="provider-json" @toggle="($event.target as HTMLDetailsElement).open&&!advancedPending[id]&&(advanced[id]=JSON.stringify(provider,null,2))"><summary><span>{{tr('完整配置 JSON','Full configuration JSON')}}</span><Icon name="chevron-down"/></summary><textarea class="input code" rows="16" v-model="advanced[id]" @input="advancedPending[id]=true"/><button v-if="!isMobile" class="btn" @click="applyAdvanced(String(id))">{{tr('应用到表单','Apply to form')}}</button></details>
        </PresetProvider>
        <button class="btn primary icon-only add-provider" :class="{'provider-add-card':isMobile}" :aria-label="tr('添加提供商','Add provider')" :data-hint="tr('添加提供商','Add provider')" :disabled="busy" @click="adding=true"><Icon name="plus"/></button>
      </div>

    </template><button v-else class="btn" :disabled="busy" @click="load">{{tr('重新载入','Reload')}}</button>
    </div>
      <footer v-if="draft&&tab!=='ui'&&!isMobile"><button class="btn" :disabled="busy||!dirty" @click="discard=true">{{tr('放弃修改','Discard changes')}}</button><button class="btn primary icon-only" :aria-label="tr('保存并生效','Save & apply')" :data-hint="tr('保存并生效','Save & apply')" :disabled="busy||!dirty" @click="save"><Icon name="save"/></button></footer>
    </section>

    <AddProvider v-if="adding" :catalog="catalog" @close="adding=false" @select="addProvider"/>
    <Modal compact :open="discard" :title="tr('放弃修改？','Discard changes?')" @close="discard=false"><p>{{tr('丢弃未保存的修改，恢复已保存的配置。','Discard unsaved changes and restore the saved configuration.')}}</p><template #footer><button class="btn" @click="discard=false">{{tr('继续编辑','Keep editing')}}</button><button class="btn danger" @click="discardChanges">{{tr('放弃修改','Discard changes')}}</button></template></Modal>
    <Modal compact :layer="120" :dismissable="!leaveBusy" :open="leave" :title="isMobile?tr('保存修改？','Save changes?'):tr('尚未保存','Unsaved changes')" @close="resolveLeave(false)"><p>{{tr('返回前是否保存已进行的修改？','Save your changes before returning?')}}</p><p v-if="leaveError" class="load-error" role="alert">{{leaveError}}</p><template #footer><button class="btn ghost" :disabled="leaveBusy" @click="resolveLeave(false)">{{tr('继续编辑','Keep editing')}}</button><button class="btn danger" :disabled="leaveBusy" @click="resolveLeave(true)">{{tr('放弃修改','Discard')}}</button><button class="btn primary" :disabled="leaveBusy" @click="saveAndReturn"><Icon v-if="leaveBusy" name="loader-circle" class="spinner"/>{{leaveBusy?tr('保存中…','Saving…'):tr('保存并返回','Save & return')}}</button></template></Modal>
  </div>
    </DialogContent>
  </DialogPortal>
  </DialogRoot>
</template>
<style scoped>
.native-settings { width: 100%; height: 100%; min-height: 0; max-width: 1000px; margin: 0 auto; overflow: hidden; }
.settings-content { flex: 1; min-height: 0; overflow: auto; padding: 0 24px 24px; }
.add-provider { margin-top: 16px; }
.settings-form { display: grid; gap: 0; margin: 0; padding: 0; min-width: 0; border: 0; }
.settings-form label { display: flex; flex-direction: column; gap: 6px; min-width: 0; }
.settings-form label:has(input[type=checkbox]) { flex-direction: row; align-items: center; }
.settings-default-note { margin: -4px 0 14px; font-size: 12px; line-height: 1.6; color: var(--fg-subtle); }
.settings-form h2 { font-size: 14px; margin: 0 0 12px; font-weight: 600; }
.provider-heading { display: flex; justify-content: space-between; align-items: center; gap: 12px; }
.settings-form dl { display: grid; grid-template-columns: auto minmax(0, 1fr); gap: 8px; }
.settings-form dd { margin: 0; overflow-wrap: anywhere; }
.code { font-family: var(--mono); font-size: calc(1em * var(--mono-scale)); line-height: 1.8; padding: .75em; width: 100%; }
footer { flex: none; display: flex; gap: 12px; border-top: 1px solid var(--line); padding: 12px 24px max(12px, env(safe-area-inset-bottom)); }
.input { min-width: 0; max-width: 100%; }
@media (max-width: 899px) {
  .settings-title { position: absolute; width: 1px; height: 1px; overflow: hidden; clip-path: inset(50%); }
  .settings-sidebar { width: 100%; padding: 12px 16px; }
}
@media (max-width: 599px) {
  .settings-content { padding: 0 16px 16px; }
  .settings-form { padding: 0; }
  .settings-form dl { grid-template-columns: 1fr; }
  footer { padding-inline: 16px; }
}
 .settings-sidebar { flex: none; padding: 24px 16px; border-bottom: 1px solid var(--line); }
.settings-title { margin: 0 12px 20px; font-size: 18px; font-weight: 600; }
.settings-sidebar nav { display: flex; gap: 6px; flex-wrap: wrap; }
.settings-section { display: flex; align-items: center; gap: 12px; border: 0; background: transparent; color: var(--fg-muted); padding: 12px; border-radius: 8px; text-align: left; cursor: pointer; font: inherit; }
@media (hover: hover) { .settings-section:hover { background: var(--bg-hover); } }
.settings-section.selected { background: var(--bg-active); color: var(--fg); }
.settings-detail { display: flex; flex-direction: column; flex: 1; min-width: 0; min-height: 0; }
.settings-heading { display: flex; align-items: center; justify-content: space-between; padding: 20px 24px 8px; flex: none; }
.settings-heading h2 { margin: 0; font-size: 20px; font-weight: 600; }
.settings-overlay { position: fixed; inset: 0; z-index: 50; background: var(--scrim); backdrop-filter: blur(4px); }
@media (min-width: 900px) {
  .native-settings { position: fixed; z-index: 51; top: 50%; left: 50%; transform: translate(-50%, -50%); width: min(960px, 90vw); height: min(720px, 86dvh); max-width: none; display: flex; flex-direction: row; margin: 0; padding: 0; background: var(--bg-raised); border: 1px solid var(--line); border-radius: 16px; box-shadow: var(--shadow-pop); }
  .settings-sidebar { width: 180px; border-bottom: 0; border-right: 1px solid var(--line); background: var(--bg); padding: 20px 12px; }
  .settings-sidebar nav { flex-direction: column; gap: 4px; }
  .settings-title { margin: 0 8px 14px; font-size: 16px; }
  .settings-section { padding: 9px 8px; gap: 8px; }
  .settings-heading h2 { font-size: 18px; }
  .settings-heading { padding: 16px 20px 10px; }
  .settings-content { padding: 0 20px 16px; }
  .settings-form { background: transparent; padding: 0; margin-top: 0; }
  .settings-form label { display: grid; grid-template-columns: 170px minmax(0, 1fr); align-items: center; gap: 16px; }
  .settings-form label:has(textarea) { align-items: start; }
  footer { padding: 10px 20px; }
  :deep(.cfg-content) { max-width: none; }
  :deep(.ui-settings .setting-row) { grid-template-columns: minmax(0, 1fr) auto; align-items: center; padding-block: 10px; }
  :deep(.ui-settings .setting-row > :is(.control-select, .choice-capsule, .btn, .cfg-switch)) { justify-self: end; }
  :deep(.cfg-section + .cfg-section) { margin-top: 16px; padding-top: 14px; }

}
@media (max-width: 899px) {
  .native-settings { background: var(--bg-sunken); padding:0; }
  .settings-sidebar { display: block; position: relative; border: 0; padding: 0 16px 24px; overflow: auto; }
  .settings-title { position: static; width: auto; height: auto; clip-path: none; overflow: visible; margin: 0; padding: 0; font-size: 17px; background: transparent; border: 0; }
  .settings-home-heading { margin: 0 -16px 20px; }
  .settings-sidebar nav { display: flex; flex-direction: column; gap: 0; border: 1px solid var(--line); border-radius: 12px; overflow: hidden; background: var(--bg-raised); }
  .settings-section { min-height: 56px; padding: 14px 16px; border-radius: 0; color: var(--fg); }
  .settings-section + .settings-section { border-top: 1px solid var(--line); }
  .settings-section span { flex: 1; }
  .section-chevron { color: var(--fg-subtle); width: 16px; }
  .settings-heading { justify-content: flex-start; gap: 8px; padding: 10px 12px; border-bottom: 1px solid var(--line); background: var(--bg); }
  .settings-heading h2 { font-size: 18px; }
  .settings-content { padding: 16px; }
  .settings-form { margin: 0; gap: 16px; }
  .settings-group { padding: 14px; border: 1px solid var(--line); border-radius: 12px; background: var(--bg-raised); }
  .provider-settings { border-radius: 12px; background: var(--bg-raised); padding: 12px; }
  footer { background: var(--bg); }
  :deep(.ui-settings .cfg-section) { padding: 14px; border: 1px solid var(--line); border-radius: 12px; background: var(--bg-raised); }
}
@media(max-width:899px){
  .settings-title { margin:0; text-align:left; font-size:17px; }
  .settings-heading { min-height:54px; padding:6px 8px; }
  .settings-heading h2 { font-size:17px; }
  .settings-content { padding:20px 16px 24px; }
  .settings-section { padding:14px; gap:12px; }
  .settings-section > .icon:first-child { box-sizing:content-box; padding:8px; background:var(--bg-inset); border-radius:9px; color:var(--fg-muted); }
  .category-description { display:block; margin-top:3px; font-size:12px; color:var(--fg-subtle); font-weight:400; }
  .provider-settings { padding:0; background:transparent; }
  .add-provider.provider-add-card { width:100%; height:74px; margin-top:0; border:0; border-radius:12px; background:var(--bg-raised); color:var(--fg-muted); }
  @media (hover: hover) { .add-provider.provider-add-card:hover { background:var(--bg-hover); color:var(--fg); } }
  :deep(.ui-settings .cfg-section) { padding:0; border:0; background:transparent; }
  :deep(.ui-settings .cfg-section h2) { padding:0 12px; font-size:12px; color:var(--fg-subtle); font-weight:500; margin-bottom:8px; }
  :deep(.ui-settings .setting-row) { margin:0; padding:12px; min-height:52px; background:var(--bg-raised); gap:8px; }
  :deep(.ui-settings .setting-row:nth-child(2)) { border-radius:12px 12px 0 0; }
  :deep(.ui-settings .setting-row:last-child) { border-radius:0 0 12px 12px; }
  :deep(.ui-settings .setting-row > div:first-child) { flex:1; }
  :deep(.ui-settings .setting-row .setting-help-icon) { display:none; }
  :deep(.ui-settings .cfg-section + .cfg-section) { margin-top:24px; padding-top:0; border:0; }
}
@media(min-width:900px){.settings-home-heading{display:block;padding:0 8px;margin-bottom:20px}.settings-home-heading .settings-title{margin:0}.native-settings{animation:settings-enter 180ms var(--ease-out)}.native-settings[data-state='closed']{animation:settings-exit 180ms ease-in forwards}.settings-overlay[data-state='closed']{animation:settings-overlay-out 180ms ease-in forwards;pointer-events:none}}
@media(max-width:899px){.native-settings[data-state='closed']{animation:settings-page-out 180ms ease-in forwards;pointer-events:none}}
@keyframes settings-exit{from{opacity:1;translate:0 0;scale:1}to{opacity:0;translate:0 8px;scale:.985}}
@keyframes settings-overlay-out{from{opacity:1}to{opacity:0}}
@keyframes settings-page-out{from{opacity:1;transform:translateX(0)}to{opacity:0;transform:translateX(24px)}}

</style>

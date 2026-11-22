<script setup lang="ts">
import { ref, computed, inject, onActivated, onScopeDispose, provide, watch, defineAsyncComponent } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { DialogRoot, DialogPortal, DialogOverlay, DialogContent, DialogTitle } from 'reka-ui';
import Icon from '../../ui/components/Icon.vue';
import { useIsMobile } from '../../ui/composables/useMedia.ts';
import { usePageActivity } from '../../ui/composables/usePageActivity.ts';
import { useDialogNesting } from '../../ui/composables/useDialogNesting.ts';
import { useDialogFocus } from '../../ui/composables/useDialogFocus.ts';
import { tr } from '../../core/i18n/tr.ts';
import UiSettings from './UiSettings.vue';
import KeymapEditor from './KeymapEditor.vue';
import ShortcutSettings from './ShortcutSettings.vue';
const DebugSettings = defineAsyncComponent(() => import('../debug/DebugSettings.vue'));
import MobileSessionSettings from './MobileSessionSettings.vue';
import Modal from '../../ui/components/Modal.vue';
import ToolSettings from './ToolSettings.vue';
const TerminalSettings = defineAsyncComponent(() => import('./TerminalSettings.vue'));
const ExtensionToolsSettings = defineAsyncComponent(() => import('./ExtensionToolsSettings.vue'));
const McpSettings = defineAsyncComponent(() => import('./McpSettings.vue'));
const SkillsSettings = defineAsyncComponent(() => import('./SkillsSettings.vue'));
const AccountSettings = defineAsyncComponent(() => import('./AccountSettings.vue'));
import { useStatuses } from './useStatuses.ts';
import { searchProviders } from '../../core/api/endpoints.ts';
import '../../domain/settings/settings.css';
import { configDraftKey, useConfigDraft } from './useConfigDraft.ts';
import SessionDefaults from './SessionDefaults.vue';
const ProviderSettings = defineAsyncComponent(() => import('./ProviderSettings.vue'));
import { isNativeApp } from '../../platform/native.ts';
import { deviceProxyDraftKey, useDeviceProxyDraft } from './useDeviceProxyDraft.ts';
import NetworkSettings from './NetworkSettings.vue';
import ShellProxyDialog from './ShellProxyDialog.vue';
import { searchSettings } from './settingsSearch.ts';
import MatchText from '../../ui/components/MatchText.vue';
import Wordmark from '../../ui/components/Wordmark.vue';
import { cfg } from '../../core/config.ts';
import { useSettingsGuard } from './useSettingsGuard.ts';
import { provideSettingsPages } from '../../ui/composables/settingsPages.ts';
import { closeOverlayKey } from '../../ui/composables/overlay.ts';
import { extensionSection as validExtension, settingsBackTarget } from '../shell/settingsNavigation.ts';

const isMobile = useIsMobile();
const pageActive = usePageActivity();
const focus = useDialogFocus();
const hasChildDialog = useDialogNesting(() => pageActive.value);

function handleOutside(event: CustomEvent) {
  if (hasChildDialog.value || (event.detail.originalEvent.target as Element)?.closest?.('.toast-region'))
    event.preventDefault();
}

const closeSettings = inject(closeOverlayKey)!;
const { target: settingsPageHost, current: editorPage } = provideSettingsPages(closeSettings);
function setPageHost(element: unknown) {
  settingsPageHost.value = element instanceof HTMLElement ? element : undefined;
}

import { sections as allSections, extensionSections, sectionGroups } from './settingsSections.ts';
const props = defineProps<{ deviceOnly?: boolean }>();
const sections = computed(() =>
  props.deviceOnly
    ? allSections.value.filter(
        (item) => ['ui', 'shortcuts', 'debug'].includes(item.id) || (item.id === 'network' && isNativeApp()),
      )
    : allSections.value,
);
const searchQuery = ref('');
const visibleSections = computed(() => searchSettings(sections.value, searchQuery.value));
const visibleGroups = computed(() =>
  sectionGroups.value
    .map((group) => ({
      ...group,
      items: visibleSections.value.filter((item) => item.group === group.id),
    }))
    .filter((group) => group.items.length),
);
function openFirstResult() {
  const first = visibleSections.value[0];
  if (first) selectSection(first.id);
}
const current = computed(() =>
  extensionSection.value
    ? extensionSections.value.find((item) => item.id === extensionSection.value)
    : sections.value.find((item) => item.id === tab.value),
);
// Whether some search provider could answer now, for the Web Search switch's hint.

const route = useRoute();
const router = useRouter();
const desktopSection = ref(
  !props.deviceOnly && extensionSections.value.some((item) => item.id === route.query.section)
    ? 'extensions'
    : sections.value.some((item) => item.id === route.query.section)
      ? String(route.query.section)
      : props.deviceOnly
        ? 'ui'
        : 'service',
);
watch(
  () => route.query.section,
  (value) => {
    if (!props.deviceOnly && extensionSections.value.some((item) => item.id === value))
      desktopSection.value = 'extensions';
    else if (sections.value.some((item) => item.id === value)) desktopSection.value = String(value);
  },
);
const extensionSection = computed(() =>
  props.deviceOnly || tab.value !== 'extensions'
    ? undefined
    : (validExtension(route.query.tool) ?? validExtension(route.query.section)),
);
function selectExtension(id: string) {
  if (validExtension(id)) void router.push({ path: '/settings', query: { section: 'extensions', tool: id } });
}
const mobileSection = computed(() =>
  !props.deviceOnly && extensionSections.value.some((item) => item.id === route.query.section)
    ? 'extensions'
    : sections.value.some((item) => item.id === route.query.section)
      ? String(route.query.section)
      : '',
);
const tab = computed(() => (isMobile.value ? mobileSection.value : desktopSection.value));
const keymapOpen = computed(
  () => tab.value === 'shortcuts' && (route.query.advanced === 'keymap' || route.query.advanced === 'navigation'),
);

const browserShortcutsOpen = computed(() => tab.value === 'shortcuts' && route.query.advanced === 'browser');
const skillSearchReturn = ref('');
const skillFoldersOpen = computed(() => tab.value === 'skills' && route.query.advanced === 'folders');
const skillBrowserOpen = computed(() => tab.value === 'skills' && route.query.advanced === 'browse');
const detailTitle = computed(() => {
  if (browserShortcutsOpen.value) return tr('浏览器快捷键', 'Browser shortcuts');
  if (keymapOpen.value) return tr('键位绑定', 'Key bindings');
  if (skillFoldersOpen.value) return tr('Skill 目录', 'Skill folders');
  if (skillBrowserOpen.value) {
    if (typeof route.query.skill === 'string') return route.query.skill;
    if (typeof route.query.folder === 'string') return route.query.folder.split('/').at(-1);
    return tr('浏览 Skill', 'Browse skills');
  }
  return current.value?.label;
});

watch(skillBrowserOpen, (open) => {
  if (!open) skillSearchReturn.value = '';
});

async function selectSection(id: string) {
  while (editorPage.value) {
    const page = editorPage.value;
    if (!(await page.back()) || page === editorPage.value) return;
  }
  const tool =
    id === 'extensions' && searchQuery.value.trim()
      ? searchSettings(extensionSections.value, searchQuery.value)[0]?.id
      : undefined;
  const destination = { path: '/settings', query: { section: id, ...(tool ? { tool } : {}) } };
  if (isMobile.value) void router.push(destination);
  else {
    desktopSection.value = id;
    if (tool || route.query.section || route.query.advanced) void router.replace(destination);
  }
}

// Desktop tabs share one scroller; each tab starts at its top.
const content = ref<HTMLElement>();
const sidebarScrolling = ref(false);
let sidebarScrollTimer: ReturnType<typeof setTimeout> | undefined;
function showSidebarScrollbar() {
  sidebarScrolling.value = true;
  clearTimeout(sidebarScrollTimer);
  sidebarScrollTimer = setTimeout(() => (sidebarScrolling.value = false), 600);
}
onScopeDispose(() => clearTimeout(sidebarScrollTimer));
watch([tab, extensionSection, () => route.fullPath], () => {
  if (content.value) content.value.scrollTop = 0;
});

function backToCategories() {
  const target = settingsBackTarget(route.query) ?? '/settings';
  if (router.options.history.state.back === target) router.back();
  else void router.replace(target);
}

const configDraft = useConfigDraft();
provide(configDraftKey, configDraft);
const {
  draft,
  ready,
  revision,
  source,
  busy,
  shellProxyPrompt,
  resolveShellProxy,
  shells,
  serverDirty,
  providerOptions,
  effortOptions,
  accept,
  load,
  saveConfig,
} = configDraft;
// Search providers as the server knows them: whether web search can run, and each one's state.
const search = props.deviceOnly ? null : useStatuses(searchProviders, (reply) => reply.providers, revision);
const searchAvailable = computed(() => search?.reply.value?.available ?? null);

const deviceProxy = useDeviceProxyDraft();
provide(deviceProxyDraftKey, deviceProxy);
const { dirty, saving, save, discard, discardChanges, leave, leaveBusy, resolveLeave, saveAndReturn } =
  useSettingsGuard({
    deviceProxy,
    isMobile,
    busy,
    serverDirty,
    source,
    revision,
    accept,
    saveConfig,
  });

function saveShortcut(event: KeyboardEvent) {
  if (
    hasChildDialog.value ||
    event.isComposing ||
    event.altKey ||
    event.shiftKey ||
    !(event.ctrlKey || event.metaKey) ||
    event.key.toLowerCase() !== 's'
  )
    return;
  event.preventDefault();
  event.stopPropagation();
  if (!editorPage.value && dirty.value && !event.repeat) void save();
}

onActivated(() => {
  if (!props.deviceOnly && !serverDirty.value && !busy.value) void load();
});
</script>
<template>
  <DialogRoot
    :open="pageActive"
    :modal="!isMobile"
    @update:open="
      (open) => {
        if (!open && !isMobile) closeSettings();
      }
    "
  >
    <DialogPortal :disabled="isMobile">
      <DialogOverlay v-if="!isMobile" class="settings-overlay" />
      <DialogContent
        :disable-outside-pointer-events="false"
        as-child
        :aria-describedby="undefined"
        @open-auto-focus="focus.opened"
        @close-auto-focus="focus.closed"
        @interact-outside="handleOutside"
        @escape-key-down="
          (event) => {
            if (editorPage && !hasChildDialog) {
              event.preventDefault();
              void editorPage.back();
            } else if (
              !hasChildDialog &&
              (extensionSection || keymapOpen || browserShortcutsOpen || skillBrowserOpen || skillFoldersOpen)
            ) {
              event.preventDefault();
              backToCategories();
            }
          }
        "
      >
        <div class="page native-settings" data-navigation-page @keydown="saveShortcut">
          <aside v-show="!isMobile || !mobileSection" class="settings-sidebar">
            <header class="settings-heading settings-home-heading page-bar">
              <button
                v-if="isMobile"
                class="btn ghost icon-only"
                :aria-label="tr('返回', 'Back')"
                @click="closeSettings"
              >
                <Icon name="arrow-left" />
              </button>
              <DialogTitle class="settings-title page-bar-title">{{ tr('设置', 'Settings') }}</DialogTitle>
            </header>
            <div
              class="settings-sidebar-body"
              :class="{ scrolling: sidebarScrolling }"
              @scroll.passive="showSidebarScrollbar"
            >
              <div class="settings-nav-scroll" @scroll.passive="showSidebarScrollbar">
                <div class="settings-search" role="search">
                  <Icon name="search" />
                  <input
                    v-model="searchQuery"
                    type="search"
                    :aria-label="tr('搜索配置', 'Search settings')"
                    :placeholder="tr('搜索配置…', 'Search settings…')"
                    autocomplete="off"
                    @keydown.enter.prevent="openFirstResult"
                    @keydown.esc.stop.prevent="searchQuery = ''"
                  />
                  <button
                    v-if="searchQuery"
                    class="btn ghost icon-only"
                    :aria-label="tr('清除搜索', 'Clear search')"
                    @click="searchQuery = ''"
                  >
                    <Icon name="x" />
                  </button>
                </div>
                <p v-if="searchQuery.trim() && !visibleSections.length" class="settings-search-empty" role="status">
                  {{ tr('没有匹配的配置', 'No matching settings') }}
                </p>
                <nav :aria-label="tr('设置分类', 'Settings categories')">
                  <section
                    v-for="group in visibleGroups"
                    :key="group.id"
                    class="settings-nav-group"
                    :aria-label="group.label"
                  >
                    <h3>{{ group.label }}</h3>
                    <div class="settings-group-rows">
                      <button
                        v-for="item in group.items"
                        :key="item.id"
                        class="settings-section"
                        :class="{ selected: !isMobile && tab === item.id }"
                        :aria-current="tab === item.id ? 'page' : undefined"
                        @click="selectSection(item.id)"
                      >
                        <span class="settings-section-icon"><Icon :name="item.icon" /></span>
                        <span class="settings-section-text"
                          ><MatchText :text="item.label" :query="searchQuery" /><small
                            v-if="searchQuery.trim()"
                            class="category-description"
                            ><MatchText :text="item.searchHint" :query="searchQuery" /></small
                        ></span>
                        <Icon v-if="isMobile" name="chevron-right" class="section-chevron" />
                      </button>
                    </div>
                  </section>
                </nav>
              </div>
              <footer class="settings-brand" aria-hidden="true">
                <img src="/app-icons/mark.svg" alt="" /><Wordmark class="settings-brand-word" /><span>{{
                  cfg.meta.appVersion
                }}</span>
              </footer>
            </div>
          </aside>
          <section v-show="!isMobile || mobileSection" class="settings-detail">
            <header v-show="!editorPage" class="settings-heading settings-detail-heading page-bar">
              <button
                v-if="
                  isMobile ||
                  extensionSection ||
                  keymapOpen ||
                  browserShortcutsOpen ||
                  skillBrowserOpen ||
                  skillFoldersOpen
                "
                class="btn ghost icon-only"
                :aria-label="
                  extensionSection ? tr('返回扩展工具', 'Back to extension tools') : tr('返回设置', 'Back to settings')
                "
                @click="backToCategories"
              >
                <Icon name="arrow-left" />
              </button>
              <div class="settings-heading-text">
                <h2 class="page-bar-title">
                  {{ detailTitle }}
                </h2>
              </div>
              <button
                v-if="!isMobile"
                class="btn ghost icon-only"
                :aria-label="tr('关闭设置', 'Close settings')"
                @click="closeSettings"
              >
                <Icon name="x" />
              </button>
            </header>
            <div v-show="!editorPage" ref="content" class="settings-content" data-scroll-preserve>
              <UiSettings v-if="tab === 'ui'" />
              <KeymapEditor v-else-if="keymapOpen" />
              <ShortcutSettings v-else-if="tab === 'shortcuts'" :browser-page="browserShortcutsOpen" />
              <DebugSettings v-else-if="tab === 'debug'" :device-only="deviceOnly" />
              <NetworkSettings
                v-else-if="tab === 'network' && (isNativeApp() || ready)"
                :server="!deviceOnly && ready"
              />
              <template v-else-if="ready">
                <MobileSessionSettings
                  v-if="isMobile && tab === 'service'"
                  :config="draft"
                  :providers="providerOptions"
                  :efforts="effortOptions"
                />
                <SessionDefaults v-else-if="tab === 'service'" />
                <ToolSettings v-else-if="tab === 'tools'" :config="draft" :shells="shells" :busy="busy" />
                <ExtensionToolsSettings
                  v-else-if="tab === 'extensions'"
                  :initial-section="extensionSection"
                  @selected="selectExtension"
                  :save="save"
                  :search-available="searchAvailable"
                  :statuses="search?.statuses.value ?? {}"
                  :statuses-known="search?.known.value ?? false"
                  @checked="search?.refresh()"
                />
                <McpSettings
                  v-else-if="tab === 'mcp'"
                  :config="draft"
                  :providers="providerOptions"
                  :save="save"
                  :busy="busy"
                  :dirty="serverDirty"
                  :revision="revision"
                />
                <SkillsSettings
                  v-else-if="tab === 'skills'"
                  v-model:search-return="skillSearchReturn"
                  :config="draft"
                  :busy="busy"
                  :revision="revision"
                />
                <AccountSettings v-else-if="tab === 'accounts'" />
                <TerminalSettings v-else-if="tab === 'terminal'" />
                <ProviderSettings v-else :save="save" />
              </template>
              <div v-else-if="!busy && !deviceOnly" class="settings-empty">
                <p>{{ tr('设置尚未载入。', 'Settings are not loaded.') }}</p>
                <button class="btn" @click="load"><Icon name="refresh-cw" />{{ tr('重新载入', 'Reload') }}</button>
              </div>
            </div>
            <div :ref="setPageHost" class="settings-page-host" />
          </section>
          <Transition name="settings-save">
            <footer v-if="(dirty || saving) && !editorPage" class="settings-footer">
              <span class="settings-status" role="status"
                ><i aria-hidden="true" />{{ tr('有未保存的修改', 'Unsaved changes') }}</span
              >
              <button type="button" class="btn ghost" :disabled="busy || saving" @click="discard = true">
                {{ tr('放弃修改', 'Discard') }}
              </button>
              <button type="button" class="btn primary" :disabled="busy || saving" @click="save">
                <Icon :name="saving ? 'loader-circle' : 'save'" :class="{ spin: saving }" />{{
                  saving ? tr('保存中…', 'Saving…') : tr('保存', 'Save')
                }}
              </button>
            </footer>
          </Transition>
          <ShellProxyDialog :open="shellProxyPrompt" @answer="resolveShellProxy" />
          <Modal compact :open="discard" :title="tr('放弃修改？', 'Discard changes?')" @close="discard = false"
            ><p>
              {{
                tr(
                  '丢弃未保存的修改，恢复已保存的配置。',
                  'Discard unsaved changes and restore the saved configuration.',
                )
              }}
            </p>
            <template #footer
              ><button class="btn" @click="discard = false">{{ tr('继续编辑', 'Keep editing') }}</button
              ><button class="btn danger" @click="discardChanges">
                {{ tr('放弃修改', 'Discard changes') }}
              </button></template
            ></Modal
          >
          <Modal
            compact
            :layer="120"
            :dismissable="!leaveBusy"
            :open="leave"
            :title="isMobile ? tr('保存修改？', 'Save changes?') : tr('尚未保存', 'Unsaved changes')"
            @close="resolveLeave(false)"
            ><p>{{ tr('返回前是否保存已进行的修改？', 'Save your changes before returning?') }}</p>
            <template #footer
              ><button class="btn ghost" :disabled="leaveBusy" @click="resolveLeave(false)">
                {{ tr('继续编辑', 'Keep editing') }}</button
              ><button class="btn danger" :disabled="leaveBusy" @click="resolveLeave(true)">
                {{ tr('放弃修改', 'Discard') }}</button
              ><button class="btn primary" :disabled="leaveBusy" @click="saveAndReturn">
                <Icon v-if="leaveBusy" name="loader-circle" class="spinner" />{{
                  leaveBusy ? tr('保存中…', 'Saving…') : tr('保存并返回', 'Save & return')
                }}
              </button></template
            ></Modal
          >
        </div>
      </DialogContent>
    </DialogPortal>
  </DialogRoot>
</template>
<style scoped>
.native-settings {
  width: 100%;
  height: 100%;
  min-height: 0;
  margin: 0 auto;
  overflow: hidden;
}
.settings-sidebar {
  flex: none;
  display: flex;
  flex-direction: column;
  min-height: 0;
}
.settings-sidebar-body {
  display: flex;
  flex-direction: column;
  flex: 1;
  min-height: 0;
  overflow-y: auto;
  scrollbar-gutter: stable;
  scrollbar-width: thin;
  scrollbar-color: transparent transparent;
  transition: scrollbar-color var(--dur-slow) var(--ease-out);
}
.settings-sidebar-body.scrolling {
  scrollbar-color: var(--line-strong) transparent;
}
.settings-sidebar-body::-webkit-scrollbar-thumb {
  background: transparent;
  border-color: transparent;
  transition: background var(--dur-slow) var(--ease-out);
}
.settings-sidebar-body.scrolling::-webkit-scrollbar-thumb {
  background: var(--line-strong);
}
@media (hover: hover) {
  .settings-sidebar-body:hover {
    scrollbar-color: var(--line-strong) transparent;
  }
  .settings-sidebar-body:hover::-webkit-scrollbar-thumb {
    background: var(--line-strong);
  }
}
.settings-search {
  display: flex;
  flex: none;
  align-items: center;
  gap: 8px;
  min-width: 0;
  margin-bottom: 14px;
  padding: 0 10px;
  min-height: 38px;
  border: 1px solid var(--line);
  border-radius: 10px;
  background: var(--bg-group);
  color: var(--fg-subtle);
}
.settings-search:focus-within {
  border-color: var(--accent);
}
.settings-search > .icon {
  width: 17px;
  height: 17px;
  flex: none;
}
.settings-search input {
  width: 100%;
  min-width: 0;
  padding: 8px 0;
  border: 0;
  outline: 0;
  background: transparent;
  color: var(--fg);
  font: inherit;
  font-size: 13px;
}
.settings-search input::-webkit-search-cancel-button {
  display: none;
}
.settings-search .btn {
  flex: none;
  width: 28px;
  min-height: 28px;
  padding: 4px;
}
.settings-search-empty {
  color: var(--fg-subtle);
  font-size: 13px;
  padding: 8px;
}
.category-description {
  display: block;
  margin-top: 3px;
  color: var(--fg-subtle);
  font-size: 11px;
  font-weight: 400;
  line-height: 1.5;
  overflow-wrap: anywhere;
}
.settings-sidebar nav {
  flex: none;
  display: flex;
  flex-direction: column;
  gap: 2px;
}
.settings-nav-group + .settings-nav-group {
  margin-top: 14px;
}
.settings-nav-group h3 {
  margin: 0 8px 5px;
  font: 500 12px/1.5 var(--font);
  color: var(--fg-subtle);
}
.settings-section {
  display: flex;
  align-items: center;
  gap: 10px;
  width: 100%;
  padding: 6px 10px 6px 6px;
  border: 0;
  border-radius: 9px;
  background: transparent;
  color: var(--fg-muted);
  font: inherit;
  font-size: 13.5px;
  text-align: left;
  cursor: pointer;
  transition:
    background var(--dur-fast),
    color var(--dur-fast);
}
.settings-section-icon {
  display: grid;
  place-items: center;
  flex: none;
  width: 28px;
  height: 28px;
  border-radius: 8px;
  color: var(--fg-subtle);
  transition:
    background var(--dur-fast),
    color var(--dur-fast);
}
.settings-section-icon .icon {
  width: 18px;
  height: 18px;
}
.settings-section-text {
  flex: 1;
  min-width: 0;
}
@media (hover: hover) {
  .settings-section:hover {
    background: var(--bg-hover);
    color: var(--fg);
  }
}
.settings-section.selected {
  background: var(--bg-raised);
  color: var(--fg);
  font-weight: 500;
  box-shadow: inset 0 0 0 1px var(--line);
}
.settings-section.selected .settings-section-icon {
  background: var(--accent-soft);
  color: var(--accent);
}
.settings-brand {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-top: auto;
  color: var(--fg);
}
.settings-brand img {
  display: block;
  width: 26px;
  height: auto;
}
.settings-brand-word {
  height: 12px;
}
.settings-brand span {
  margin-left: auto;
  font-size: 11px;
  color: var(--fg-faint);
  font-variant-numeric: tabular-nums;
}

.settings-detail {
  position: relative;
  display: flex;
  flex-direction: column;
  flex: 1;
  min-width: 0;
  min-height: 0;
}
.settings-heading {
  display: flex;
  align-items: center;
  flex: none;
}
.settings-heading-text {
  flex: 1;
  min-width: 0;
}
.settings-heading-text p {
  margin: 2px 0 0;
  font-size: 12px;
  line-height: 1.5;
  color: var(--fg-subtle);
}
.settings-content {
  flex: 1;
  min-width: 0;
  min-height: 0;
  overflow: auto;
}
.settings-empty {
  display: grid;
  justify-items: center;
  gap: 14px;
  padding: 56px 0;
  color: var(--fg-subtle);
}
.settings-empty p {
  margin: 0;
}
.settings-empty .btn {
  display: inline-flex;
  align-items: center;
  gap: 7px;
}
.settings-empty .icon {
  width: 15px;
  height: 15px;
}
.input {
  min-width: 0;
  max-width: 100%;
}

.settings-footer {
  flex: none;
  display: flex;
  align-items: center;
  gap: 10px;
  border-top: 1px solid var(--line);
}
.settings-status {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  margin-right: auto;
  font-size: 12px;
  color: var(--fg-subtle);
}
.settings-status i {
  flex: none;
  width: 7px;
  height: 7px;
  border-radius: 50%;
  background: var(--accent);
  box-shadow: 0 0 0 3px var(--accent-soft);
}
.settings-save-enter-active {
  transition:
    transform 140ms var(--ease-out),
    opacity 140ms ease;
}
.settings-save-enter-from {
  opacity: 0;
  transform: translateY(4px);
}
@media (prefers-reduced-motion: reduce) {
  .settings-save-enter-active {
    transition: none;
  }
}
.settings-footer .btn {
  display: inline-flex;
  align-items: center;
  gap: 7px;
}
.settings-footer .btn .icon {
  width: 15px;
  height: 15px;
}
.settings-overlay {
  position: fixed;
  inset: 0;
  z-index: 50;
  background: var(--scrim);
  -webkit-backdrop-filter: blur(4px);
  backdrop-filter: blur(4px);
}

@media (min-width: 900px) {
  .native-settings {
    position: fixed;
    z-index: 51;
    top: 50%;
    left: 50%;
    transform: translate(-50%, -50%);
    display: grid;
    grid-template-columns: 224px minmax(0, 1fr);
    grid-template-rows: minmax(0, 1fr) auto;
    width: min(980px, 92vw);
    height: min(740px, 88dvh);
    max-width: none;
    margin: 0;
    padding: 0;
    background: var(--bg);
    border: 1px solid var(--line-strong);
    border-radius: 16px;
    box-shadow: var(--shadow-pop);
    animation: settings-enter 180ms var(--ease-out);
  }
  .native-settings[data-state='closed'] {
    animation: settings-exit 180ms ease-in forwards;
  }
  .settings-overlay[data-state='closed'] {
    animation: settings-overlay-out 180ms ease-in forwards;
    pointer-events: none;
  }
  .settings-sidebar {
    grid-row: 1/3;
    overflow: hidden;
    padding: 20px 0 16px;
    border-right: 1px solid var(--line);
    background: var(--bg-sunken);
  }
  .settings-heading {
    gap: 12px;
  }
  .settings-title {
    margin: 0;
    font-size: 16px;
    font-weight: 600;
  }

  .settings-sidebar-body {
    overflow: hidden;
    scrollbar-gutter: auto;
  }
  .settings-nav-scroll {
    overflow-y: auto;
    min-height: 0;
    padding: 0 12px;
    scrollbar-width: thin;
  }
  .settings-home-heading {
    padding: 0 20px 16px;
  }
  .settings-brand {
    padding: 12px 20px 0;
    flex: none;
  }

  .settings-content {
    padding: 22px 28px 28px;
  }
  .settings-footer {
    grid-column: 2;
    padding: 12px 20px 12px 28px;
    background: var(--bg);
  }
}

@media (max-width: 899px) {
  .native-settings {
    background: var(--bg-sunken);
  }
  /* Tablets keep the phone layout, centered at a readable width. */
  .settings-sidebar {
    width: 100%;
    flex: 1;
  }
  .settings-search {
    min-height: 44px;
  }
  .settings-search input {
    font-size: 16px;
  }
  .settings-sidebar-body {
    overflow: auto;
    padding: 20px max(16px, calc((100% - 640px) / 2)) max(20px, env(safe-area-inset-bottom));
  }
  .settings-group-rows {
    border-radius: 16px;
    overflow: hidden;
    background: var(--bg-group);
  }
  .settings-footer {
    padding: 8px 14px max(8px, env(safe-area-inset-bottom));
    background: var(--bg-group);
    gap: 6px;
  }
  .settings-section {
    min-height: 52px;
    padding: 12px 14px;
    gap: 14px;
    border-radius: 0;
    background: var(--bg-group);
    background-clip: padding-box;
    color: var(--fg);
    font-size: 15px;
    font-weight: 500;
  }
  .settings-section + .settings-section {
    border-top: 1px solid var(--line);
  }
  .settings-section:active {
    background-color: var(--bg-group-active);
  }
  .settings-section-icon {
    width: 28px;
    height: 28px;
    border-radius: 0;
    background: none;
    color: var(--fg-muted);
  }
  .settings-section-icon .icon {
    width: 21px;
    height: 21px;
  }
  .category-description {
    display: block;
    margin-top: 2px;
    font-size: 12px;
    font-weight: 400;
    color: var(--fg-subtle);
  }
  .section-chevron {
    flex: none;
    width: 16px;
    color: var(--fg-faint);
  }
  .settings-brand {
    flex-direction: column;
    justify-content: center;
    gap: 8px;
    padding: 40px 0 8px;
  }
  .settings-brand img {
    width: 40px;
  }
  .settings-brand-word {
    height: 18px;
  }
  .settings-brand span {
    margin: 0;
  }
  .settings-content {
    padding: 20px max(16px, calc((100% - 640px) / 2)) max(32px, env(safe-area-inset-bottom));
  }
  .native-settings[data-state='closed'] {
    animation: settings-page-out 180ms ease-in forwards;
    pointer-events: none;
  }
}
@keyframes settings-exit {
  from {
    opacity: 1;
    translate: 0 0;
    scale: 1;
  }
  to {
    opacity: 0;
    translate: 0 8px;
    scale: 0.985;
  }
}
@keyframes settings-overlay-out {
  from {
    opacity: 1;
  }
  to {
    opacity: 0;
  }
}
@keyframes settings-page-out {
  from {
    opacity: 1;
    transform: translateX(0);
  }
  to {
    opacity: 0;
    transform: translateX(24px);
  }
}
</style>

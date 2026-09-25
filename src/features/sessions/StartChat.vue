<script setup lang="ts">
import { modelLabel as formatModelLabel } from '../../ui/modelLabel.ts';
import { resolvedEffort, effortLabel } from './reasoningLabels.ts';
import { uploadAttachments, type AttachmentInput } from '../../core/attachments.ts';
import Hint from '../../ui/components/Hint.vue';
import { computed, nextTick, onActivated, onDeactivated, onScopeDispose, provide, ref, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { sessions } from '../../core/state/sessionsSlice.ts';
import * as api from '../../core/api/endpoints.ts';
import { i18n } from '../../core/i18n/index.ts';
import { errorText } from '../../core/config-editor.ts';
import { useMedia } from '../../ui/composables/useMedia.ts';
import { pageActivityKey, usePageActivity } from '../../ui/composables/usePageActivity.ts';
import { useModelCatalog } from './useModelCatalog.ts';
import { bus } from '../../core/bus.ts';
import { tr } from '../settings/fields.ts';
import type { ModelSelection } from './useSessionSelection.ts';
import RecentSessions from './RecentSessions.vue';
import Composer from './Composer.vue';
import DirectoryPicker from './DirectoryPicker.vue';
import ModelSettings from './ModelSettings.vue';
import ReasoningSettings from './ReasoningSettings.vue';
import Icon from '../../ui/components/Icon.vue';
import Wordmark from '../../ui/components/Wordmark.vue';
import SignOutButton from '../connection/SignOutButton.vue';

const route = useRoute(), router = useRouter();
const mobile = useMedia('(max-width: 899px)');
const parentActive = usePageActivity(), active = ref(true);
const visible = computed(() => parentActive.value && active.value);
provide(pageActivityKey, visible);
onActivated(async () => { active.value = true; void readDefaultModel(); await nextTick(); if (!mobile.value && route.name === 'new-chat') composer.value?.focus(); });
onDeactivated(() => { active.value = false; modelOpen.value = false; reasoningOpen.value = false; });
const catalog = useModelCatalog();
const selection = ref<ModelSelection>({ provider: '', model: '' });
const composer = ref<InstanceType<typeof Composer>>();
const modelOpen = ref(false), reasoningOpen = ref(false), busy = ref(false);
const created = ref<string>();
const failed = ref(false);
const defaultModel = ref<ModelSelection>();
const defaultReady = ref(false);
const defaultError = ref<unknown>();
const manuallySelected = ref(false);
const cwd = ref('');
const defaultCwd = ref('');
const manuallySetCwd = ref(false);
let defaultGeneration = 0;
async function readDefaultModel() {
  const generation = ++defaultGeneration;
  defaultReady.value = false;
  defaultError.value = undefined;
  try {
    const config = await api.configEffective();
    if (generation !== defaultGeneration) return;
    defaultModel.value = config.defaults.model ? { provider:config.defaults.provider, model:config.defaults.model, reasoning_effort:config.defaults.reasoning?.effort } : undefined;
    defaultCwd.value = config.defaults.cwd || '';
    if (!manuallySetCwd.value) cwd.value = defaultCwd.value;
    defaultReady.value = true;
  } catch (error) {
    if (generation === defaultGeneration) defaultError.value = error;
  }
}
const stopConfiguration = bus.on('configuration.changed', () => {
  void readDefaultModel();
  void catalog.reload();
});
onScopeDispose(stopConfiguration);
function selectModel(value: ModelSelection) {
  manuallySelected.value = true;
  selection.value = value;
}
// Groups too: a cached catalog is replaced quietly when the fresh one arrives.
watch([defaultReady, defaultModel, catalog.pending, catalog.groups], () => {
  if (!defaultReady.value || manuallySelected.value || created.value) return;
  if (defaultModel.value) {
    selection.value = { ...defaultModel.value };
    return;
  }
  if (catalog.pending.value) return;
  const candidates = catalog.groups.value.flatMap(group => group.models.map(model => ({ provider: group.provider.id, model: model.id })));
  candidates.sort((a, b) => a.provider < b.provider ? -1 : a.provider > b.provider ? 1 : a.model < b.model ? -1 : a.model > b.model ? 1 : 0);
  selection.value = candidates[0] ?? { provider: '', model: '' };
}, { deep: true });
watch(() => route.name, async name => {
  if (name === 'new-chat' && !mobile.value && visible.value) { await nextTick(); composer.value?.focus(); }
});
const effectiveEffort = computed(() => {
  const group = catalog.groups.value.find(item => item.provider.id === selection.value.provider);
  if (!group || group.loading) return selection.value.reasoning_effort;
  return resolvedEffort(selection.value.reasoning_effort, group.models.find(item => item.id === selection.value.model), group.provider.reasoning_efforts);
});
const modelLabel = computed(() => formatModelLabel(selection.value.model));
async function send(text: string, attachments: AttachmentInput[]) {
  busy.value = true;
  failed.value = false;
  try {
    // Retain the ID after a failed upload/send. Retrying the draft must never
    // create a second session, and its images always belong to this exact ID.
    if (!created.value) {
      const { provider, model, reasoning_effort } = selection.value;
      const remembered = { provider, model, reasoning_effort: reasoning_effort ?? effectiveEffort.value };
      const name = [...(text.trim().split('\n')[0] || attachments.find(file => file.name)?.name || '')].slice(0, 60).join('');
      created.value = (await sessions.create({ provider, model, reasoningEffort: reasoning_effort ?? effectiveEffort.value, name, cwd: cwd.value.trim() })).id;
      try {
        await api.rememberDefaultModel(remembered);
        ++defaultGeneration;
        defaultModel.value = remembered;
        defaultReady.value = true;
      } catch (error) {
        // The session is already created. A settings conflict must not block its first message.
        defaultError.value = error;
      }
    }
    const id = created.value!;
    const capabilities = attachments.length ? await api.sessionCapabilities(id) : undefined;
    const { blocks } = await uploadAttachments(id, attachments, { capabilities });
    const delivery = await api.messageSend(id, { content: text, ...(blocks.length ? { blocks } : {}) });
    created.value = undefined;
    manuallySelected.value = false;
    manuallySetCwd.value = false;
    cwd.value = defaultCwd.value;
    // Completion can arrive after navigation; do not take over another page.
    if (visible.value && ['sessions', 'new-chat'].includes(String(route.name))) await router.push('/s/' + id);
    return delivery.id;
  } catch (error) { failed.value = true; throw error; }
  finally { busy.value = false; }
}
</script>

<template>
  <div class="start-chat" :class="{ 'mobile-home': mobile && route.name === 'sessions' }">
    <button v-if="mobile && route.name !== 'sessions'" class="btn ghost icon-only start-back" :aria-label="i18n.t('chatbar.back')" @click="router.push('/sessions')"><Icon name="arrow-left" /></button>
    <div v-if="mobile && route.name === 'sessions'" class="home-leading"><SignOutButton button-class="btn ghost icon-only" /></div>
    <div v-if="mobile && route.name === 'sessions'" class="home-actions">
      <button class="btn ghost icon-only" :aria-label="i18n.t('nav.stats')" @click="router.push('/stats')"><Icon name="chart-column"/></button>
      <button class="btn ghost icon-only" :aria-label="i18n.t('nav.settings')" @click="router.push('/settings')"><Icon name="settings"/></button>
    </div>
    <div class="start-surface">
      <div class="start-brand" aria-hidden="true"><img class="start-mark" src="/app-icons/mark.svg" alt="" /><Wordmark class="start-wordmark" /></div>
      <Composer ref="composer" session-id="new-session" :mobile="mobile" start :send-message="send" :disabled="!selection.model || !cwd.trim() || busy || (!manuallySelected && !defaultReady)">
        <template #selection>
          <div class="start-model-controls model-selection">
            <Hint :text="i18n.t('model.title')"><button class="model-chip" :aria-expanded="modelOpen" :disabled="busy || !!created" @click="modelOpen = true">{{ modelLabel || i18n.t('model.title') }}</button></Hint>
            <span class="selection-dot" aria-hidden="true">·</span>
            <Hint :text="i18n.t('reasoning.title')"><button class="reasoning-chip" :aria-expanded="reasoningOpen" :disabled="!selection.model || busy || !!created" @click="reasoningOpen = true">{{ effortLabel(effectiveEffort).toUpperCase() }}</button></Hint>
          </div>
        </template>
        <template #footer-start><DirectoryPicker :model-value="cwd" :disabled="busy || !!created" @update:model-value="cwd=$event; manuallySetCwd=true" /></template>
      </Composer>
      <p v-if="defaultReady && !cwd.trim()" class="hint" role="status">{{ tr('请填写工作目录后发送。','Enter a working directory before sending.') }}</p>
      <div v-if="defaultError" class="load-error" role="alert">{{ errorText(defaultError) }} <button class="btn ghost sm" @click="readDefaultModel">{{ i18n.t('common.retry') }}</button></div>
      <div v-if="catalog.error.value" class="load-error" role="alert">{{ errorText(catalog.error.value) }} <button class="btn ghost sm" @click="catalog.reload">{{ i18n.t('common.retry') }}</button></div>
      <template v-if="!selection.model">
        <p v-if="catalog.pending.value" class="hint" role="status">{{ i18n.t('new.loadingModels') }}</p>
        <div v-else class="start-empty hint">{{ i18n.t('new.noModels') }} <RouterLink class="btn ghost sm" to="/settings">{{ i18n.t('nav.settings') }}</RouterLink></div>
      </template>
      <p v-if="failed && created" class="hint" role="status">{{ i18n.t('new.retryMessage') }}</p>
      <RecentSessions v-if="mobile && route.name === 'sessions'" />
    </div>
    <ModelSettings v-if="modelOpen" :selection="selection" @select="selectModel" @close="modelOpen = false" />
    <ReasoningSettings v-if="reasoningOpen" :selection="selection" @select="selectModel" @close="reasoningOpen = false" />
  </div>
</template>

<style scoped>
.start-chat { height: 100%; min-height: 0; overflow: auto; display: flex; align-items: center; justify-content: center; padding: 32px clamp(24px, 5vw, 80px); position: relative; }
.start-surface { width: 100%; max-width: 740px; margin-block: auto; padding-block: 24px 12vh; }
.start-brand { display: flex; align-items: center; gap: 16px; margin-bottom: 28px; }
.start-mark { display: block; width: 64px; height: auto; }
.start-wordmark { height: 36px; color: var(--fg); }
.start-model-controls { display: inline-flex; width: max-content; max-width: 100%; align-items: center; min-width: 0; gap: 3px; }
.start-model-controls button { font-size: 12px; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.start-model-controls .model-chip { flex: 0 1 auto; max-width: min(38vw, 320px); }
.home-actions { position: absolute; top: 8px; right: 12px; z-index: 1; display: flex; align-items: center; gap: 2px; }
.home-leading { position: absolute; top: 8px; left: 12px; z-index: 1; }
:is(.home-actions, .home-leading) .btn { width: 44px; height: 44px; }
.start-back { position: absolute; top: 8px; left: 8px; }
.start-empty { display: flex; align-items: center; gap: 8px; }
:deep(.composer-start) { border: 1px solid var(--line-strong); border-radius: 16px; background: var(--bg-raised); box-shadow: 0 4px 24px #0000000a; padding: 10px 14px 12px; min-height: 188px; }
:deep(.composer-start.desktop) { --composer-send-clearance: 4px; padding: 10px 16px; }
:deep(.composer-start:focus-within) { border-color: var(--accent); }
:deep(.composer-start .composer-editor) { min-height: 80px; }
:deep(.composer-start .composer-toolbar) { padding: 0; gap: 6px; }
:deep(.composer-start.desktop .composer-input) { height: auto; min-height: 80px; align-self: stretch; }
:deep(.composer-start-selection) { padding: 2px 4px 8px; }
@media (max-width: 899px) {
  .start-chat { padding: 48px 16px 16px; }
  .start-surface { max-width: var(--mobile-content-width); padding-block: 16px 8vh; }
  .mobile-home { flex-direction: column; justify-content: flex-start; padding: 52px 24px 24px; }
  .mobile-home .start-surface { flex-shrink: 0; margin: auto; padding: 0; }
  :deep(.composer-mobile-actions .composer-start-selection) { flex: 1; min-width: 0; padding: 0; }
  .start-brand { gap: 12px; margin-bottom: 24px; }
  .start-mark { width: 52px; }
  .start-wordmark { height: 30px; }
  .mobile-home .start-brand { margin-bottom: 16px; }
  .mobile-home .start-mark { width: 44px; }
  .mobile-home .start-wordmark { height: 26px; }
  :deep(.composer-start) { min-height: 0; padding: 12px 12px 14px; }
  :deep(.composer-start .composer-mobile-actions) { margin-bottom: 12px; }
  :deep(.composer-start.mobile .composer-editor), :deep(.composer-start.mobile .composer-input) { min-height: 72px; }
}
@media (max-height: 500px) { .start-surface { padding-block: 8px; } .start-brand { display: none; } }
</style>

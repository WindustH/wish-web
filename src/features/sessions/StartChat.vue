<script setup lang="ts">
import Hint from '../../ui/components/Hint.vue';
import { computed, nextTick, onActivated, onDeactivated, provide, ref, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { sessions } from '../../core/state/sessionsSlice.js';
import * as api from '../../core/api/endpoints.js';
import { i18n } from '../../core/i18n/index.js';
import { errorText } from '../../core/config-editor';
import { useMedia } from '../../ui/composables/useMedia';
import { pageActivityKey, usePageActivity } from '../../ui/composables/usePageActivity';
import { useModelCatalog } from './useModelCatalog';
import type { ModelSelection } from './useSessionSelection';
import Composer from './Composer.vue';
import ModelSettings from './ModelSettings.vue';
import ReasoningSettings from './ReasoningSettings.vue';
import Icon from '../../ui/components/Icon.vue';

const route = useRoute(), router = useRouter();
const mobile = useMedia('(max-width: 899px)');
const parentActive = usePageActivity(), active = ref(true);
const visible = computed(() => parentActive.value && active.value && (!mobile.value || route.name !== 'sessions'));
provide(pageActivityKey, visible);
onActivated(async () => { active.value = true; await nextTick(); if (!mobile.value && route.name === 'new-chat') composer.value?.focus(); });
onDeactivated(() => { active.value = false; modelOpen.value = false; reasoningOpen.value = false; });
const catalog = useModelCatalog();
const selection = ref<ModelSelection>({ provider: '', model: '' });
const composer = ref<InstanceType<typeof Composer>>();
const modelOpen = ref(false), reasoningOpen = ref(false), busy = ref(false);
const created = ref<string>();
const failed = ref(false);
watch(catalog.groups, groups => {
  if (selection.value.model) return;
  const first = groups.find(group => group.models.length);
  if (first) selection.value = { provider: first.provider.id, model: first.models[0].id };
}, { deep: true });
watch(() => route.name, async name => {
  if (name === 'new-chat' && !mobile.value && visible.value) { await nextTick(); composer.value?.focus(); }
});
const modelLabel = computed(() => selection.value.model.replace(/[-_]/g, ' ').toUpperCase());
async function send(text: string, images: { name: string; mime: string; bytes: ArrayBuffer }[]) {
  busy.value = true;
  failed.value = false;
  try {
    // Retain the ID after a failed upload/send. Retrying the draft must never
    // create a second session, and its images always belong to this exact ID.
    if (!created.value) {
      const { provider, model, reasoning_effort } = selection.value;
      const name = [...text.trim().split('\n')[0]].slice(0, 60).join('');
      created.value = (await sessions.create({ provider, model, reasoningEffort: reasoning_effort, name })).id;
    }
    const id = created.value!;
    const blocks = [];
    for (const image of images) {
      const blob = await api.uploadSessionImage(id, image.bytes, image.mime);
      blocks.push({ type: 'image', blob_id: blob.id ?? blob.sha256 });
    }
    const delivery = await api.messageSend(id, { content: text, ...(blocks.length ? { blocks } : {}) });
    created.value = undefined;
    // Completion can arrive after navigation; do not take over another page.
    if (visible.value && ['sessions', 'new-chat'].includes(String(route.name))) await router.push('/s/' + id);
    return delivery.resource_id ?? delivery.id;
  } catch (error) { failed.value = true; throw error; }
  finally { busy.value = false; }
}
</script>

<template>
  <div class="start-chat">
    <button v-if="mobile" class="btn ghost icon-only start-back" :aria-label="i18n.t('chatbar.back')" @click="router.push('/sessions')"><Icon name="arrow-left" /></button>
    <div class="start-surface">
      <div class="start-mark" aria-hidden="true">W<span>.</span></div>
      <Composer ref="composer" session-id="new-session" :mobile="mobile" start :send-message="send" :disabled="!selection.model || busy">
        <template #selection>
          <div class="start-model-controls model-selection">
            <Hint :text="i18n.t('model.title')"><button class="model-chip" :aria-expanded="modelOpen" :disabled="busy || !!created" @click="modelOpen = true">{{ modelLabel || i18n.t('model.title') }}</button></Hint>
            <span class="selection-dot" aria-hidden="true">·</span>
            <Hint :text="i18n.t('reasoning.title')"><button class="reasoning-chip" :aria-expanded="reasoningOpen" :disabled="!selection.model || busy || !!created" @click="reasoningOpen = true">{{ (selection.reasoning_effort || 'auto').toUpperCase() }}</button></Hint>
          </div>
        </template>
      </Composer>
      <div v-if="catalog.error.value" class="load-error" role="alert">{{ errorText(catalog.error.value) }} <button class="btn ghost sm" @click="catalog.reload">{{ i18n.t('common.retry') }}</button></div>
      <template v-if="!selection.model">
        <p v-if="catalog.pending.value" class="hint" role="status">{{ i18n.t('new.loadingModels') }}</p>
        <div v-else class="start-empty hint">{{ i18n.t('new.noModels') }} <RouterLink class="btn ghost sm" to="/settings">{{ i18n.t('nav.settings') }}</RouterLink></div>
      </template>
      <p v-if="failed && created" class="hint" role="status">{{ i18n.t('new.retryMessage') }}</p>
    </div>
    <ModelSettings v-if="modelOpen" :selection="selection" @select="selection = $event" @close="modelOpen = false" />
    <ReasoningSettings v-if="reasoningOpen" :selection="selection" @select="selection = $event" @close="reasoningOpen = false" />
  </div>
</template>

<style scoped>
.start-chat { height: 100%; min-height: 0; overflow: auto; display: flex; align-items: center; justify-content: center; padding: 32px clamp(24px, 5vw, 80px); position: relative; }
.start-surface { width: 100%; max-width: 740px; margin-block: auto; padding-block: 24px 12vh; }
.start-mark { font: 600 44px/1.2 var(--display); text-align: center; margin-bottom: 28px; letter-spacing: -.05em; }
.start-mark span { color: var(--accent); }
.start-model-controls { display: inline-flex; width: max-content; max-width: 100%; align-items: center; min-width: 0; gap: 3px; }
.start-model-controls button { font-size: 12px; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.start-model-controls .model-chip { flex: 0 1 auto; max-width: min(38vw, 320px); }
.start-back { position: absolute; top: 8px; left: 8px; }
.start-empty { display: flex; align-items: center; gap: 8px; }
:deep(.composer-start) { border: 1px solid var(--line-strong); border-radius: 16px; background: var(--bg-raised); box-shadow: 0 4px 24px #0000000a; padding: 10px 14px 12px; min-height: 188px; }
:deep(.composer-start .composer-editor) { min-height: 80px; }
:deep(.composer-start .composer-toolbar) { padding: 0; gap: 6px; }
:deep(.composer-start .composer-footer) { padding: 4px 0 0; }
:deep(.composer-start textarea) { min-height: 80px; }
:deep(.composer-start-selection) { padding: 2px 4px 8px; }
@media (max-width: 899px) {
  .start-chat { padding: 48px 16px 16px; }
  .start-surface { padding-block: 16px 8vh; }
  .start-mark { font-size: 36px; margin-bottom: 24px; }
  :deep(.composer-start) { min-height: 0; padding: 10px; }
  :deep(.composer-start .composer-editor), :deep(.composer-start textarea) { min-height: 44px; }
}
@media (max-height: 500px) { .start-surface { padding-block: 8px; } .start-mark { display: none; } }
</style>

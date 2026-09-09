<script setup lang="ts">
// Model/provider picker: one-time initial state from the snapshot (later
// revisions never redefine the user's picks), If-Match on the CURRENT
// revision at save time, provider switch never injects the old provider's
// current model, effort-clearing is explicitly unsupported, 409 humanly
// worded. Success only refreshes snapshot+capabilities — never the history.
import { computed, ref, watch } from 'vue';
import { i18n } from '../../core/i18n/index.js';
import { chat } from '../../core/state/chatSlice.js';
import * as api from '../../core/api/endpoints.js';
import { useProviderModels, withCurrent } from './useProviderModels.js';
import Modal from '../../ui/components/Modal.vue';
import Spinner from '../../ui/components/Spinner.vue';

const props = defineProps<{ open: boolean; sessionId: string }>();
const emit = defineEmits<{ close: [] }>();

const initial = (() => {
  const s = chat.snapshot.value;
  return { provider: s?.provider || '', model: s?.model || '', effort: s?.reasoning_effort || '' };
})();

const provider = ref(initial.provider);
const model = ref(initial.model);
const effort = ref(initial.effort);
const busy = ref(false);
const err = ref<any>(null);

const { providers, models, loadErr, loading, retry } = useProviderModels();
watch(() => props.open, (v) => { if (v) retry(); });

const sameProvider = computed(() => provider.value === initial.provider);
// While the new provider's catalog loads, models is null — render array
// stays an array; "loading" is conveyed separately.
const choices = computed(() => (sameProvider.value ? withCurrent(models.value, initial.model) : models.value) ?? []);

const effortCleared = computed(() => Boolean(initial.effort) && !effort.value.trim());
const changed = computed(() =>
  provider.value !== initial.provider
  || model.value !== initial.model
  || (!effortCleared.value && (effort.value.trim() || '') !== (initial.effort || '')));

async function save() {
  if (!changed.value || !provider.value || !model.value || effortCleared.value) return;
  busy.value = true;
  err.value = null;
  try {
    const body: Record<string, unknown> = { provider: provider.value, model: model.value };
    if (effort.value.trim()) body.reasoning_effort = effort.value.trim();
    const rev = chat.snapshot.value?.revision;
    const next = await api.sessionUpdateModel(props.sessionId, body, rev);
    chat.snapshot.value = next;
    chat.reloadCapabilities();
    emit('close');
  } catch (e: any) {
    err.value = e?.code === 'revision_conflict' ? { conflict: true } : e;
  } finally {
    busy.value = false;
  }
}
</script>

<template>
  <Modal :open="open" :title="i18n.t('model.title')" :dismissable="!busy" @close="emit('close')">
    <div v-if="loadErr" class="load-error" role="alert">
      <span>{{ String(loadErr?.detail || loadErr?.message || loadErr) }}</span>
      <button class="btn ghost sm" @click="retry">{{ i18n.t('common.retry') }}</button>
    </div>
    <div v-if="err?.conflict" class="warn-note" role="alert">{{ i18n.t('model.conflict') }}</div>
    <div v-else-if="err" class="load-error" role="alert">{{ String(err?.detail || err?.message || err) }}</div>
    <div v-if="effortCleared" class="warn-note">{{ i18n.t('model.effortClearUnsupported') }}</div>
    <label class="field">
      <span>{{ i18n.t('model.provider') }}</span>
      <select v-model="provider" class="select" :disabled="busy">
        <option v-for="p in providers ?? []" :key="p.id" :value="p.id">{{ p.id }}</option>
      </select>
    </label>
    <label class="field">
      <span>{{ i18n.t('model.model') }}</span>
      <select v-model="model" class="select" :disabled="!choices.length || busy">
        <option v-for="m in choices" :key="m.id" :value="m.id">
          {{ m.id }}{{ m.source === 'current' ? ` (${i18n.t('model.currentSuffix')})` : '' }}
        </option>
      </select>
      <Spinner v-if="loading" />
    </label>
    <label class="field">
      <span>{{ i18n.t('model.effort') }}</span>
      <select v-model="effort" class="select" :disabled="busy">
        <option value="">—</option>
        <option v-for="e in ['low', 'medium', 'high']" :key="e" :value="e">{{ e }}</option>
      </select>
    </label>
    <p class="hint">{{ i18n.t('model.nextRunNote') }}</p>
    <template #footer>
      <button class="btn ghost" :disabled="busy" @click="emit('close')">{{ i18n.t('manage.cancel') }}</button>
      <button class="btn primary" :disabled="!changed || busy || effortCleared || !model" @click="save">
        {{ busy ? i18n.t('sessions.loading') : i18n.t('common.save') }}
      </button>
    </template>
  </Modal>
</template>

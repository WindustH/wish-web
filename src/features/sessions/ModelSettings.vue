<script setup lang="ts">
// Model changes apply to the next run. Read a fresh baseline on open and
// keep every async result scoped to that dialog and session.
import { computed, onUnmounted, ref, watch } from 'vue';
import { i18n } from '../../core/i18n/index.js';
import { chat } from '../../core/state/chatSlice.js';
import * as api from '../../core/api/endpoints.js';
import { useProviderModels, withCurrent } from './useProviderModels.js';
import Modal from '../../ui/components/Modal.vue';
import Spinner from '../../ui/components/Spinner.vue';

const props = defineProps<{ open: boolean; sessionId: string }>();
const emit = defineEmits<{ close: [] }>();

const initial = ref({ provider: '', model: '', effort: '' });
const provider = ref('');
const model = ref('');
const effort = ref('');
const busy = ref(false);
const err = ref<unknown>(null);
const conflict = ref(false);
const baselineBusy = ref(false);
let generation = 0;
let revision: number | undefined;
const owns = (gen: number, sid: string) => gen === generation && props.open && props.sessionId === sid && chat.sessionId.value === sid;
const errorText = computed(() => err.value instanceof Error ? err.value.message : String(err.value ?? ''));
const effortOptions = ['none', 'minimal', 'low', 'medium', 'high', 'xhigh', 'max'];

const { providers, models, loadErr, loading, retry, selectProvider } = useProviderModels({ immediate: false });

async function loadBaseline() {
  const gen = ++generation;
  const sid = props.sessionId;
  baselineBusy.value = true;
  err.value = null;
  conflict.value = false;
  try {
    const snapshot = await api.sessionGet(sid);
    if (!owns(gen, sid)) return;
    initial.value = { provider: snapshot.provider ?? '', model: snapshot.model ?? '', effort: snapshot.reasoning_effort ?? '' };
    revision = snapshot.revision;
    provider.value = initial.value.provider;
    model.value = initial.value.model;
    effort.value = initial.value.effort;
    selectProvider(provider.value);
    retry();
    if ((chat.snapshot.value?.revision ?? 0) <= snapshot.revision) chat.snapshot.value = snapshot;
  } catch (error) {
    if (owns(gen, sid)) err.value = error;
  } finally {
    if (owns(gen, sid)) baselineBusy.value = false;
  }
}
watch(() => [props.open, props.sessionId] as const, ([open]) => {
  generation++;
  busy.value = false;
  baselineBusy.value = false;
  if (open) loadBaseline();
}, { immediate: true });
onUnmounted(() => { generation++; });
watch(provider, (p, prev) => {
  if (!p) return;
  selectProvider(p);
  // Cross-provider switch: the old provider's model id is meaningless for
  // the new one — clear it, and only restore the baseline model when the
  // user returns to the baseline provider (root review).
  if (p === initial.value.provider) model.value = initial.value.model;
  else if (prev !== undefined && model.value) model.value = '';
});

const sameProvider = computed(() => provider.value === initial.value.provider);
// While the new provider's catalog loads, models is null — render array
// stays an array; "loading" is conveyed separately.
const choices = computed(() => (sameProvider.value ? withCurrent(models.value, initial.value.model) : models.value) ?? []);
// A model that is not on the CURRENT provider's choices must never be
// saved (it would send a new provider + the old provider's model id).
const modelValid = computed(() => choices.value.some((m) => m.id === model.value));

const effortCleared = computed(() => Boolean(initial.value.effort) && !effort.value.trim());
const changed = computed(() =>
  provider.value !== initial.value.provider
  || model.value !== initial.value.model
  || (!effortCleared.value && (effort.value.trim() || '') !== (initial.value.effort || '')));

async function save() {
  if (busy.value || baselineBusy.value || loading.value || !changed.value || !provider.value || !model.value || !modelValid.value || effortCleared.value) return;
  const gen = generation;
  const sid = props.sessionId;
  busy.value = true;
  err.value = null;
  conflict.value = false;
  try {
    const body: Record<string, unknown> = { provider: provider.value, model: model.value };
    if (effort.value.trim()) body.reasoning_effort = effort.value.trim();
    const next = await api.sessionUpdateModel(sid, body, revision);
    if (!owns(gen, sid)) return;
    if ((chat.snapshot.value?.revision ?? 0) <= next.revision) chat.snapshot.value = next;
    await chat.reloadCapabilities();
    if (owns(gen, sid)) emit('close');
  } catch (error) {
    if (!owns(gen, sid)) return;
    conflict.value = error != null && typeof error === 'object' && 'code' in error && error.code === 'revision_conflict';
    err.value = error;
  } finally {
    if (owns(gen, sid)) busy.value = false;
  }
}
</script>

<template>
  <Modal :open="open" :title="i18n.t('model.title')" :dismissable="!busy" @close="emit('close')">
    <div v-if="loadErr" class="load-error" role="alert">
      <span>{{ String(loadErr?.detail || loadErr?.message || loadErr) }}</span>
      <button class="btn ghost sm" @click="retry">{{ i18n.t('common.retry') }}</button>
    </div>
    <div v-if="conflict" class="warn-note" role="alert">{{ i18n.t('model.conflict') }} <button class="btn ghost sm" @click="loadBaseline">{{ i18n.t('common.retry') }}</button></div>
    <div v-else-if="err" class="load-error" role="alert">{{ errorText }}</div>
    <div v-if="effortCleared" class="warn-note">{{ i18n.t('model.effortClearUnsupported') }}</div>
    <label class="field">
      <span>{{ i18n.t('model.provider') }}</span>
      <select v-model="provider" class="select" :disabled="busy || baselineBusy">
        <option v-for="p in providers ?? []" :key="p.id" :value="p.id">{{ p.id }}</option>
      </select>
    </label>
    <label class="field">
      <span>{{ i18n.t('model.model') }}</span>
      <select v-model="model" class="select" :disabled="!choices.length || busy || baselineBusy">
        <option v-for="m in choices" :key="m.id" :value="m.id">
          {{ m.id }}{{ m.source === 'current' ? ` (${i18n.t('model.currentSuffix')})` : '' }}
        </option>
      </select>
      <Spinner v-if="loading || baselineBusy" />
    </label>
    <label class="field">
      <span>{{ i18n.t('model.effort') }}</span>
      <input v-model="effort" class="input" list="model-effort-options" :disabled="busy || baselineBusy" />
      <datalist id="model-effort-options">
        <option v-for="level in effortOptions" :key="level" :value="level" />
      </datalist>
    </label>
    <p class="hint">{{ i18n.t('model.nextRunNote') }}</p>
    <template #footer>
      <button class="btn ghost" :disabled="busy || baselineBusy" @click="emit('close')">{{ i18n.t('manage.cancel') }}</button>
      <button class="btn primary" :disabled="!changed || busy || baselineBusy || loading || effortCleared || !modelValid" @click="save">
        {{ busy ? i18n.t('sessions.loading') : i18n.t('common.save') }}
      </button>
    </template>
  </Modal>
</template>

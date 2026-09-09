<script setup lang="ts">
// New session: shared provider/model catalog (stale-guarded, error≠empty),
// optional name, explicit provider+model (the backend never guesses).
import { computed, ref, watch } from 'vue';
import { useRouter } from 'vue-router';
import * as api from '../../core/api/endpoints.js';
import { sessions } from '../../core/state/sessionsSlice.js';
import { i18n } from '../../core/i18n/index.js';
import { cfg } from '../../core/config.js';
import { newSessionOpen } from './newSessionBus.js';
import Modal from '../../ui/components/Modal.vue';
import Spinner from '../../ui/components/Spinner.vue';
import { useProviderModels, withCurrent } from './useProviderModels.js';

const router = useRouter();
const open = computed(() => newSessionOpen.value);

const { providers, models, loadErr, loading, retry, selectProvider } = useProviderModels();

const provider = ref<string>('');
const model = ref<string>('');
const name = ref('');
const busy = ref(false);
const err = ref<any>(null);

watch(open, (v) => {
  if (v) {
    retry();
    provider.value = '';
    model.value = '';
    name.value = '';
    err.value = null;
  }
});
watch(providers, (list) => {
  if (list?.length && !provider.value) {
    provider.value = list[0]!.id;
    selectProvider(list[0]!.id);
  }
});
watch(provider, (p) => { model.value = ''; if (p) selectProvider(p); });

const choices = computed(() => withCurrent(models.value, null));

async function create() {
  if (!provider.value || !model.value) return;
  busy.value = true;
  err.value = null;
  try {
    const s = await api.sessionCreate({
      provider: provider.value, model: model.value,
      ...(name.value.trim() ? { name: name.value.trim() } : {}),
    });
    sessions.create(s);
    newSessionOpen.value = false;
    router.push(`/s/${s.id}`);
  } catch (e: any) {
    err.value = e;
  } finally {
    busy.value = false;
  }
}
</script>

<template>
  <Modal :open="open" :title="i18n.t('new.title')" :dismissable="!busy" @close="newSessionOpen = false">
    <div v-if="loadErr" class="load-error" role="alert">
      <span>{{ String(loadErr?.detail || loadErr?.message || loadErr) }}</span>
      <button class="btn ghost sm" @click="retry">{{ i18n.t('common.retry') }}</button>
    </div>
    <label class="field">
      <span>{{ i18n.t('new.name') }}</span>
      <input v-model="name" class="input" type="text" :placeholder="i18n.t('new.namePlaceholder')" :disabled="busy" />
    </label>
    <label class="field">
      <span>{{ i18n.t('model.provider') }}</span>
      <select v-model="provider" class="select" :disabled="busy || !providers?.length">
        <option v-if="!providers?.length" value="">—</option>
        <option v-for="p in providers ?? []" :key="p.id" :value="p.id">{{ p.id }}</option>
      </select>
    </label>
    <label class="field">
      <span>{{ i18n.t('model.model') }}</span>
      <select v-model="model" class="select" :disabled="busy || !choices.length">
        <option v-if="!choices.length" value="">{{ loading ? i18n.t('sessions.loading') : i18n.t('new.anyModel') }}</option>
        <option v-for="m in choices" :key="m.id" :value="m.id">{{ m.id }}</option>
      </select>
      <Spinner v-if="loading" />
    </label>
    <div v-if="err" class="load-error" role="alert">{{ String(err?.detail || err?.message || err) }}</div>
    <template #footer>
      <button class="btn ghost" :disabled="busy" @click="newSessionOpen = false">{{ i18n.t('manage.cancel') }}</button>
      <button class="btn primary" :disabled="busy || !provider || !model" @click="create">
        {{ busy ? i18n.t('sessions.loading') : i18n.t('new.create') }}
      </button>
    </template>
  </Modal>
</template>

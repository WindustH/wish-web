<script setup lang="ts">
// Manage sheet: tags (metadata JSON — other keys ride along untouched),
// rename, prune dialog (frozen cutoff), danger actions with centered
// confirm modals (busy locks all dismiss paths; failures keep the modal).
import { computed, onMounted, ref } from 'vue';
import { useRouter } from 'vue-router';
import * as api from '../../core/api/endpoints.js';
import { chat } from '../../core/state/chatSlice.js';
import { sessions } from '../../core/state/sessionsSlice.js';
import { i18n } from '../../core/i18n/index.js';
import { fmtDateTime } from '../../core/util/fmt.js';
import Sheet from '../../ui/components/Sheet.vue';
import Modal from '../../ui/components/Modal.vue';
import PruneDialog from './PruneDialog.vue';
import { useMedia } from '../../ui/composables/useMedia.js';

defineEmits<{ close: [] }>();
const router = useRouter();
const isMobile = useMedia('(max-width: 899px)');

const snapshot = computed(() => chat.snapshot.value);
const err = ref<any>(null);
const busy = ref(false);
const confirming = ref<any>(null);
const confirmErr = ref<string | null>(null);
const pruneOpen = ref(false);
const renameOpen = ref(false);
const renameText = ref('');
const tagInput = ref('');

async function refresh() {
  try { chat.snapshot.value = await api.sessionGet(chat.sessionId.value!); }
  catch (e) { err.value = e; }
}
onMounted(refresh);

const tags = computed(() => Array.isArray(snapshot.value?.metadata?.tags) ? snapshot.value.metadata.tags : []);

async function run(action: () => Promise<unknown>) {
  busy.value = true;
  try {
    await action();
  } catch (e: any) {
    // busy 409: never auto-interrupt. revision 409: concurrent edit — refresh.
    if (e?.code === 'state_conflict') err.value = { code: 'state_conflict' };
    else err.value = e;
  } finally {
    busy.value = false;
    await refresh();
  }
}

async function runConfirmed(action: () => Promise<unknown>) {
  busy.value = true;
  confirmErr.value = null;
  try {
    await action();
    confirming.value = null;
  } catch (e: any) {
    confirmErr.value = String(e?.detail || e?.message || e);
  } finally {
    busy.value = false;
    await refresh();
  }
}

async function addTag() {
  const t = tagInput.value.trim();
  if (!t) return;
  if (tags.value.includes(t)) { tagInput.value = ''; return; }
  if (tags.value.length >= 16) return;
  const next = [...tags.value, t];
  tagInput.value = '';
  await run(() => api.sessionUpdateMeta(chat.sessionId.value!, { ...snapshot.value?.metadata, tags: next }, snapshot.value?.revision));
  sessions.updateMeta(chat.sessionId.value!, { tags: next });
}

async function removeTag(t: string) {
  const next = tags.value.filter((x: string) => x !== t);
  await run(() => api.sessionUpdateMeta(chat.sessionId.value!, { ...snapshot.value?.metadata, tags: next }, snapshot.value?.revision));
  sessions.updateMeta(chat.sessionId.value!, { tags: next });
}

async function doRename() {
  await runConfirmed(() => api.sessionRename(chat.sessionId.value!, renameText.value.trim()));
  sessions.rename(chat.sessionId.value!, renameText.value.trim());
}

async function doDelete() {
  await runConfirmed(async () => {
    await api.sessionDelete(chat.sessionId.value!);
    sessions.dropRow(chat.sessionId.value!);
    chat.close();
    router.push('/sessions');
  });
}
</script>

<template>
  <Sheet :open="true" :title="i18n.t('manage.title')" :mobile="isMobile" @close="$emit('close')">
    <div v-if="err?.code === 'state_conflict'" class="warn-note" role="alert">{{ i18n.t('manage.busy') }}</div>
    <div v-else-if="err" class="load-error" role="alert">
      <span>{{ String(err?.detail || err?.message || err) }}</span>
      <button class="btn ghost sm" @click="refresh">{{ i18n.t('common.retry') }}</button>
    </div>

    <section class="setting-row">
      <h4>{{ i18n.t('manage.tags') }}</h4>
      <div class="tags-editor">
        <span v-for="t in tags" :key="t" class="tag-chip">{{ t }}
          <button :aria-label="i18n.t('common.remove')" :disabled="busy" @click="removeTag(t)">×</button>
        </span>
        <input v-model="tagInput" class="input tag-input" type="text"
          :placeholder="i18n.t('manage.tagPlaceholder')" :disabled="busy"
          @keydown.enter.prevent="addTag" />
      </div>
    </section>

    <section class="setting-row">
      <h4>{{ i18n.t('manage.session') }}</h4>
      <div class="btn-col">
        <button class="btn ghost" :disabled="busy" @click="renameOpen = true; renameText = snapshot?.name || ''">
          {{ i18n.t('manage.rename') }}
        </button>
        <button class="btn ghost" :disabled="busy" @click="confirming = { kind: 'compact', run: () => api.sessionCompact(chat.sessionId.value!) }">
          {{ i18n.t('manage.compact') }}
        </button>
        <button class="btn ghost" :disabled="busy" @click="confirming = { kind: 'interrupt', run: () => api.sessionInterrupt(chat.sessionId.value!) }">
          {{ i18n.t('manage.interrupt') }}
        </button>
        <button class="btn ghost" :disabled="busy" @click="pruneOpen = true">{{ i18n.t('manage.prune') }}</button>
      </div>
    </section>

    <section class="setting-row danger">
      <h4>{{ i18n.t('manage.danger') }}</h4>
      <button class="btn danger" :disabled="busy"
        @click="confirming = { kind: 'delete', run: doDelete }">{{ i18n.t('manage.delete') }}</button>
      <p class="hint">{{ i18n.t('manage.deleteDesc') }}</p>
    </section>

    <Modal :open="renameOpen" :title="i18n.t('manage.rename')" :dismissable="!busy" @close="renameOpen = false">
      <input v-model="renameText" class="input" type="text" :aria-label="i18n.t('manage.rename')" />
      <template #footer>
        <button class="btn ghost" :disabled="busy" @click="renameOpen = false">{{ i18n.t('manage.cancel') }}</button>
        <button class="btn primary" :disabled="busy || !renameText.trim()" @click="doRename">{{ i18n.t('common.save') }}</button>
      </template>
    </Modal>

    <Modal :open="!!confirming" :title="i18n.t(`manage.${confirming?.kind ?? 'compact'}`)" :dismissable="!busy" @close="confirming = null">
      <p v-if="confirming?.kind === 'delete'">{{ i18n.t('manage.deleteConfirm') }}</p>
      <p v-else>{{ i18n.t('manage.confirmBody') }}</p>
      <div v-if="confirmErr" class="load-error" role="alert">{{ confirmErr }}</div>
      <template #footer>
        <button class="btn ghost" :disabled="busy" @click="confirming = null">{{ i18n.t('manage.cancel') }}</button>
        <button class="btn danger" :disabled="busy" @click="runConfirmed(confirming.run)">
          {{ busy ? i18n.t('sessions.loading') : i18n.t('manage.confirmYes') }}
        </button>
      </template>
    </Modal>

    <PruneDialog :open="pruneOpen" :session-id="chat.sessionId.value!" @close="pruneOpen = false" @done="refresh" />
  </Sheet>
</template>

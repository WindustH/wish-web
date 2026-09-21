<script setup lang="ts">
// Session management window: tags (metadata JSON — other keys ride along untouched),
// rename, context clearing, forking and deletion with centered
// confirm modals (busy locks all dismiss paths; failures keep the modal).
import { computed, onMounted, onUnmounted, ref, watch } from 'vue';
import { useRouter } from 'vue-router';
import * as api from '../../core/api/endpoints.js';
import { chat } from '../../core/state/chatSlice.js';
import { sessions } from '../../core/state/sessionsSlice.js';
import { i18n } from '../../core/i18n/index.js';
import AskContext from './AskContext.vue';
import Modal from '../../ui/components/Modal.vue';
import { useMedia } from '../../ui/composables/useMedia.js';

defineEmits<{ close: [] }>();
const router = useRouter();
const isMobile = useMedia('(max-width: 899px)');

const snapshot = computed(() => chat.snapshot.value);
const err = ref<any>(null);
const busy = ref(false);
const confirming = ref<any>(null);
const confirmErr = ref<string | null>(null);
const renameText = ref('');
const tagInput = ref('');
let epoch = 0;
onUnmounted(() => { epoch++; });
const owns = (id: string | null, gen: number) => gen === epoch && chat.sessionId.value === id;

// Every async write captures the session it belongs to; late responses are
// only applied while that session is STILL open (switch/close ownership).
async function refresh(target = chat.sessionId.value) {
  if (!target) return;
  const gen = epoch;
  try {
    const snap = await api.sessionGet(target);
    if (owns(target, gen) && (chat.snapshot.value?.revision ?? 0) <= snap.revision) chat.snapshot.value = snap;
  } catch (e) {
    if (owns(target, gen)) err.value = e;
  }
}
onMounted(refresh);

const tags = computed(() => Array.isArray(snapshot.value?.metadata?.tags) ? snapshot.value.metadata.tags : []);

// ONE pending flag, ONE error surface per interaction kind; success closes
// exactly the surface it belongs to; failures stay visible and keep inputs.
async function run(action: () => Promise<unknown>) {
  const target = chat.sessionId.value;
  const gen = epoch;
  busy.value = true;
  try {
    await action();
    if (owns(target, gen)) err.value = null;
    return true;
  } catch (e: any) {
    if (!owns(target, gen)) return false;
    // busy 409: never auto-interrupt. revision 409: concurrent edit — refresh.
    if (e?.code === 'state_conflict') err.value = { code: 'state_conflict' };
    else err.value = e;
    return false;
  } finally {
    if (owns(target, gen)) { busy.value = false; await refresh(target); }
  }
}

async function runConfirm() {
  const kind = confirming.value?.kind as 'rename' | 'compact' | 'interrupt' | 'delete' | 'clear' | 'fork' | undefined;
  if (!kind) return;
  const target = chat.sessionId.value;
  const gen = epoch;
  busy.value = true;
  confirmErr.value = null;
  try {
    if (kind === 'rename') await sessions.rename(target!, renameText.value.trim());
    else if (kind === 'compact') await api.sessionCompact(target!);
    else if (kind === 'interrupt') await api.sessionInterrupt(target!);
    else if (kind === 'clear') { await api.sessionClearContext(target!); await chat.reload(); }
    else if (kind === 'fork') { const copy=await api.sessionFork(target!); await router.push('/s/'+copy.id); }
    else if (kind === 'delete') await performDelete(target!);
    if (owns(target, gen)) confirming.value = null;
  } catch (e: any) {
    if (owns(target, gen)) confirmErr.value = String(e?.detail || e?.message || e);
  } finally {
    if (owns(target, gen)) {
      busy.value = false;
      if (kind !== 'delete') await refresh(target);
    }
  }
}

// All writes go through the slice EXACTLY ONCE: it performs the PATCH with
// If-Match and refreshes the local row on success; failures propagate (no
// optimistic local update that the server never accepted — audit A2).
const metaRow = () => ({
  id: chat.sessionId.value!,
  revision: snapshot.value?.revision,
  metadata: snapshot.value?.metadata,
});

async function addTag() {
  const t = tagInput.value.trim();
  if (!t) return;
  if (tags.value.includes(t)) { tagInput.value = ''; return; }
  if (tags.value.length >= 16) return;
  const next = [...tags.value, t];
  const target = chat.sessionId.value;
  const succeeded = await run(() => sessions.updateMeta(metaRow(), { tags: next }));
  if (succeeded && chat.sessionId.value === target && tagInput.value.trim() === t) tagInput.value = '';
}

async function removeTag(t: string) {
  const next = tags.value.filter((x: string) => x !== t);
  await run(() => sessions.updateMeta(metaRow(), { tags: next }));
}

// Delete leaves on success — never refresh a snapshot that no longer exists.
async function performDelete(target: string) {
  await api.sessionDelete(target);
  sessions.dropRow(target);
  if (chat.sessionId.value === target) {
    chat.close();
    await router.push('/sessions');
  }
}

// Component reuse across sessions: reset transient state, re-belong refresh.
watch(() => chat.sessionId.value, () => {
  epoch++;
  busy.value = false;
  err.value = null;
  confirmErr.value = null;
  confirming.value = null;
  tagInput.value = '';
  refresh();
});
</script>

<template>
  <Modal :open="true" content-class="session-window session-manage-window" :dismissable="!busy && !confirming" :title="i18n.t('manage.title')" :page="isMobile" @close="$emit('close')">
    <div v-if="err?.code === 'state_conflict'" class="warn-note" role="alert">{{ i18n.t('manage.busy') }}</div>
    <div v-else-if="err" class="load-error" role="alert">
      <span>{{ String(err?.detail || err?.message || err) }}</span>
      <button class="btn ghost sm" @click="refresh()">{{ i18n.t('common.retry') }}</button>
    </div>

    <AskContext v-if="chat.sessionId.value" :key="chat.sessionId.value" :session-id="chat.sessionId.value"/>
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
        <button class="btn ghost" :disabled="busy" @click="renameText = snapshot?.name || ''; confirming = { kind: 'rename' }">
          {{ i18n.t('manage.rename') }}
        </button>
        <button class="btn ghost" :disabled="busy" @click="confirming = { kind: 'compact' }">
          {{ i18n.t('manage.compact') }}
        </button>
        <button class="btn ghost" :disabled="busy" @click="confirming = { kind: 'interrupt' }">
          {{ i18n.t('manage.interrupt') }}
        </button>
        <button class="btn ghost" :disabled="busy || snapshot?.running" @click="confirming = { kind: 'clear' }">{{ i18n.locale.value==='zh'?'清空当前上下文（保留历史）':'Clear context (keep history)' }}</button>
        <button class="btn ghost" :disabled="busy || snapshot?.running" @click="confirming = { kind: 'fork' }">{{ i18n.locale.value==='zh'?'复制当前上下文为新会话':'Fork current context' }}</button>
      </div>
    </section>

    <section class="setting-row danger">
      <h4>{{ i18n.t('manage.danger') }}</h4>
      <button class="btn danger" :disabled="busy"
        @click="confirming = { kind: 'delete' }">{{ i18n.t('manage.delete') }}</button>
      <p class="hint">{{ i18n.t('manage.deleteDesc') }}</p>
    </section>

    <Modal :open="!!confirming" compact :title="['clear','fork'].includes(confirming?.kind)?(i18n.locale.value==='zh'?'确认操作':'Confirm'):i18n.t(`manage.${confirming?.kind ?? 'rename'}`)" :dismissable="!busy" @close="confirming = null">
      <p v-if="confirming?.kind === 'delete'">{{ i18n.t('manage.deleteConfirm') }}</p>
      <p v-else-if="confirming?.kind !== 'rename'">{{ i18n.t('manage.confirmBody') }}</p>
      <input v-if="confirming?.kind === 'rename'" v-model="renameText" class="input" type="text"
        :aria-label="i18n.t('manage.rename')" :disabled="busy" />
      <div v-if="confirmErr" class="load-error" role="alert">{{ confirmErr }}</div>
      <template #footer>
        <button class="btn ghost" :disabled="busy" @click="confirming = null">{{ i18n.t('manage.cancel') }}</button>
        <button class="btn" :class="confirming?.kind === 'rename' ? 'primary' : 'danger'" :disabled="busy || (confirming?.kind === 'rename' && !renameText.trim())" @click="runConfirm">
          {{ busy ? i18n.t('sessions.loading') : i18n.t(confirming?.kind === 'rename' ? 'common.save' : 'manage.confirmYes') }}
        </button>
      </template>
    </Modal>


  </Modal>
</template>

<style scoped>
.setting-row { flex-direction: column; align-items: stretch; gap: var(--space-s); padding: var(--space-l) 0; }
.setting-row h4 { margin: 0; font-size: 14px; }
.tags-editor { min-width: 0; }
.tag-input { min-width: 0; max-width: 100%; }
</style>

<script setup lang="ts">
// The dialog is owned by the list, outside recycled virtual rows. Its target
// never follows the currently open chat; writes belong to the captured ID.
import { computed, onMounted, ref } from 'vue';
import { useRouter } from 'vue-router';
import * as api from '../../core/api/endpoints.js';
import { sessions } from '../../core/state/sessionsSlice.js';
import { chat } from '../../core/state/chatSlice.js';
import { i18n } from '../../core/i18n/index.js';
import Modal from '../../ui/components/Modal.vue';
import Icon from '../../ui/components/Icon.vue';
const props = defineProps<{ target: { id: string; name?: string }; kind: 'rename' | 'tags' | 'delete' }>();
const emit = defineEmits<{ close: [] }>();
const router = useRouter();
const snapshot = ref<any>();
const name = ref(props.target.name || '');
const tags = ref<string[]>([]);
const tagInput = ref('');
const busy = ref(false);
const loading = ref(props.kind === 'tags');
const error = ref('');
const draftTags = computed(() => [...new Set([...tags.value, ...(tagInput.value.trim() ? [tagInput.value.trim()] : [])])]);
const changed = computed(() => props.kind === 'rename' ? name.value.trim() !== (props.target.name || '')
  : props.kind === 'tags' ? JSON.stringify(draftTags.value) !== JSON.stringify(snapshot.value?.metadata?.tags ?? []) : true);
const canSave = computed(() => !busy.value && !loading.value && changed.value && (props.kind !== 'rename' || !!name.value.trim())
  && (props.kind !== 'tags' || (!!snapshot.value && draftTags.value.length <= 16 && draftTags.value.every(tag => [...tag].length <= 64))));
function addTag() {
  if (draftTags.value.length > 16 || draftTags.value.some(tag => [...tag].length > 64)) return;
  tags.value = draftTags.value;
  tagInput.value = '';
}
async function loadTags() {
  loading.value = true;
  error.value = '';
  try {
    snapshot.value = await api.sessionGet(props.target.id);
    tags.value = Array.isArray(snapshot.value.metadata?.tags) ? [...snapshot.value.metadata.tags] : [];
  } catch (e: any) { error.value = String(e?.detail || e?.message || e); }
  finally { loading.value = false; }
}
onMounted(() => { if (props.kind === 'tags') loadTags(); });
async function save() {
  if (!canSave.value) return;
  const id = props.target.id;
  busy.value = true;
  error.value = '';
  try {
    if (props.kind === 'delete') {
      await api.sessionDelete(id);
      sessions.dropRow(id);
      if (chat.sessionId.value === id) { chat.close(); await router.push('/sessions'); }
    } else {
      const snap = props.kind === 'rename' ? await sessions.rename(id, name.value.trim())
        : await sessions.updateMeta(snapshot.value, { tags: draftTags.value });
      if (chat.sessionId.value === id && (chat.snapshot.value?.revision ?? 0) <= snap.revision) chat.snapshot.value = snap;
    }
    emit('close');
  } catch (e: any) { error.value = String(e?.detail || e?.message || e); }
  finally { busy.value = false; }
}
</script>

<template>
  <Modal :open="true" :title="i18n.t(`manage.${kind}`)" :dismissable="!busy" @close="emit('close')">
    <form id="session-list-action" @submit.prevent="save">
      <p class="sl-action-name">{{ target.name || target.id.slice(0, 8) }}</p>
      <input v-if="kind === 'rename'" v-model="name" class="input" :aria-label="i18n.t('manage.rename')" :disabled="busy" />
      <p v-else-if="kind === 'delete'">{{ i18n.t('manage.deleteConfirm') }}</p>
      <template v-else>
        <p v-if="loading" role="status">{{ i18n.t('sessions.loading') }}</p>
        <div v-else-if="snapshot" class="sl-tag-editor">
          <div v-if="tags.length" class="sl-tag-chips"><span v-for="tag in tags" :key="tag" class="tag-chip">{{ tag }}<button type="button" :disabled="busy" :aria-label="`${i18n.t('common.remove')} ${tag}`" @click="tags = tags.filter(t => t !== tag)"><Icon name="x" /></button></span></div>
          <input v-model="tagInput" class="input" :disabled="busy || tags.length >= 16" :placeholder="i18n.t('manage.tagPlaceholder')" :aria-label="i18n.t('manage.tags')" @keydown.enter="event => { if (!event.isComposing) { event.preventDefault(); addTag(); } }" />
          <span class="hint">{{ i18n.t('manage.tagsHint') }} · {{ draftTags.length }} / 16</span>
        </div>
      </template>
      <div v-if="error" class="load-error" role="alert">{{ error }}</div>
      <button v-if="kind === 'tags' && error" type="button" class="btn ghost sm" :disabled="busy || loading" @click="loadTags">{{ i18n.t('info.refresh') }}</button>
    </form>
    <template #footer>
      <button class="btn ghost" :disabled="busy" @click="emit('close')">{{ i18n.t('manage.cancel') }}</button>
      <button form="session-list-action" type="submit" class="btn" :class="kind === 'delete' ? 'danger' : 'primary'" :disabled="!canSave">{{ busy ? i18n.t('sessions.loading') : i18n.t(kind === 'delete' ? 'manage.delete' : 'common.save') }}</button>
    </template>
  </Modal>
</template>

<style scoped>
.sl-action-name { margin: 0 0 16px; color: var(--fg-subtle); overflow-wrap: anywhere; }
.sl-tag-editor { display: flex; flex-direction: column; gap: 10px; }
.sl-tag-chips { display: flex; flex-wrap: wrap; gap: 6px; margin-bottom: 4px; }
.sl-tag-editor .hint { font-size: 12px; line-height: 1.5; }
.sl-tag-editor .tag-chip { max-width: 100%; overflow-wrap: anywhere; }
.sl-tag-editor .input { width: 100%; }
</style>

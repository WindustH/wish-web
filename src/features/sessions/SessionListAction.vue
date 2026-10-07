<script setup lang="ts">
// The dialog is owned by the list, outside recycled virtual rows. Its target
// never follows the currently open chat; writes belong to the captured ID.
import { errorDetail } from '../../core/errors.ts';
import { computed, onMounted, ref } from 'vue';
import { useRouter } from 'vue-router';
import * as api from '../../core/api/endpoints.ts';
import { sessions, sessionTitle, type ListRow } from '../../core/state/sessionsSlice.ts';
import { chat } from '../../core/state/chatSlice.ts';
import { i18n } from '../../core/i18n/index.ts';
import { tr } from '../../core/i18n/tr.ts';
import Modal from '../../ui/components/Modal.vue';
import Icon from '../../ui/components/Icon.vue';
import { deleteSession } from './sessionActions.ts';
/** A row the dialog acts on: a session, or a group or folder, which can only be renamed or deleted. */
export interface ActionTarget { id: string; name?: string; kind: ListRow['kind'] }
const props = defineProps<{ target: ActionTarget; kind: 'rename' | 'tags' | 'delete' }>();
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
  } catch (e: any) { error.value = errorDetail(e); }
  finally { loading.value = false; }
}
onMounted(() => { if (props.kind === 'tags') loadTags(); });
async function save() {
  if (!canSave.value) return;
  const id = props.target.id;
  busy.value = true;
  error.value = '';
  try {
    if (props.target.kind === 'folder') {
      if (props.kind === 'delete') await sessions.deleteFolder(id);
      else await sessions.renameFolder(id, name.value.trim());
    } else if (props.target.kind === 'group') {
      if (props.kind === 'delete') {
        const open = router.currentRoute.value.name === 'group' && router.currentRoute.value.params.id === id;
        await sessions.deleteGroup(id);
        if (open) await router.push('/sessions');
      } else await sessions.renameGroup(id, name.value.trim());
    } else if (props.kind === 'delete') {
      const open = chat.sessionId.value === id;
      await deleteSession(id);
      if (open) await router.push('/sessions');
    } else {
      const snap = props.kind === 'rename' ? await sessions.rename(id, name.value.trim())
        : await sessions.updateMeta(snapshot.value, { tags: draftTags.value });
      chat.adoptSnapshot(id, snap);
    }
    emit('close');
  } catch (e: any) { error.value = errorDetail(e); }
  finally { busy.value = false; }
}
</script>

<template>
  <Modal :open="true" compact :title="i18n.t(`manage.${kind}`)" :dismissable="!busy" @close="emit('close')">
    <form id="session-list-action" @submit.prevent="save">
      <p class="sl-action-name">{{ sessionTitle(target) }}</p>
      <input v-if="kind === 'rename'" v-model="name" class="input" :aria-label="i18n.t('manage.rename')" :disabled="busy" />
      <p v-else-if="kind === 'delete' && target.kind === 'folder'">{{ tr('删除这个文件夹？里面的会话、群组和文件夹会移到上一级，不会被删除。', 'Delete this folder? What it holds moves up a level; nothing in it is deleted.') }}</p>
      <p v-else-if="kind === 'delete'">{{ i18n.t('manage.deleteConfirm') }}<br v-if="target.kind === 'group'" />{{ target.kind === 'group' ? tr('群聊记录和发到群里的文件会一起删除，成员会话保留。', 'Its messages and the files posted to it go too; its member sessions stay.') : '' }}</p>
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
      <button form="session-list-action" type="submit" class="btn" :class="kind === 'delete' ? 'danger solid' : 'primary'" :disabled="!canSave">{{ busy ? i18n.t('sessions.loading') : i18n.t(kind === 'delete' ? 'sessions.delete' : 'common.save') }}</button>
    </template>
  </Modal>
</template>

<style scoped>
.sl-action-name { margin: 0 0 4px; color: var(--fg-subtle); overflow-wrap: anywhere; }
form > p { margin: 0 0 4px; }
form > :last-child { margin-bottom: 0; }
.sl-tag-editor { display: flex; flex-direction: column; gap: 10px; }
.sl-tag-chips { display: flex; flex-wrap: wrap; gap: 6px; margin-bottom: 4px; }
.sl-tag-editor .hint { font-size: 12px; line-height: 1.5; }
.sl-tag-editor .tag-chip { max-width: 100%; overflow-wrap: anywhere; }
.sl-tag-editor .input { width: 100%; }
</style>

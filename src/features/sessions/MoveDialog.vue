<script setup lang="ts">
// Moving sessions, groups and folders: choosing a folder, or the root, from the tree of folders.
// A folder being moved, and what is inside it, cannot be chosen: nothing goes into itself.
import { computed, onMounted, ref } from 'vue';
import * as api from '../../core/api/endpoints.ts';
import type { FolderView } from '../../core/api/endpoints.ts';
import { errorDetail } from '../../core/errors.ts';
import { tr } from '../../core/i18n/tr.ts';
import { sessions } from '../../core/state/sessionsSlice.ts';
import Icon from '../../ui/components/Icon.vue';
import Modal from '../../ui/components/Modal.vue';
import Spinner from '../../ui/components/Spinner.vue';
import { useIsMobile } from '../../ui/composables/useMedia.ts';

const props = defineProps<{ ids: string[]; title: string; from: string | null }>();
const emit = defineEmits<{ close: []; moved: [] }>();
const isMobile = useIsMobile();
const folders = ref<FolderView[] | null>(null);
const chosen = ref<string | null>(props.from);
const busy = ref(false);
const failed = ref('');
onMounted(async () => {
  try { folders.value = await api.foldersList(); } catch (error) { failed.value = errorDetail(error); }
});
// The folders as a tree, in name order, each once at its depth; what is moved, and below it, left out.
const choices = computed(() => {
  const children = new Map<string | null, FolderView[]>();
  for (const folder of folders.value ?? []) children.set(folder.parent, [...children.get(folder.parent) ?? [], folder]);
  const moving = new Set(props.ids);
  const out: { folder: FolderView; depth: number }[] = [];
  const walk = (parent: string | null, depth: number) => {
    for (const folder of children.get(parent) ?? []) {
      if (moving.has(folder.id)) continue;
      out.push({ folder, depth });
      walk(folder.id, depth + 1);
    }
  };
  walk(null, 1);
  return out;
});
async function move() {
  busy.value = true;
  failed.value = '';
  try {
    await sessions.move(props.ids, chosen.value);
    emit('moved');
  } catch (error) {
    failed.value = errorDetail(error);
  } finally {
    busy.value = false;
  }
}
</script>

<template>
  <Modal compact :page="isMobile" :open="true" :dismissable="!busy" :title="title" @close="emit('close')">
    <div class="move-dialog">
      <div class="move-tree" role="radiogroup" :aria-label="tr('目标文件夹', 'Destination folder')">
        <button type="button" class="move-choice" role="radio" :aria-checked="chosen === null" @click="chosen = null">
          <Icon name="house" /><span>{{ tr('根目录', 'Top level') }}</span><Icon v-if="chosen === null" name="check" class="move-check" />
        </button>
        <p v-if="!folders && !failed" class="move-state"><Spinner /></p>
        <button v-for="{ folder, depth } in choices" :key="folder.id" type="button" class="move-choice" role="radio" :aria-checked="chosen === folder.id"
          :style="{ '--move-depth': depth }" @click="chosen = folder.id">
          <Icon name="folder" /><span>{{ folder.name }}</span><Icon v-if="chosen === folder.id" name="check" class="move-check" />
        </button>
      </div>
      <p v-if="failed" class="move-error" role="alert">{{ failed }}</p>
    </div>
    <template #footer>
      <button class="btn ghost" :disabled="busy" @click="emit('close')">{{ tr('取消', 'Cancel') }}</button>
      <button class="btn primary" :disabled="busy || chosen === from" @click="move"><Icon v-if="busy" name="loader-circle" class="spin" />{{ tr('移动', 'Move') }}</button>
    </template>
  </Modal>
</template>

<style scoped>
.move-dialog { display: grid; gap: 10px; }
.move-tree { display: grid; max-height: min(52dvh, 420px); overflow: auto; border: 1px solid var(--line); border-radius: 10px; background: var(--bg-raised); }
/* The root stands first, and each folder in from the one it is in, as in a file tree. */
.move-choice { display: flex; align-items: center; gap: 10px; min-height: 40px; padding: 0 12px 0 calc(12px + var(--move-depth, 0) * 18px); border: 0; background: none; color: var(--fg); font: inherit; font-size: 13.5px; text-align: left; cursor: pointer; }
.move-choice + .move-choice { border-top: 1px solid var(--line); }
@media (hover: hover) { .move-choice:hover { background: var(--bg-hover); } }
.move-choice[aria-checked='true'] { background: color-mix(in srgb, var(--accent) 10%, transparent); }
.move-choice .icon { flex: none; width: 16px; height: 16px; color: var(--fg-muted); }
.move-choice span { flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.move-choice .move-check { color: var(--accent); }
.move-state { display: flex; justify-content: center; margin: 0; padding: 14px; }
.move-error { margin: 0; color: var(--danger); font-size: 12.5px; }
@media (max-width: 899px) { .move-tree { max-height: none; } }
</style>

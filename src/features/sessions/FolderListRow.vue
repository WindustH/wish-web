<script setup lang="ts">
// A folder in the list: opening it shows what it holds in place of the list, as a file manager
// opens a directory. It says how much it holds, and its menu pins, moves, renames or deletes it.
import { computed } from 'vue';
import FadeText from '../../ui/components/FadeText.vue';
import Icon from '../../ui/components/Icon.vue';
import Menu, { type MenuItem } from '../../ui/components/Menu.vue';
import { i18n } from '../../core/i18n/index.ts';
import { tr } from '../../core/i18n/tr.ts';
import { useMedia } from '../../ui/composables/useMedia.ts';
import type { FolderRow } from '../../core/state/sessionsSlice.ts';

export type FolderAction = 'pin' | 'unpin' | 'move' | 'rename' | 'delete';
const props = defineProps<{ row: FolderRow; selecting?: boolean }>();
const emit = defineEmits<{ open: []; action: [kind: FolderAction] }>();
const withButton = useMedia('(hover: hover) and (pointer: fine) and (min-width: 900px)');
const actions = computed<MenuItem[]>(() => [
  props.row.pinned ? { key: 'unpin', icon: 'pin', label: tr('取消置顶', 'Unpin') } : { key: 'pin', icon: 'pin', label: tr('置顶', 'Pin') },
  { key: 'move', icon: 'folder', label: tr('移动到…', 'Move to…') },
  { key: 'rename', icon: 'pencil', label: i18n.t('manage.rename'), separator: true },
  { key: 'delete', icon: 'trash-2', label: tr('删除文件夹', 'Delete folder'), danger: true, separator: true },
]);
const act = (key: string) => emit('action', key as FolderAction);
</script>

<template>
  <Menu context :disabled="selecting" :items="actions" @select="act">
  <div class="sl-item sl-folder" :data-folder-id="row.id">
    <button type="button" class="sl-row" @click="emit('open')">
      <Icon name="folder" class="sl-folder-icon" />
      <span class="sl-main">
        <FadeText class="sl-name" :text="row.name" />
        <Icon v-if="row.pinned" name="pin" class="sl-pin" :aria-label="tr('已置顶', 'Pinned')" />
      </span>
      <span v-if="row.items" class="sl-count" :aria-label="tr(`${row.items} 项`, `${row.items} items`)">{{ row.items }}</span>
      <Icon name="chevron-right" class="sl-enter" />
    </button>
    <Menu v-if="withButton && !selecting" :items="actions" @select="act">
      <template #trigger><button type="button" class="sl-menu-trigger" :aria-label="`${i18n.t('manage.title')} · ${row.name}`"><Icon name="ellipsis-vertical" /></button></template>
    </Menu>
  </div>
  </Menu>
</template>

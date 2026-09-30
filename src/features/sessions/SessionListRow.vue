<script setup lang="ts">
import FadeText from '../../ui/components/FadeText.vue';
import Hint from '../../ui/components/Hint.vue';
import { computed } from 'vue';
import { RouterLink } from 'vue-router';
import Icon from '../../ui/components/Icon.vue';
import Menu, { type MenuItem } from '../../ui/components/Menu.vue';
import { i18n } from '../../core/i18n/index.ts';
import { tr } from '../../core/i18n/tr.ts';
import { relTime } from '../../core/util/fmt.ts';
import { useMedia } from '../../ui/composables/useMedia.ts';
import { sessionTitle } from '../../core/state/sessionsSlice.ts';
export type RowAction = 'rename' | 'tags' | 'prune' | 'select' | 'delete';
// A list that can choose several (`selectable`) offers it in the menu; while it is choosing, a row
// is a box to tick instead of a link, and has no menu.
const props = defineProps<{ row: any; active: boolean; index: number; selectable?: boolean; selecting?: boolean; chosen?: boolean }>();
const emit = defineEmits<{ action: [kind: RowAction]; toggle: [] }>();
const name = computed(() => sessionTitle(props.row));
const tags = computed<string[]>(() => Array.isArray(props.row.metadata?.tags) ? props.row.metadata.tags : []);
// The menu opens with a right click, or a long press on a touch screen. Only with a mouse is there
// also a button, shown on hover.
const withButton = useMedia('(hover: hover) and (pointer: fine) and (min-width: 900px)');
const actions = computed<MenuItem[]>(() => [
  { key: 'rename', icon: 'pencil', label: i18n.t('manage.rename') },
  { key: 'tags', icon: 'tag', label: i18n.t('sessions.editTags') },
  { key: 'prune', icon: 'eraser', label: tr('清理历史', 'Clear history') },
  ...(props.selectable ? [{ key: 'select', icon: 'check-square', label: tr('多选', 'Select several'), separator: true }] : []),
  { key: 'delete', icon: 'trash-2', label: i18n.t('sessions.delete'), danger: true, separator: true },
]);
const act = (key: string) => emit('action', key as RowAction);
const link = computed(() => props.selecting ? 'button' : RouterLink);
const linkAttrs = computed(() => props.selecting
  ? { type: 'button', 'aria-pressed': !!props.chosen }
  : { to: `/s/${props.row.id}`, 'aria-current': props.active ? 'page' : undefined });
</script>
<template>
  <Menu context :disabled="selecting" :items="actions" @select="act">
  <div class="sl-item" :class="{ active: active && !selecting, chosen }" :data-session-id="row.id">
    <Hint :text="`${name} · ${relTime(row.updated_at, i18n.t)}`"><component :is="link" v-bind="linkAttrs" class="sl-row" :data-testid="`sl-row-${index}`" @click="selecting && emit('toggle')">
      <span v-if="selecting" class="sl-check" aria-hidden="true"><Icon v-if="chosen" name="check" /></span>
      <Hint v-else :text="i18n.t(`phase.${row.phase}`)"><span class="sl-status phase-dot" :class="row.phase" :aria-label="i18n.t(`phase.${row.phase}`)" /></Hint>
      <span class="sl-main">
        <FadeText class="sl-name" :text="name" />
        <span v-for="tag in tags" :key="tag" class="sl-tag">{{ tag }}</span>
      </span>
    </component></Hint>
    <Menu v-if="withButton && !selecting" :items="actions" @select="act">
      <template #trigger><button type="button" class="sl-menu-trigger" :aria-label="`${i18n.t('manage.title')} · ${name}`"><Icon name="ellipsis-vertical" /></button></template>
    </Menu>
  </div>
  </Menu>
</template>

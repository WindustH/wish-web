<script setup lang="ts">
import { sessionNaming } from '../../core/state/sessionNaming.ts';
import Spinner from '../../ui/components/Spinner.vue';
import FadeText from '../../ui/components/FadeText.vue';
import Hint from '../../ui/components/Hint.vue';
import { computed } from 'vue';
import { RouterLink } from 'vue-router';
import Icon from '../../ui/components/Icon.vue';
import Menu from '../../ui/components/Menu.vue';
import type { MenuItem } from '../../ui/components/menuTypes.ts';
import { i18n } from '../../core/i18n/index.ts';
import { tr } from '../../core/i18n/tr.ts';
import { relTime } from '../../core/util/fmt.ts';
import { useMedia } from '../../ui/composables/useMedia.ts';
import { sessionTitle, type SessionRow } from '../../core/state/sessionsSlice.ts';
export type RowAction = 'generate-name' | 'rename' | 'tags' | 'prune' | 'select' | 'pin' | 'unpin' | 'move' | 'delete';
// A list that can choose several (`selectable`) offers it in a row's menu; while it is choosing,
// every row is a box to tick instead of a link, and has no menu. A list arranged in folders
// (`arranged`) lets a row be pinned and moved; where no heading says a row is pinned, as among
// search results, a pin marks it (`pinMark`). A group can only be renamed, pinned, moved or deleted.
const props = defineProps<{
  row: SessionRow;
  active: boolean;
  index: number;
  arranged?: boolean;
  pinMark?: boolean;
  selectable?: boolean;
  selecting?: boolean;
  chosen?: boolean;
}>();
const emit = defineEmits<{ action: [kind: RowAction]; toggle: []; activate: [event: MouseEvent] }>();
const name = computed(() => sessionTitle(props.row));
const tags = computed<string[]>(() =>
  props.row.kind === 'session' && Array.isArray(props.row.metadata?.tags) ? props.row.metadata.tags : [],
);
// The menu opens with a right click, or a long press on a touch screen. Only with a mouse is there
// also a button, shown on hover.
const withButton = useMedia('(min-width: 900px), (pointer: coarse)');
const actions = computed<MenuItem[]>(() => [
  ...(props.arranged
    ? [
        props.row.pinned
          ? { key: 'unpin', icon: 'pin', label: tr('取消置顶', 'Unpin') }
          : { key: 'pin', icon: 'pin', label: tr('置顶', 'Pin') },
        { key: 'move', icon: 'folder', label: tr('移动到…', 'Move to…') },
      ]
    : []),
  { key: 'rename', icon: 'pencil', label: i18n.t('manage.rename'), separator: props.arranged },
  { key: 'generate-name', icon: 'sparkles', label: tr('自动重命名', 'Auto rename') },
  { key: 'tags', icon: 'tag', label: i18n.t('sessions.editTags') },
  { key: 'prune', icon: 'eraser', label: tr('清理历史', 'Clear history') },
  ...(props.selectable
    ? [{ key: 'select', icon: 'check-square', label: tr('多选', 'Select several'), separator: true }]
    : []),
  { key: 'delete', icon: 'trash-2', label: i18n.t('sessions.delete'), danger: true, separator: true },
]);
function activate(event: MouseEvent) {
  if (props.selectable && event.target instanceof Element && event.target.closest('.sl-row')) emit('activate', event);
}
const act = (key: string) => emit('action', key as RowAction);
const link = computed(() => (props.selecting ? 'button' : RouterLink));
const linkAttrs = computed(() =>
  props.selecting
    ? { type: 'button', 'aria-pressed': !!props.chosen }
    : // In a list arranged in folders the whole row is dragged, not its link.
      {
        to: `/s/${props.row.id}`,
        'aria-current': props.active ? 'page' : undefined,
        draggable: props.arranged ? 'false' : undefined,
      },
);
</script>
<template>
  <Menu context :disabled="selecting" :items="actions" @select="act">
    <div
      class="sl-item"
      :class="{ active: active && !selecting, chosen }"
      :data-session-id="row.id"
      @click.capture="activate"
    >
      <Hint :text="`${name} · ${relTime(row.updated_at, i18n.t)}`"
        ><component
          :is="link"
          v-bind="linkAttrs"
          class="sl-row"
          :data-testid="`sl-row-${index}`"
          @click="selecting && !$event.defaultPrevented && emit('toggle')"
        >
          <span v-if="selecting" class="sl-check" aria-hidden="true"><Icon v-if="chosen" name="check" /></span>
          <Spinner v-else-if="sessionNaming.pending.value.has(row.id)" />
          <Hint v-else :text="i18n.t(`phase.${row.phase}`)"
            ><span class="sl-status phase-dot" :class="row.phase" :aria-label="i18n.t(`phase.${row.phase}`)"
          /></Hint>
          <span class="sl-main">
            <FadeText class="sl-name" :text="name" />
            <Icon v-if="pinMark && row.pinned" name="pin" class="sl-pin" :aria-label="tr('已置顶', 'Pinned')" />
            <span v-for="tag in tags" :key="tag" class="sl-tag">{{ tag }}</span>
          </span>
        </component></Hint
      >
      <Menu v-if="withButton && !selecting" :items="actions" @select="act">
        <template #trigger
          ><button type="button" class="sl-menu-trigger" :aria-label="`${i18n.t('manage.title')} · ${name}`">
            <Icon name="ellipsis-vertical" /></button
        ></template>
      </Menu>
    </div>
  </Menu>
</template>

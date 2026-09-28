<script setup lang="ts">
import FadeText from '../../ui/components/FadeText.vue';
import Hint from '../../ui/components/Hint.vue';
import { computed } from 'vue';
import {
  DropdownMenuRoot, DropdownMenuTrigger, DropdownMenuPortal, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator,
  ContextMenuRoot, ContextMenuTrigger, ContextMenuPortal, ContextMenuContent, ContextMenuItem, ContextMenuSeparator,
} from 'reka-ui';
import Icon from '../../ui/components/Icon.vue';
import { i18n } from '../../core/i18n/index.ts';
import { relTime } from '../../core/util/fmt.ts';
import { useMedia } from '../../ui/composables/useMedia.ts';
import { usePageActivity } from '../../ui/composables/usePageActivity.ts';
const props = defineProps<{ row: any; active: boolean; index: number }>();
const emit = defineEmits<{ action: [kind: 'rename' | 'tags' | 'delete'] }>();
const pageActive = usePageActivity();
const name = computed(() => props.row.name || props.row.id.slice(0, 8));
const tags = computed<string[]>(() => Array.isArray(props.row.metadata?.tags) ? props.row.metadata.tags : []);
// The menu opens with a right click, or a long press on a touch screen. Only with a mouse is there
// also a button, shown on hover.
const withButton = useMedia('(hover: hover) and (pointer: fine) and (min-width: 900px)');
const actions = computed(() => [
  { kind: 'rename' as const, icon: 'pencil', label: i18n.t('manage.rename') },
  { kind: 'tags' as const, icon: 'tag', label: i18n.t('sessions.editTags') },
  { kind: 'delete' as const, icon: 'trash-2', label: i18n.t('sessions.delete') },
]);
// A long press opens the menu while the finger is still down; lifting it must not also open the
// session, so a click right after the menu opens is dropped.
let openedAt = 0;
function noteOpen(open: boolean) { if (open) openedAt = performance.now(); }
function dropClickAfterPress(event: MouseEvent) {
  if (performance.now() - openedAt < 800) { event.preventDefault(); event.stopPropagation(); }
}
</script>

<template>
  <ContextMenuRoot :modal="false" @update:open="noteOpen">
  <ContextMenuTrigger as-child>
  <div class="sl-item" :class="{ active }" :data-session-id="row.id" data-context-menu @click.capture="dropClickAfterPress">
    <Hint :text="`${name} · ${relTime(row.updated_at_ms, i18n.t)}`"><RouterLink :to="`/s/${row.id}`" class="sl-row" :data-testid="`sl-row-${index}`"
      :aria-current="active ? 'page' : undefined">
      <Hint :text="i18n.t(`phase.${row.phase}`)"><span class="sl-status phase-dot" :class="row.phase" :aria-label="i18n.t(`phase.${row.phase}`)" /></Hint>
      <span class="sl-main">
        <FadeText class="sl-name" :text="name" />
        <span v-for="tag in tags" :key="tag" class="sl-tag">{{ tag }}</span>
      </span>
    </RouterLink></Hint>
    <DropdownMenuRoot v-if="withButton" :modal="false">
      <DropdownMenuTrigger class="sl-menu-trigger" :aria-label="`${i18n.t('manage.title')} · ${name}`"><Icon name="ellipsis-vertical" /></DropdownMenuTrigger>
      <DropdownMenuPortal v-if="pageActive">
        <DropdownMenuContent class="menu-pop sl-menu" align="end" :side-offset="4" :collision-padding="8">
          <template v-for="action in actions" :key="action.kind">
            <DropdownMenuSeparator v-if="action.kind === 'delete'" class="sl-menu-separator" />
            <DropdownMenuItem class="menu-item" :class="{ 'sl-delete': action.kind === 'delete' }" @select="emit('action', action.kind)"><Icon :name="action.icon" />{{ action.label }}</DropdownMenuItem>
          </template>
        </DropdownMenuContent>
      </DropdownMenuPortal>
    </DropdownMenuRoot>
  </div>
  </ContextMenuTrigger>
  <ContextMenuPortal v-if="pageActive">
    <ContextMenuContent class="menu-pop sl-menu" :collision-padding="8">
      <template v-for="action in actions" :key="action.kind">
        <ContextMenuSeparator v-if="action.kind === 'delete'" class="sl-menu-separator" />
        <ContextMenuItem class="menu-item" :class="{ 'sl-delete': action.kind === 'delete' }" @select="emit('action', action.kind)"><Icon :name="action.icon" />{{ action.label }}</ContextMenuItem>
      </template>
    </ContextMenuContent>
  </ContextMenuPortal>
  </ContextMenuRoot>
</template>

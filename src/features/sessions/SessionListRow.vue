<script setup lang="ts">
import FadeText from '../../ui/components/FadeText.vue';
import Hint from '../../ui/components/Hint.vue';
import { computed } from 'vue';
import Icon from '../../ui/components/Icon.vue';
import Menu, { type MenuItem } from '../../ui/components/Menu.vue';
import { i18n } from '../../core/i18n/index.ts';
import { relTime } from '../../core/util/fmt.ts';
import { useMedia } from '../../ui/composables/useMedia.ts';
const props = defineProps<{ row: any; active: boolean; index: number }>();
const emit = defineEmits<{ action: [kind: 'rename' | 'tags' | 'delete'] }>();
const name = computed(() => props.row.name || props.row.id.slice(0, 8));
const tags = computed<string[]>(() => Array.isArray(props.row.metadata?.tags) ? props.row.metadata.tags : []);
// The menu opens with a right click, or a long press on a touch screen. Only with a mouse is there
// also a button, shown on hover.
const withButton = useMedia('(hover: hover) and (pointer: fine) and (min-width: 900px)');
const actions = computed<MenuItem[]>(() => [
  { key: 'rename', icon: 'pencil', label: i18n.t('manage.rename') },
  { key: 'tags', icon: 'tag', label: i18n.t('sessions.editTags') },
  { key: 'delete', icon: 'trash-2', label: i18n.t('sessions.delete'), danger: true, separator: true },
]);
const act = (key: string) => emit('action', key as 'rename' | 'tags' | 'delete');
</script>
<template>
  <Menu context :items="actions" @select="act">
  <div class="sl-item" :class="{ active }" :data-session-id="row.id">
    <Hint :text="`${name} · ${relTime(row.updated_at_ms, i18n.t)}`"><RouterLink :to="`/s/${row.id}`" class="sl-row" :data-testid="`sl-row-${index}`"
      :aria-current="active ? 'page' : undefined">
      <Hint :text="i18n.t(`phase.${row.phase}`)"><span class="sl-status phase-dot" :class="row.phase" :aria-label="i18n.t(`phase.${row.phase}`)" /></Hint>
      <span class="sl-main">
        <FadeText class="sl-name" :text="name" />
        <span v-for="tag in tags" :key="tag" class="sl-tag">{{ tag }}</span>
      </span>
    </RouterLink></Hint>
    <Menu v-if="withButton" :items="actions" @select="act">
      <template #trigger><button type="button" class="sl-menu-trigger" :aria-label="`${i18n.t('manage.title')} · ${name}`"><Icon name="ellipsis-vertical" /></button></template>
    </Menu>
  </div>
  </Menu>
</template>

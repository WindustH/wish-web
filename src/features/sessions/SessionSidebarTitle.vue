<script setup lang="ts">
import { tr } from '../../core/i18n/tr.ts';
import { computed } from 'vue';
import { sidebarViews as choices } from './sidebarViews.ts';
import Icon from '../../ui/components/Icon.vue';
import Menu from '../../ui/components/Menu.vue';

const props = defineProps<{ current: 'info' | 'library' | 'tasks' | 'browser' }>();
const emit = defineEmits<{ openChange: [open: boolean]; select: [view: 'info' | 'library' | 'tasks' | 'browser'] }>();
const current = computed(() => choices.value.find((choice) => choice.key === props.current) ?? choices.value[0]);
const items = computed(() => choices.value.map((choice) => ({ ...choice, checked: choice.key === props.current })));
function select(key: string) {
  const choice = choices.value.find((choice) => choice.key === key);
  if (choice && choice.key !== props.current) emit('select', choice.key);
}
</script>

<template>
  <Menu :items="items" align="start" @select="select" @open-change="emit('openChange', $event)">
    <template #trigger>
      <button
        type="button"
        class="btn ghost session-sidebar-title"
        :aria-label="tr(`切换侧栏：${current.label}`, `Switch sidebar: ${current.label}`)"
      >
        <Icon :name="current.icon" />
        <span>{{ current.label }}</span>
        <Icon name="chevron-down" :size="14" class="sidebar-title-chevron" />
      </button>
    </template>
  </Menu>
</template>

<style scoped>
.session-sidebar-title {
  display: inline-flex;
  align-items: center;
  gap: 7px;
  max-width: 100%;
  min-height: 32px;
  padding: 4px 6px;
  font: inherit;
  color: inherit;
}
.session-sidebar-title > span {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.session-sidebar-title > .icon {
  flex: none;
}
.sidebar-title-chevron {
  color: var(--fg-muted);
}
</style>

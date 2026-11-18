<script setup lang="ts">
import { computed } from 'vue';
import { tr } from '../../core/i18n/tr.ts';
import Icon from '../../ui/components/Icon.vue';
import Menu from '../../ui/components/Menu.vue';

const props = defineProps<{ current: 'info' | 'library' | 'tasks' }>();
const emit = defineEmits<{ select: [view: 'info' | 'library' | 'tasks'] }>();
const choices = computed(() => [
  { key: 'info' as const, icon: 'info', label: tr('会话', 'Session') },
  { key: 'library' as const, icon: 'library', label: tr('库', 'Library') },
  { key: 'tasks' as const, icon: 'terminal', label: tr('终端', 'Terminal') },
]);
const current = computed(() => choices.value.find((choice) => choice.key === props.current)!);
const items = computed(() => choices.value.map((choice) => ({ ...choice, checked: choice.key === props.current })));
function select(key: string) {
  const choice = choices.value.find((choice) => choice.key === key);
  if (choice && choice.key !== props.current) emit('select', choice.key);
}
</script>

<template>
  <Menu :items="items" align="start" @select="select">
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

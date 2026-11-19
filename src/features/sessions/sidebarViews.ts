import { computed } from 'vue';
import { tr } from '../../core/i18n/tr.ts';
export const sidebarViews = computed(() => [
  { key: 'info' as const, icon: 'info', label: tr('会话', 'Session') },
  { key: 'library' as const, icon: 'library', label: tr('库', 'Library') },
  { key: 'tasks' as const, icon: 'terminal', label: tr('终端', 'Terminal') },
]);

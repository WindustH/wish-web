import { isNativeApp } from '../../platform/native.ts';
import { computed } from 'vue';
import { tr } from '../../core/i18n/tr.ts';

export const hasDeviceBrowser =
  isNativeApp() &&
  !/iPad|iPhone|iPod/.test(navigator.userAgent) &&
  !(navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
export const sidebarViews = computed(() => [
  { key: 'info' as const, icon: 'info', label: tr('会话', 'Session') },
  { key: 'library' as const, icon: 'library', label: tr('库', 'Library') },
  { key: 'tasks' as const, icon: 'terminal', label: tr('终端', 'Terminal') },
  ...(hasDeviceBrowser ? [{ key: 'browser' as const, icon: 'globe', label: tr('浏览器', 'Browser') }] : []),
]);

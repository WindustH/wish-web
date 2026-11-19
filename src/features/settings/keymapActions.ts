import { computed } from 'vue';
import { tr } from '../../core/i18n/tr.ts';
import type { NavigationAction } from '../../core/shortcuts.ts';
export const appActions = computed(() => [
  {
    id: 'toggleRightSidebar' as const,
    label: tr('开关右侧栏', 'Toggle right sidebar'),
    hint: tr('会话页面', 'Session pages'),
  },
  {
    id: 'toggleLeftSidebar' as const,
    label: tr('开关左侧栏', 'Toggle left sidebar'),
    hint: tr('桌面会话列表', 'Desktop session list'),
  },
  {
    id: 'focusRegionLeft' as const,
    label: tr('聚焦左侧区域', 'Focus region to the left'),
    hint: tr('会话工作区', 'Session workspace'),
  },
  {
    id: 'focusRegionRight' as const,
    label: tr('聚焦右侧区域', 'Focus region to the right'),
    hint: tr('会话工作区', 'Session workspace'),
  },
  { id: 'quickSwitchSessions' as const, label: tr('快速切换会话', 'Quick switch sessions') },
  { id: 'interruptReply' as const, label: tr('中断模型回答', 'Interrupt model response') },
  { id: 'searchSessions' as const, label: tr('搜索会话', 'Search sessions') },
  { id: 'searchChat' as const, label: tr('搜索当前会话', 'Search current session') },
  { id: 'openSettings' as const, label: tr('打开设置', 'Open settings') },
  { id: 'newSession' as const, label: tr('新建会话', 'New session') },
]);
export const navigationActions = computed<{ id: NavigationAction; label: string }[]>(() => [
  { id: 'focus', label: tr('聚焦消息输入框', 'Focus message input') },
  { id: 'exit', label: tr('退出消息输入框', 'Leave message input') },
  { id: 'down', label: tr('向下滚动 / 下一项', 'Scroll down / next item') },
  { id: 'up', label: tr('向上滚动 / 上一项', 'Scroll up / previous item') },
  { id: 'nextMessage', label: tr('下一条用户消息', 'Next user message') },
  { id: 'previousMessage', label: tr('上一条用户消息', 'Previous user message') },
  { id: 'command', label: tr('命令面板', 'Command palette') },
  { id: 'back', label: tr('返回上级 / 关闭弹窗', 'Go back / close window') },
  { id: 'previousSidebar', label: tr('上一个右侧栏标签', 'Previous sidebar tab') },
  { id: 'nextSidebar', label: tr('下一个右侧栏标签', 'Next sidebar tab') },
  { id: 'openItem', label: tr('打开所选项', 'Open selected item') },
]);

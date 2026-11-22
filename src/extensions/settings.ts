import { computed } from 'vue';
import { manifests } from './registry.ts';
import { categoryDefinitions } from './shared/settings.ts';
import { tr } from '../core/i18n/tr.ts';
import type { ToolSwitches } from '../core/api/projections.ts';
const enabled = new Set(manifests.flatMap((extension) => extension.settings ?? []));
export const extensionSections = computed(() => categoryDefinitions().filter((category) => enabled.has(category.id)));
export function extensionModeLabel(
  tools: ToolSwitches | undefined,
  key: ReturnType<typeof categoryDefinitions>[number]['toolKey'],
) {
  if (!tools?.[key]) return tr('停用', 'Off');
  return tools.shell && tools[`${key}_delivery`] === 'command' ? tr('命令', 'Command') : tr('工具', 'Tool');
}
export const extensionSwitchRows = computed(() =>
  extensionSections.value.map((category) => ({
    key: category.toolKey,
    name: category.label,
    hint: category.description,
    icon: category.icon,
  })),
);

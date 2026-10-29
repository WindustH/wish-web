import { computed } from 'vue';
import { manifests } from './registry.ts';
import { categoryDefinitions } from './shared/settings.ts';
const enabled = new Set(manifests.flatMap((extension) => extension.settings ?? []));
export const extensionSections = computed(() => categoryDefinitions().filter((category) => enabled.has(category.id)));
export const extensionSwitchRows = computed(() =>
  extensionSections.value.map((category) => ({
    key: category.toolKey,
    name: category.label,
    hint: category.description,
  })),
);

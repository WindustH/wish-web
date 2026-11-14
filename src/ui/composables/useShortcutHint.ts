import { computed } from 'vue';
import { shortcuts } from '../../core/state/shortcutsSlice.ts';
import { shortcutLabel, type ShortcutId } from '../../core/shortcuts.ts';

export function useShortcutHint(id: ShortcutId) {
  const binding = computed(() => shortcuts.value.value.bindings[id]);
  const label = computed(() => (binding.value ? shortcutLabel(binding.value) : ''));
  const aria = computed(() => {
    const key = binding.value;
    if (!key) return undefined;
    const name = key.key === ' ' ? 'Space' : key.key.length === 1 ? key.key.toUpperCase() : key.key;
    return (key.mod ? ['Control', 'Meta'] : [''])
      .map((mod) => [mod, key.alt && 'Alt', key.shift && 'Shift', name].filter(Boolean).join('+'))
      .join(' ');
  });
  return { label, aria };
}

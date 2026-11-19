import { computed } from 'vue';
import { shortcuts } from '../../core/state/shortcutsSlice.ts';
import { shortcutLabel, type ShortcutId } from '../../core/shortcuts.ts';

export function useShortcutHint(id: ShortcutId) {
  const bindings = computed(() => {
    const p = shortcuts.value.value;
    const first = p.bindings[id];
    return [...(first ? [first] : []), ...p.alternates.filter((row) => row.action === id).map((row) => row.binding)];
  });
  const label = computed(() => bindings.value.map(shortcutLabel).join(' · '));
  const aria = computed(() => {
    return (
      bindings.value
        .map((key) => {
          const name = key.key === ' ' ? 'Space' : key.key.length === 1 ? key.key.toUpperCase() : key.key;
          return [key.ctrl && 'Control', key.meta && 'Meta', key.alt && 'Alt', key.shift && 'Shift', name]
            .filter(Boolean)
            .join('+');
        })
        .join(' ') || undefined
    );
  });
  return { label, aria };
}

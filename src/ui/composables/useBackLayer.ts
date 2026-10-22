import { onScopeDispose, watch } from 'vue';
import { backLayers } from '../backLayers.ts';

/** Register visible local windows; routed pages already have their own history entry. */
export function useBackLayer(open: () => boolean, close: () => unknown, priority: () => number = () => 60) {
  let release: (() => void) | undefined;
  watch(open, value => {
    if (value) release ??= backLayers()?.add(close, priority);
    else { release?.(); release = undefined; }
  }, { immediate: true, flush: 'sync' });
  onScopeDispose(() => release?.());
}

import { computed, onScopeDispose, ref, watch, type Ref } from 'vue';
import { readModels, readProviders } from '../../core/provider-catalog';
import type { ModelSelection } from './useSessionSelection';
import { resolvedEffort } from './reasoningLabels';
export function useResolvedEffort(selection: Ref<ModelSelection | undefined>) {
  const fallback = ref<string>();
  const error = ref<unknown>();
  let controller: AbortController | undefined;
  watch(() => [selection.value?.provider, selection.value?.model, selection.value?.reasoning_effort], async () => {
    controller?.abort(); controller = new AbortController();
    const signal = controller.signal, current = selection.value;
    fallback.value = undefined; error.value = undefined;
    if (!current?.model || current.reasoning_effort) return;
    try {
      const provider = (await readProviders(signal)).find(item => item.id === current.provider);
      if (!provider) throw new Error('Provider is unavailable');
      const model = (await readModels(provider, signal)).find(item => item.id === current.model);
      if (!signal.aborted) fallback.value = resolvedEffort(undefined, model, provider.reasoning_efforts);
    } catch (cause) { if (!signal.aborted) error.value = cause; }
  }, { immediate: true });
  onScopeDispose(() => controller?.abort());
  return { effort: computed(() => selection.value?.reasoning_effort || fallback.value), error };
}

import { onScopeDispose, shallowRef } from 'vue';
import { get } from '../../core/api/client.js';
import { bus } from '../../core/bus.js';
import { hasReadyProvider } from '../../core/providerReadiness.js';
import { errorText } from '../../core/config-editor';

export function useProviderGate() {
  const state = shallowRef<'checking' | 'required' | 'ready' | 'error'>('checking');
  const error = shallowRef('');
  let controller: AbortController | undefined;
  let generation = 0;
  async function refresh() {
    controller?.abort();
    controller = new AbortController();
    const own = ++generation;
    try {
      const result = await get('/config', { signal: controller.signal });
      if (own !== generation) return;
      error.value = '';
      state.value = hasReadyProvider(result.config) ? 'ready' : 'required';
    } catch (cause) {
      if (own !== generation) return;
      error.value = errorText(cause);
      // An interrupted control-plane connection must not tear down an open chat.
      if (state.value !== 'ready' && state.value !== 'required') state.value = 'error';
    }
  }
  const offs = [bus.on('configuration.changed', refresh), bus.on('sync.snapshot', refresh)];
  void refresh();
  onScopeDispose(() => { generation++; controller?.abort(); offs.forEach(off => off()); });
  return { state, error, refresh };
}

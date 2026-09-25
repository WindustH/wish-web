import { onScopeDispose, shallowRef } from 'vue';
import { get, getBaseUrl } from '../../core/api/client.ts';
import { bus } from '../../core/bus.ts';
import { hasReadyProvider } from '../../core/providerReadiness.ts';
import { errorText } from '../../core/config-editor.ts';

// The last answer is remembered per server so the app renders at once on the
// next launch; the check still runs and switches to setup if that changed.
const REMEMBER = 'wish.providerGate.ready';
function rememberedReady() {
  try { return localStorage.getItem(REMEMBER) === getBaseUrl(); } catch { return false; }
}
function remember(ready: boolean) {
  try { if (ready) localStorage.setItem(REMEMBER, getBaseUrl()); else localStorage.removeItem(REMEMBER); } catch { /* storage unavailable */ }
}

export function useProviderGate() {
  const state = shallowRef<'checking' | 'required' | 'ready' | 'error'>(rememberedReady() ? 'ready' : 'checking');
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
      remember(state.value === 'ready');
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

import { onScopeDispose, shallowRef } from 'vue';
import { getBaseUrl } from '../../core/api/client.ts';
import { bus } from '../../core/bus.ts';
import { hasReadyProvider } from '../../core/providerReadiness.ts';
import { errorText } from '../../core/errors.ts';
import { configSnapshot } from '../../core/api/endpoints.ts';
import { ApiError } from '../../core/api/client.ts';

// The last answer is remembered per server so the app renders at once on the
// next launch; the check still runs and switches to setup if that changed.
// A server that refuses this browser's token (or the lack of one) is `locked`:
// the app asks for one instead.
const REMEMBER = 'wish.providerGate.ready';
function rememberedReady() {
  try { return localStorage.getItem(REMEMBER) === getBaseUrl(); } catch { return false; }
}
function remember(ready: boolean) {
  try { if (ready) localStorage.setItem(REMEMBER, getBaseUrl()); else localStorage.removeItem(REMEMBER); } catch { /* storage unavailable */ }
}

export function useProviderGate() {
  const state = shallowRef<'checking' | 'required' | 'ready' | 'error' | 'locked'>(rememberedReady() ? 'ready' : 'checking');
  const error = shallowRef('');
  let controller: AbortController | undefined;
  let generation = 0;
  async function refresh() {
    controller?.abort();
    controller = new AbortController();
    const own = ++generation;
    try {
      const result = await configSnapshot({ signal: controller.signal });
      if (own !== generation) return;
      error.value = '';
      state.value = hasReadyProvider(result.config) ? 'ready' : 'required';
      remember(state.value === 'ready');
    } catch (cause) {
      if (own !== generation) return;
      error.value = errorText(cause);
      if (cause instanceof ApiError && cause.status === 401) {
        state.value = 'locked';
        remember(false);
        return;
      }
      // An interrupted control-plane connection must not tear down an open chat.
      if (state.value !== 'ready' && state.value !== 'required') state.value = 'error';
    }
  }
  const offs = [bus.on('configuration.changed', refresh), bus.on('sync.snapshot', refresh)];
  void refresh();
  onScopeDispose(() => { generation++; controller?.abort(); offs.forEach(off => off()); });
  return { state, error, refresh };
}

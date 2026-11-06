import { onBeforeUnmount, ref, watch, type Ref } from 'vue';
import { getBaseUrl } from '../../core/api/client.ts';
import { readWorkspaceState, writeWorkspaceState } from '../../core/util/workspaceState.ts';

export function useWorkspaceState<T extends Record<string, string | number | boolean>>(
  scope: string,
  owner: () => string,
  defaults: T,
  options: { throttleMs?: number | (() => number | undefined) } = {},
) {
  let key = '',
    dirty = false;
  let timer: ReturnType<typeof setTimeout> | undefined;
  const state = ref({ ...defaults }) as Ref<T>;
  function flush() {
    clearTimeout(timer);
    timer = undefined;
    if (dirty && key) writeWorkspaceState(key, state.value);
    dirty = false;
  }
  // Server changes reload the application; the base URL is stable for this scope.
  watch(
    () => JSON.stringify([getBaseUrl(), scope, owner()]),
    (next) => {
      flush();
      key = next;
      state.value = readWorkspaceState(key, defaults);
      dirty = false;
    },
    { immediate: true, flush: 'sync' },
  );
  watch(
    state,
    () => {
      dirty = true;
      const throttleMs = typeof options.throttleMs === 'function' ? options.throttleMs() : options.throttleMs;
      if (throttleMs !== undefined) {
        if (timer === undefined) timer = setTimeout(flush, throttleMs);
      } else {
        clearTimeout(timer);
        timer = setTimeout(flush, 150);
      }
    },
    { deep: true, flush: 'sync' },
  );
  window.addEventListener('pagehide', flush);
  onBeforeUnmount(() => {
    flush();
    window.removeEventListener('pagehide', flush);
  });
  return Object.assign(state, { flush }) as Ref<{
    [K in keyof T]: T[K] extends boolean ? boolean : T[K] extends number ? number : string;
  }> & { flush: () => void };
}

import { onBeforeUnmount, ref, watch, type Ref } from 'vue';
import { getBaseUrl } from '../../core/api/client.ts';
import { readWorkspaceState, writeWorkspaceState } from '../../core/util/workspaceState.ts';

export function useWorkspaceState<T extends Record<string, string | number | boolean>>(
  scope: string,
  owner: () => string,
  defaults: T,
) {
  let key = '',
    dirty = false;
  let timer: ReturnType<typeof setTimeout> | undefined;
  const state = ref({ ...defaults }) as Ref<T>;
  function flush() {
    clearTimeout(timer);
    if (dirty && key) writeWorkspaceState(key, state.value);
    dirty = false;
  }
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
      clearTimeout(timer);
      timer = setTimeout(flush, 150);
    },
    { deep: true, flush: 'sync' },
  );
  window.addEventListener('pagehide', flush);
  onBeforeUnmount(() => {
    flush();
    window.removeEventListener('pagehide', flush);
  });
  return state as Ref<{ [K in keyof T]: T[K] extends boolean ? boolean : T[K] extends number ? number : string }>;
}

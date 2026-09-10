import { computed, onScopeDispose, ref, shallowRef, watch, type Ref } from 'vue';
import * as api from '../../core/api/endpoints.js';
import { chat } from '../../core/state/chatSlice.js';

interface SelectionSnapshot { provider: string; model: string; reasoning_effort?: string; revision: number }

// Both selectors share the same revision/ownership rules, but save only their
// own fields. Late responses cannot update another conversation or dialog.
export function useSessionSelection(sessionId: Ref<string>) {
  const snapshot = shallowRef<SelectionSnapshot>();
  const loading = ref(false), saving = ref(false);
  const error = shallowRef<unknown>();
  const conflict = computed(() => !!error.value && typeof error.value === 'object' && 'code' in error.value && error.value.code === 'revision_conflict');
  let generation = 0;
  let controller: AbortController;
  const owns = (gen: number, id: string) => gen === generation && id === sessionId.value && id === chat.sessionId.value;
  async function reload() {
    controller?.abort();
    controller = new AbortController();
    const gen = ++generation, id = sessionId.value;
    loading.value = true;
    error.value = undefined;
    snapshot.value = undefined;
    try {
      const next = await api.sessionGet(id, { signal: controller.signal });
      if (owns(gen, id)) snapshot.value = next;
    } catch (cause) {
      if (owns(gen, id)) error.value = cause;
    } finally {
      if (owns(gen, id)) loading.value = false;
    }
  }
  async function save(body: { provider?: string; model?: string; reasoning_effort?: string }) {
    if (saving.value || !snapshot.value) return false;
    const gen = generation, id = sessionId.value;
    saving.value = true;
    error.value = undefined;
    try {
      const next = await api.sessionUpdateModel(id, body, snapshot.value.revision);
      if (!owns(gen, id)) return false;
      if ((chat.snapshot.value?.revision ?? 0) <= next.revision) chat.snapshot.value = next;
      await chat.reloadCapabilities();
      return owns(gen, id);
    } catch (cause) {
      if (owns(gen, id)) error.value = cause;
      return false;
    } finally {
      if (owns(gen, id)) saving.value = false;
    }
  }
  watch(sessionId, reload, { immediate: true });
  onScopeDispose(() => { generation++; controller.abort(); });
  return { snapshot, loading, saving, error, conflict, reload, save };
}

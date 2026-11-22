import { computed, onScopeDispose, ref, shallowReactive, shallowRef, watch, type Ref } from 'vue';
import * as api from '../../core/api/endpoints.ts';
import { chat } from '../../core/state/chatSlice.ts';
import { describeError } from '../../core/i18n/errorMessages.ts';
import { toast } from '../../ui/toast.ts';

export interface ModelSelection {
  provider: string;
  model: string;
  reasoning_effort?: string;
}
interface SelectionSnapshot extends ModelSelection {
  revision: number;
  running?: boolean;
}
const changes = shallowReactive(new Map<string, ModelSelection>());
export const sessionSelectionChange = (id: string | undefined) => (id ? changes.get(id) : undefined);

// Both selectors share the same revision/ownership rules, but save only their
// own fields. Late responses cannot update another conversation or dialog.
export function useSessionSelection(
  sessionId: Ref<string | undefined>,
  local?: Ref<ModelSelection | undefined>,
  select?: (value: ModelSelection) => void,
) {
  const snapshot = shallowRef<SelectionSnapshot>();
  const loading = ref(false);
  const saving = computed(() => !!sessionSelectionChange(sessionId.value));
  const error = shallowRef<unknown>();
  const conflict = computed(
    () =>
      !!error.value &&
      typeof error.value === 'object' &&
      'code' in error.value &&
      error.value.code === 'state_conflict',
  );
  let generation = 0;
  let controller: AbortController;
  const owns = (gen: number, id: string) => gen === generation && id === sessionId.value && id === chat.sessionId.value;
  async function reload() {
    controller?.abort();
    controller = new AbortController();
    const gen = ++generation,
      id = sessionId.value;
    loading.value = false;
    error.value = undefined;
    if (local?.value) {
      snapshot.value = { ...local.value, revision: 0 };
      return;
    }
    if (!id) throw new Error('Selection requires a session or a draft');
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
    if (local?.value && select) {
      const next = body.model
        ? { provider: local.value.provider, model: body.model, ...body }
        : { ...local.value, ...body };
      select(next);
      return true;
    }
    const id = sessionId.value;
    if (!id || id !== chat.sessionId.value) return false;
    const { provider, model, reasoning_effort, revision } = snapshot.value;
    const selection: ModelSelection = {
      provider,
      model,
      reasoning_effort: body.model ? undefined : reasoning_effort,
      ...body,
    };
    changes.set(id, selection);
    error.value = undefined;
    void commit(id, body, revision);
    return true;
  }
  async function commit(id: string, body: Parameters<typeof api.sessionUpdateModel>[1], revision: number) {
    try {
      const next = await api.sessionUpdateModel(id, body, revision);
      if (chat.sessionId.value === id) {
        chat.adoptSnapshot(id, next);
        await chat.reloadCapabilities();
      }
    } catch (cause) {
      toast(describeError(cause).message, { tone: 'error' });
      if ((cause as { code?: string })?.code === 'state_conflict' && chat.sessionId.value === id)
        void api
          .sessionGet(id)
          .then((current) => chat.adoptSnapshot(id, current))
          .catch(() => {});
    } finally {
      changes.delete(id);
    }
  }
  watch(() => [sessionId.value, local?.value], reload, { immediate: true });
  onScopeDispose(() => {
    generation++;
    controller.abort();
  });
  return { snapshot, loading, saving, error, conflict, reload, save };
}

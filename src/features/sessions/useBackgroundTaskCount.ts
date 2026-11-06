import { useDocumentVisible } from '../../ui/composables/useDocumentVisible.ts';
import { computed, ref, watch, type Ref } from 'vue';
import { sessionTasks } from '../../core/api/endpoints.ts';
import { usePageActivity } from '../../ui/composables/usePageActivity.ts';

/** Poll only the visible session; never overlap requests or retain another session's count. */
export function useBackgroundTaskCount(session: Readonly<Ref<string>>, panelOpen: () => boolean = () => false) {
  const count = ref(0);
  const pageActive = usePageActivity();
  const visible = useDocumentVisible();
  const active = computed(() => pageActive.value && visible.value && !panelOpen());
  watch(session, () => (count.value = 0));
  watch(
    [session, active],
    ([id, enabled], _, cleanup) => {
      if (!id || !enabled) return;
      const controller = new AbortController();
      let timer: ReturnType<typeof setTimeout> | undefined;
      cleanup(() => {
        controller.abort();
        clearTimeout(timer);
      });
      async function refresh() {
        try {
          const result = await sessionTasks(id, controller.signal);
          if (!controller.signal.aborted)
            count.value = result.tasks.filter((task) => task.background && task.process.status === 'running').length;
        } catch {
          // A transient network failure must not make running tasks appear completed.
        } finally {
          if (!controller.signal.aborted) timer = setTimeout(refresh, 5000);
        }
      }
      void refresh();
    },
    { immediate: true },
  );
  return count;
}

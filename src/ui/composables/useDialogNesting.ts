import { computed, inject, onScopeDispose, provide, ref, watch, type InjectionKey, type Ref } from 'vue';

const dialogChildren: InjectionKey<Ref<number>> = Symbol('dialogChildren');

/** A portalled child's scrim is outside its parent's DOM, but belongs to the child.
 * Keep the parent from dismissing on that same interaction, including during exit. */
export function useDialogNesting(present: () => boolean) {
  const parent = inject(dialogChildren, null);
  const children = ref(0);
  provide(dialogChildren, children);
  let registered = false;
  function register(value: boolean) {
    if (!parent || value === registered) return;
    parent.value += value ? 1 : -1;
    registered = value;
  }
  watch(present, register, { immediate: true, flush: 'sync' });
  onScopeDispose(() => register(false));
  return computed(() => children.value > 0);
}

import type { InjectionKey, Ref } from 'vue';
export interface DraftActions {
  dirty: Readonly<Ref<boolean>>;
  busy: Readonly<Ref<boolean>>;
  save: () => Promise<boolean>;
  discard: () => void;
}
export const draftActionsKey: InjectionKey<DraftActions> = Symbol('draftActions');

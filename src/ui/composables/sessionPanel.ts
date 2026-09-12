import type { InjectionKey, ShallowRef } from 'vue';
export const sessionPanelCloseKey: InjectionKey<ShallowRef<(() => void) | null>> = Symbol('sessionPanelClose');

import type { InjectionKey, ShallowRef } from 'vue';
export const sessionPanelCloseKey: InjectionKey<ShallowRef<(() => void) | null>> = Symbol('sessionPanelClose');

export const sessionPanelElementsKey: InjectionKey<{
  anchor: () => HTMLElement | null;
  contains: (target: Element) => boolean;
}> = Symbol('sessionPanelElements');

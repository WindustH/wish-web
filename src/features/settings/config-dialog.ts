import type { InjectionKey, Ref } from 'vue';
export interface ConfigDialogTarget { path: string[]; title: string; anchor?: HTMLElement }
export const openConfigDialog: InjectionKey<(target: ConfigDialogTarget) => void> = Symbol('openConfigDialog');
export const activeConfigPaths: InjectionKey<Readonly<Ref<string[]>>> = Symbol('activeConfigPaths');

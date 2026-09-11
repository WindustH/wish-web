import type { InjectionKey } from 'vue';
export interface ConfigDialogTarget { path: string[]; title: string }
export const openConfigDialog: InjectionKey<(target: ConfigDialogTarget) => void> = Symbol('openConfigDialog');

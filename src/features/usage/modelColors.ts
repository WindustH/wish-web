import type { InjectionKey } from 'vue';

/** A page's color slot for a model key, so every chart on it colors a model alike. */
export const modelColorKey: InjectionKey<(key: string) => number | undefined> = Symbol('modelColor');

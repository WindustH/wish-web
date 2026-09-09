import type { ShallowRef } from 'vue';
export declare const prefs: {
  sendOnEnter: ShallowRef<boolean>;
  keepAwake: ShallowRef<boolean>;
  notifyOnFailure: ShallowRef<boolean>;
  loaded: ShallowRef<boolean>;
  load(): void;
  set<K extends 'sendOnEnter' | 'keepAwake' | 'notifyOnFailure'>(key: K, v: boolean): void;
};

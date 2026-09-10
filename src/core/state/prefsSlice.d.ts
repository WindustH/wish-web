import type { ShallowRef } from 'vue';

export interface PrefsApi {
  sendOnEnter: ShallowRef<boolean>;
  keepAwake: ShallowRef<boolean>;
  showAdvanced: ShallowRef<boolean>;
  notifyOnFailure: ShallowRef<boolean>;
  sessionListCollapsed: ShallowRef<boolean>;
  loaded: ShallowRef<boolean>;
  load(): void;
  setSendOnEnter(v: boolean): void;
  setKeepAwake(v: boolean): void;
  setShowAdvanced(v: boolean): void;
  setNotifyOnFailure(v: boolean): void;
  setSessionListCollapsed(v: boolean): void;
}
export declare const prefs: PrefsApi;

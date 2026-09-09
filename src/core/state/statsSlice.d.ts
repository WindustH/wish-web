import type { ShallowRef } from 'vue';
export declare const stats: {
  usage: ShallowRef<any>;
  status: ShallowRef<any>;
  loading: ShallowRef<boolean>;
  error: ShallowRef<any>;
  refresh(): Promise<void>;
};

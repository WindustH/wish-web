import type { ShallowRef } from 'vue';
export declare const sync: {
  state: ShallowRef<string>;
  online: ShallowRef<boolean>;
  protocolError: ShallowRef<any>;
  start(): void;
  subscribeSession(id: string, cb: (evt: any) => void): () => void;
};

import type { ShallowRef } from 'vue';
export declare const sync: {
  state: ShallowRef<string>;
  online: ShallowRef<boolean>;
  /** Bumped on every sync.snapshot frame; 1 = initial, >1 = reconnect/reset. */
  snapshotRevision: ShallowRef<number>;
  protocolError: ShallowRef<any>;
  start(): void;
  subscribeSession(id: string, cb: (evt: any) => void): () => void;
};

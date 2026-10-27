// DOM-free application events. Publishers and subscribers share one payload contract.
import type { SessionView } from './api/projections.ts';
export interface BusEvents {
  notice: string;
  'upsert.session': { id: string; body: SessionView };
  'tombstone.session': { id: string };
  'upsert.group': { id: string };
  'tombstone.group': { id: string };
  'list.changed': Record<string, never> | undefined;
  'sync.snapshot': Record<string, never>;
  'configuration.changed': Record<string, never>;
}
type Topic = keyof BusEvents;
type Listener<K extends Topic> = (payload: BusEvents[K]) => void;
// The erased internal representation is never exposed to callers.
const listeners = new Map<Topic, Set<(payload: never) => void>>();
export const bus = {
  on<K extends Topic>(topic: K, fn: Listener<K>) {
    if (!listeners.has(topic)) listeners.set(topic, new Set());
    listeners.get(topic)!.add(fn);
    return () => bus.off(topic, fn);
  },
  off<K extends Topic>(topic: K, fn: Listener<K>) {
    listeners.get(topic)?.delete(fn);
  },
  emit<K extends Topic>(
    topic: K,
    ...args: undefined extends BusEvents[K] ? [payload?: BusEvents[K]] : [payload: BusEvents[K]]
  ) {
    for (const fn of [...(listeners.get(topic) ?? [])]) {
      try {
        fn(args[0] as never);
      } catch (error) {
        console.error(`[bus] ${topic}`, error);
      }
    }
  },
};

// Minimal DOM-free event bus. Core slices communicate through explicit
// topics; the UI subscribes for rendering side effects only.
// Payloads are whatever each topic's publisher sends.
type Listener = (payload: any) => void;
const listeners = new Map<string, Set<Listener>>();

export const bus = {
  on(topic: string, fn: Listener) {
    if (!listeners.has(topic)) listeners.set(topic, new Set());
    listeners.get(topic)!.add(fn);
    return () => bus.off(topic, fn);
  },
  off(topic: string, fn: Listener) { listeners.get(topic)?.delete(fn); },
  emit(topic: string, payload?: unknown) {
    const set = listeners.get(topic);
    if (!set) return;
    for (const fn of [...set]) {
      try { fn(payload); } catch (err) { console.error(`[bus] ${topic}`, err); }
    }
  },
  topicCount() { return listeners.size; },
};

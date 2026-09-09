// Minimal DOM-free event bus. Core slices communicate through explicit
// topics; the UI subscribes for rendering side effects only.
const listeners = new Map();

export const bus = {
  on(topic, fn) {
    if (!listeners.has(topic)) listeners.set(topic, new Set());
    listeners.get(topic).add(fn);
    return () => bus.off(topic, fn);
  },
  off(topic, fn) { listeners.get(topic)?.delete(fn); },
  emit(topic, payload) {
    const set = listeners.get(topic);
    if (!set) return;
    for (const fn of [...set]) {
      try { fn(payload); } catch (err) { console.error(`[bus] ${topic}`, err); }
    }
  },
  topicCount() { return listeners.size; },
};

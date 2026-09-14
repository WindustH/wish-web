// Which process groups the reader unfolded, per session. The virtualizer
// recycles rows freely: a pruned row destroys its component, and with the
// state inside the component an open group silently folds itself shut on
// every scroll (and its sudden re-measure jumps the list).
const open = new Map<string, Set<string>>();

export const expandedBefore = (sessionId: string, key: string) => open.get(sessionId)?.has(key) ?? false;
export const setExpanded = (sessionId: string, key: string, value: boolean) => {
  let set = open.get(sessionId);
  if (!set) {
    set = new Set<string>();
    open.set(sessionId, set);
    while (open.size > 32) {
      const oldest = open.keys().next().value;
      if (oldest === undefined || oldest === sessionId) break;
      open.delete(oldest);
    }
  }
  if (value) set.add(key); else set.delete(key);
};

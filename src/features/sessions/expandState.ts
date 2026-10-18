// Which runs' windows the reader has open, and the step open in each, per session. A run's button
// moves from a row of its own into the reply after it as that reply arrives, and the virtualizer
// recycles rows freely: held in the component, an open window would shut itself as it moved.
const open = new Map<string, Set<string>>();
const steps = new Map<string, { key: string; diffOnly: boolean }>();

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

/** Forgets a session's open windows: leaving it closes them, rather than coming back to them. */
export const forgetSession = (sessionId: string) => {
  open.delete(sessionId);
  for (const key of steps.keys()) if (key.startsWith(`${sessionId} `)) steps.delete(key);
};
export const stepBefore = (sessionId: string, key: string) => steps.get(`${sessionId} ${key}`);
export const setStep = (sessionId: string, key: string, step?: { key: string; diffOnly: boolean }) => {
  if (step) steps.set(`${sessionId} ${key}`, step); else steps.delete(`${sessionId} ${key}`);
};

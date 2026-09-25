// Follows each session's projection and reports the moment a run ends in
// failure. The first sighting of a session only records it, so page loads and
// reconnects never replay failures that were already there.
export function createRunFailureWatch() {
  const running = new Map();
  return {
    /** Returns the failure when this projection shows a run that just failed. */
    observe(session) {
      if (!session?.id) return null;
      const was = running.get(session.id);
      const now = Boolean(session.running);
      running.set(session.id, now);
      return was && !now ? session.last_error ?? null : null;
    },
    forget(id) { running.delete(id); },
  };
}

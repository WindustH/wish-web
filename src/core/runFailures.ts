// Follows each session's projection and reports the moment a run ends in
// failure. The first sighting of a session only records it, so page loads and
// reconnects never replay failures that were already there.
import type { DisplayFailure } from './api/failures.ts';

// The parts of a session projection the watch reads.
export interface RunState { id?: string; running?: boolean; last_error?: DisplayFailure | null }

export function createRunFailureWatch() {
  const running = new Map<string, boolean>();
  return {
    /** Returns the failure when this projection shows a run that just failed. */
    observe(session: RunState | null | undefined): DisplayFailure | null {
      if (!session?.id) return null;
      const was = running.get(session.id);
      const now = Boolean(session.running);
      running.set(session.id, now);
      return was && !now ? session.last_error ?? null : null;
    },
    forget(id: string) { running.delete(id); },
  };
}

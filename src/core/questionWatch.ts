// Follows the ask_user forms sessions hold open. A form waits for an answer until it is answered
// or its call times out.
import type { PendingQuestion } from './api/projections.ts';

// The parts of a session projection the watch reads.
interface QuestionState { id?: string; pending_questions?: readonly PendingQuestion[] }

/** The forms of a session still waiting for an answer. */
export const waitingForms = (session: QuestionState | null | undefined) =>
  (session?.pending_questions ?? []).filter(form => !form.timed_out);

/** Whether a session's run is waiting on the user's answers. */
export const awaitsAnswer = (session: QuestionState | null | undefined) => waitingForms(session).length > 0;

/**
 * Follows each session's open forms and reports those that newly wait for an answer. The first
 * sighting of a session only records it, so page loads and reconnects stay quiet.
 */
export function createQuestionWatch() {
  const seen = new Map<string, Set<string>>();
  return {
    observe(session: QuestionState | null | undefined): PendingQuestion[] {
      if (!session?.id) return [];
      const waiting = waitingForms(session);
      const known = seen.get(session.id);
      seen.set(session.id, new Set(waiting.map(form => form.call_id)));
      return known ? waiting.filter(form => !known.has(form.call_id)) : [];
    },
    forget(id: string) { seen.delete(id); },
  };
}

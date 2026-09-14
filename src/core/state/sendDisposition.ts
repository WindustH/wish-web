// Where a sent message goes is the daemon's call, decided before the POST:
// only an idle session consumes a delivery immediately, so only idle gets
// the optimistic tail. Every other phase — a live run, a loop paused to
// compact, a queued or interrupted session — parks the message as a
// delivery: the dock lists it and the transcript only sees it once the
// loop drains it. Deciding on the stream channel alone double-shows the
// message during compaction (the loop is paused without ending our run
// observation) and on interrupted sessions (no stream at all).
export type SendDisposition = 'queue' | 'tail';
export function sendDisposition(input: { streamActive?: boolean | null; phase?: string | null }): SendDisposition {
  if (input.streamActive) return 'queue';
  return input.phase && input.phase !== 'idle' ? 'queue' : 'tail';
}

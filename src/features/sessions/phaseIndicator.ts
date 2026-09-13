// Phase → chat work indicator mapping, in one place so the three live rows
// stay mutually exclusive by construction:
//   run            a stream is active (authoritative running phase or live run)
//   compacting     the loop paused to fold context (independent phase channel —
//                  never promoted to a fake run, see chatSlice.reattachIfRunning)
//   stoppedResume  daemon-interrupted with queued deliveries waiting for the user
//   null           idle: no indicator
export type ChatWorkIndicator = 'run' | 'compacting' | 'stoppedResume' | null;
export function chatWorkIndicator(input: { running?: boolean | null; phase?: string | null; queue?: number | null }): ChatWorkIndicator {
  // Compacting outranks the run channel: the loop is paused while wishd folds
  // context, so a still-attached run observation carries no output — the
  // specific "compacting" status beats a generic working spinner.
  if (input.phase === 'compacting') return 'compacting';
  if (input.running) return 'run';
  if (input.phase === 'interrupted' && (input.queue ?? 0) > 0) return 'stoppedResume';
  return null;
}

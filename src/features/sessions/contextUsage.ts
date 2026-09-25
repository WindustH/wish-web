// Context gauge: the current context set against the compaction trigger and
// the model's window. One pure mapping keeps the thresholds testable while the
// pane only draws it.
export type ContextLevel = 'low' | 'mid' | 'high' | 'unknown';
export type ContextGauge = {
  tokens: number | null;
  trigger: number | null;
  window: number | null;
  /** Share of the limit that matters: the trigger, or the window without compaction. */
  ratio: number | null;
  level: ContextLevel;
  /** Token count spanned by the whole bar. */
  scale: number;
};

const positive = (value: unknown) => typeof value === 'number' && Number.isFinite(value) && value > 0 ? value : null;

export function contextGauge(tokens: unknown, trigger: unknown, window: unknown): ContextGauge {
  const used = typeof tokens === 'number' && Number.isFinite(tokens) && tokens >= 0 ? tokens : null;
  const limit = positive(trigger);
  const size = positive(window);
  // Compaction acts at the trigger, so that is what "full" means; the window only matters without one.
  const reference = limit ?? size;
  const ratio = used != null && reference ? used / reference : null;
  return {
    tokens: used,
    trigger: limit,
    window: size,
    ratio,
    // Under 60% there is plenty of room; from 85% the next turns will compact.
    level: ratio == null ? 'unknown' : ratio >= 0.85 ? 'high' : ratio >= 0.6 ? 'mid' : 'low',
    scale: Math.max(size ?? 0, limit ? limit / 0.9 : 0, used ?? 0, 1),
  };
}

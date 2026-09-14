// Context usage row: one pure mapping so the thresholds, the estimated
// marker and the token fraction stay testable while the pane stays dumb.
// The daemon reports context_usage {tokens, window_tokens, ratio, source};
// until it does (older daemon, or a model without a window), the row hides.
export type ContextUsageRow = { pct: number; level: 'low' | 'mid' | 'high'; estimated: boolean; fraction: string };

export function contextUsageRow(
  usage: any,
  fmtTokens: (n: number) => string,
): ContextUsageRow | null {
  if (!usage || !usage.window_tokens) return null;
  const ratio = typeof usage.ratio === 'number' ? usage.ratio : usage.tokens / usage.window_tokens;
  const pct = Math.round(ratio * 100);
  return {
    pct,
    // <60% is business as usual; 60–85% is where compaction starts to
    // matter; past 85% the next turn is at real risk of truncation.
    level: pct > 85 ? 'high' : pct >= 60 ? 'mid' : 'low',
    estimated: usage.source === 'estimated',
    fraction: `${fmtTokens(usage.tokens)} / ${fmtTokens(usage.window_tokens)}`,
  };
}

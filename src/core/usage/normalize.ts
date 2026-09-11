import type { UsageChartData, UsageSeriesResponse } from './types';

/** Preserve server-side weights and nulls; chart smoothing is visual only. */
export function chartData(response: UsageSeriesResponse, timezone: string): UsageChartData {
  return {
    samples: response.coverage.stream_samples,
    attempts: response.coverage.attempts_with_usage,
    timezone,
    models: response.groups.map(group => ({
      provider: group.provider, model: group.model,
      tokens: group.window.total_tokens,
      tps: group.window.tps,
      points: group.buckets.map(bucket => ({ at: bucket.start_ms,
        tokens: bucket.total_tokens, tps: bucket.tps, attempts: bucket.attempts })),
    })),
  };
}

import type { UsageChartData, UsageSeriesResponse } from './types.ts';

/** Preserve backend samples and nulls; TPS points are never fitted or interpolated. */
export function chartData(response: UsageSeriesResponse, timezone: string): UsageChartData {
  return {
    samples: response.coverage.stream_samples,
    truncated: response.sampling.truncated,
    attempts: response.coverage.attempts_with_usage,
    timezone,
    models: response.groups.map(group => ({
      provider: group.provider, model: group.model, samples: group.samples,
      tokens: group.window.total_tokens,
      tps: group.window.tps,
      points: group.buckets.map(bucket => ({ at: bucket.start_ms,
        tokens: bucket.total_tokens, tps: bucket.tps, attempts: bucket.attempts })),
    })),
  };
}

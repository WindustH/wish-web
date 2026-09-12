export interface UsagePoint { at: number; tokens: number; tps: number | null; attempts: number }
export interface UsageModel { provider: string | null; model: string | null; tokens: number; tps: number | null; samples: { at_ms: number; tps: number; attempt_id: string }[]; points: UsagePoint[] }
export interface UsageChartData { models: UsageModel[]; samples: number; attempts: number; timezone: string }

export interface SeriesQuery { window: '1d' | '7d' | '30d' | '90d' | '365d' | 'custom'; bucket?: '1h' | '6h' | '1d'; to_ms?: number; from_ms?: number }
export interface DailyQuery { days?: number; end_date?: string; tz_offset_minutes: number }
export interface UsageBucket {
  start_ms: number; input_tokens: number; output_tokens: number; total_tokens: number; attempts: number;
  stream_samples: number; stream_output_tokens: number; stream_duration_ms: number; tps: number | null;
}
export interface UsageSeriesResponse {
  query: { from_ms: number; to_ms: number; window: '1d' | '7d' | '30d' | '90d' | '365d' | 'custom'; bucket: '1h' | '6h' | '1d'; bucket_ms: number };
  coverage: { attempts_with_usage: number; attempts_success: number; attempts_failed: number; stream_samples: number; success_without_valid_stream_timing: number };
  groups: { samples: { at_ms: number; tps: number; attempt_id: string }[]; provider: string | null; model: string | null; window: Omit<UsageBucket, 'start_ms'>; buckets: UsageBucket[] }[];
}
export interface UsageDailyResponse {
  query: { days: number; end_date: string; tz_offset_minutes: number; tz_label: string; first_day_start_ms: number; last_day_start_ms: number; bucket_ms: number };
  buckets: { start_ms: number; total_tokens: number }[];
  days: { date: string; input_tokens: number; output_tokens: number; total_tokens: number; attempts: number }[];
}

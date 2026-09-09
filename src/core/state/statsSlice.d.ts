import type { ShallowRef } from 'vue';
export interface UsageTotals {
  usage_records: number;
  committed_responses: number;
  tokens: { input_tokens: number; output_tokens: number; total_tokens: number; reasoning_tokens: number };
  cache: { request_hit_ratio: number | null; read_input_tokens: number; write_input_tokens: number };
}
export interface UsageSnapshot {
  statistics: {
    model_attempts: number;
    attempts_with_usage: number;
    attempts_without_usage: number;
    totals: UsageTotals;
    by_provider_model: { provider: string | null; model: string | null; totals: UsageTotals }[];
  };
}
export interface StatusSnapshot {
  counts: { sessions: number; runs: number };
  queue: { active_sessions: number; ready_sessions: number; pending_items: number; compacting_sessions: number };
  uptime_ms: number;
}
export interface StorageSnapshot {
  counts: { executions: number; blobs: number; image_jobs: number; context_generations: number };
}
export declare const stats: {
  usage: ShallowRef<UsageSnapshot | null>;
  status: ShallowRef<StatusSnapshot | null>;
  storage: ShallowRef<StorageSnapshot | null>;
  version: ShallowRef<{ name: string; version: string } | null>;
  updatedAt: ShallowRef<number | null>;
  loading: ShallowRef<boolean>;
  error: ShallowRef<unknown>;
  refresh(): Promise<void>;
  startAuto(): void;
  stopAuto(): void;
};

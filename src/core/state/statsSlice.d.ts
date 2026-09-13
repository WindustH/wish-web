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
export interface MemorySnapshot {
  authority: string;
  observed_at: string;
  allocator: 'jemalloc' | 'system';
  rss_bytes: number;
  allocated_bytes?: number;
  metadata_bytes?: number;
  resident_bytes?: number;
  retained_bytes?: number;
}
export interface StorageSnapshot {
  bytes: { session_data: number; blobs: number; executions: number; service_data: number; total: number };
  counts: { executions: number; blobs: number; image_jobs: number; context_generations: number };
}
export declare const stats: {
  usage: ShallowRef<UsageSnapshot | null>;
  status: ShallowRef<StatusSnapshot | null>;
  storage: ShallowRef<StorageSnapshot | null>;
  memory: ShallowRef<MemorySnapshot | null>;
  version: ShallowRef<{ name: string; version: string } | null>;
  updatedAt: ShallowRef<number | null>;
  loading: ShallowRef<boolean>;
  error: ShallowRef<unknown>;
  refresh(): Promise<void>;
  startAuto(): void;
  stopAuto(): void;
};

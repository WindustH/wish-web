import type { ShallowRef, ComputedRef } from 'vue';

export interface SessionsApi {
  items: ComputedRef<any[]>;
  cursor: ShallowRef<string | null>;
  phaseFilter: ShallowRef<string>;
  anyFilterActive: ComputedRef<boolean>;
  patchRow(id: string, patch: Record<string, unknown>): void;
  setPhaseFilter(p: string): void;
  loading: ShallowRef<boolean>;
  loadingMore: ShallowRef<boolean>;
  error: ShallowRef<any>;
  hasMore: ShallowRef<boolean>;
  query: ShallowRef<string>;
  tagFilter: ShallowRef<string>;
  loadFirst(): Promise<void>;
  loadMore(): Promise<boolean>;
  rebuild(): Promise<void>;
  refresh(): Promise<void>;
  setQuery(q: string): void;
  setTagFilter(t: string): void;
  create(s: { name?: string; provider: string; model: string; reasoningEffort?: string; agentCustom?: unknown; cwd?: string }): Promise<any>;
  rename(id: string, name: string): Promise<any>;
  updateMeta(row: { id: string; revision?: number | null; metadata?: Record<string, unknown> | null }, changes: Record<string, unknown>): Promise<any>;
  dropRow(id: string): void;
  getById(id: string): any;
}
export declare const sessions: SessionsApi;

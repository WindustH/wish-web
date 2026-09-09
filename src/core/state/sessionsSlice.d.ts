import type { ShallowRef, ComputedRef } from 'vue';

export interface SessionsApi {
  items: ComputedRef<any[]>;
  cursor: ShallowRef<string | null>;
  phaseFilter: ShallowRef<string>;
  totalKnown: ShallowRef<number | null>;
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
  loadMore(): Promise<void>;
  rebuild(): Promise<void>;
  refresh(): Promise<void>;
  setQuery(q: string): void;
  setTagFilter(t: string): void;
  create(s: any): void;
  rename(id: string, name: string): void;
  updateMeta(id: string, changes: Record<string, unknown>): void;
  dropRow(id: string): void;
  getById(id: string): any;
}
export declare const sessions: SessionsApi;

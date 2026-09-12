// Typed surface for the DOM-free chat slice (business logic stays .js).
import type { ShallowRef, ComputedRef } from 'vue';

export interface CapabilitiesOk { status: 'ok'; data: any }
export interface CapabilitiesErr { status: 'error'; error: any }

export interface ChatApi {
  sessionId: ShallowRef<string | null>;
  snapshot: ShallowRef<any>;
  entries: ShallowRef<any[]>;
  oldestSeq: ShallowRef<number | null>;
  newestSeq: ShallowRef<number | null>;
  historyVersion: ShallowRef<number>;
  deliveries: ShallowRef<any[]>;
  locating: ShallowRef<boolean>;
  isActive: ShallowRef<boolean>;
  stream: ShallowRef<any>;
  sending: ShallowRef<boolean>;
  sentRun: ShallowRef<{ sessionId: string; deliveryId: string } | null>;
  capabilities: ShallowRef<CapabilitiesOk | CapabilitiesErr | null>;
  pendingSeq: ShallowRef<number | null>;
  hasMoreBefore: ShallowRef<boolean>;
  hasMoreAfter: ShallowRef<boolean>;
  loadingNewer: ShallowRef<boolean>;
  fetchNewer(opts?: { pages?: number; beforeMerge?: () => void | Promise<void> }): Promise<{ ok: boolean; drained: boolean; added: number }>;
  loadingOlder: ShallowRef<boolean>;
  loadingInitial: ShallowRef<boolean>;
  error: ShallowRef<any>;
  phase: ComputedRef<string>;
  open(id: string): Promise<void>;
  close(): void;
  reload(): Promise<void>;
  send(text: string, attachments: any[]): Promise<string | null>;
  interrupt(): Promise<void>;
  loadOlder(opts?: { beforeMerge?: () => void | Promise<void> }): Promise<boolean>;
  locate(id: string, seq: number): Promise<boolean>;
  jumpToLatest(): Promise<boolean>;
  getDraft(id?: string): string;
  setDraft(text: string, id?: string): void;
  reloadCapabilities(): Promise<void>;
  refreshDeliveries(): Promise<void>;
  cancelLocate(): void;
  clearPendingSeq(): void;
}
export declare const chat: ChatApi;

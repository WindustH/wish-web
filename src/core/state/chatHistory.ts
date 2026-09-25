// Paged history owns its request generation independently of live execution.
// Replacing the window invalidates both response writes and loading finalizers.
import { shallowRef, type ShallowRef } from 'vue';
import { mergeHistory } from './mergeHistory.ts';
import { cfg } from '../config.ts';

export interface HistoryRequestOptions { signal?: AbortSignal }
export interface HistoryPageParams { before?: number | null; after?: number; limit: number; order: 'asc' | 'desc' }
export interface FetchNewerResult { ok: boolean; drained: boolean; added: number }
export interface HistoryMergeOptions { beforeMerge?: () => void | Promise<void> }

export interface ChatHistoryDeps<E> {
  sessionId: ShallowRef<string | null>;
  error: ShallowRef<unknown>;
  options: () => HistoryRequestOptions;
  open: (id: string) => Promise<void>;
  readPage: (id: string, params: HistoryPageParams, opts: HistoryRequestOptions) => Promise<{ items: E[]; has_more: boolean }>;
}

export function createChatHistory<E extends { seq: number }>({ sessionId, error, options, open, readPage }: ChatHistoryDeps<E>) {
  const entries = shallowRef<E[]>([]);
  const oldestSeq = shallowRef<number | null>(null);
  const newestSeq = shallowRef<number | null>(null);
  const historyVersion = shallowRef(0);
  const hasMoreBefore = shallowRef(false);
  const hasMoreAfter = shallowRef(false);
  const pendingSeq = shallowRef<number | null>(null);
  const loadingOlder = shallowRef(false);
  const loadingNewer = shallowRef(false);
  const locating = shallowRef(false);

  let generation = 0;
  let viewingPast = false;
  const current = (own: number) => own === generation;
  function invalidate() {
    generation++;
    loadingOlder.value = false;
    loadingNewer.value = false;
    locating.value = false;
  }
  function merge(items: E[]) {
    if (!items.length) return;
    entries.value = mergeHistory(entries.value, items);
    bounds();
  }

  function bounds() {
    oldestSeq.value = entries.value[0]?.seq ?? null;
    newestSeq.value = entries.value.at(-1)?.seq ?? null;
    historyVersion.value++;
  }

  async function loadOlder({ beforeMerge }: HistoryMergeOptions = {}): Promise<boolean> {
    if (locating.value || loadingOlder.value || !hasMoreBefore.value || !sessionId.value) return false;

    const own = generation;
    const id = sessionId.value;
    loadingOlder.value = true;

    try {
      const page = await readPage(
        id,
        { before: oldestSeq.value, limit: cfg.history.pageSize, order: 'desc' },
        options()
      );
      if (!current(own)) return false;

      await beforeMerge?.();
      if (!current(own)) return false;

      merge(page.items);
      hasMoreBefore.value = page.has_more;
      return true;
    } catch (cause) {
      if (current(own)) error.value = cause;
      return false;
    } finally {
      if (current(own)) loadingOlder.value = false;
    }
  }

  async function fetchNewer({ pages = cfg.history.maxDrainPages, beforeMerge }: HistoryMergeOptions & { pages?: number } = {}): Promise<FetchNewerResult> {
    if (!sessionId.value || loadingNewer.value || locating.value) {
      return { ok: false, drained: false, added: 0 };
    }

    const own = generation;
    const id = sessionId.value;
    loadingNewer.value = true;
    let added = 0;

    try {
      for (let n = 0; n < pages; n++) {
        const page = await readPage(
          id,
          { after: newestSeq.value ?? 0, limit: cfg.history.pageSize, order: 'asc' },
          options()
        );
        if (!current(own)) return { ok: false, drained: false, added };

        await beforeMerge?.();
        if (!current(own)) return { ok: false, drained: false, added };

        const before = entries.value.length;
        merge(page.items);
        added += entries.value.length - before;
        hasMoreAfter.value = page.has_more;
        if (!page.has_more) return { ok: true, drained: true, added };
      }
      return { ok: true, drained: false, added };
    } catch (cause) {
      if (current(own)) error.value = cause;
      return { ok: false, drained: false, added };
    } finally {
      if (current(own)) loadingNewer.value = false;
    }
  }

  async function locate(id: string, seq: number): Promise<boolean> {
    if (sessionId.value !== id) await open(id);
    if (sessionId.value !== id) return false;

    invalidate();
    const own = generation;
    viewingPast = true;
    locating.value = true;

    try {
      const [before, after] = await Promise.all([
        readPage(id, { before: seq, order: 'desc', limit: cfg.history.pageSize }, options()),
        readPage(id, { after: seq - 1, order: 'asc', limit: cfg.history.pageSize }, options()),
      ]);
      if (!current(own)) return false;

      entries.value = [...before.items.reverse(), ...after.items];
      bounds();
      hasMoreBefore.value = before.has_more;
      hasMoreAfter.value = after.has_more;
      pendingSeq.value = seq;
      return entries.value.some((e) => e.seq === seq);
    } catch (cause) {
      if (current(own)) error.value = cause;
      return false;
    } finally {
      if (current(own)) locating.value = false;
    }
  }

  async function jumpToLatest(): Promise<boolean> {
    invalidate();
    const own = generation;
    const id = sessionId.value;
    if (!id) return false;
    locating.value = true;

    try {
      const page = await readPage(id, { order: 'desc', limit: cfg.history.pageSize }, options());
      if (!current(own)) return false;

      entries.value = page.items.reverse();
      bounds();
      hasMoreBefore.value = page.has_more;
      hasMoreAfter.value = false;
      viewingPast = false;
      pendingSeq.value = null;
      return true;
    } catch (cause) {
      if (current(own)) error.value = cause;
      return false;
    } finally {
      if (current(own)) locating.value = false;
    }
  }

  function cancelLocate() {
    invalidate();
  }

  function clearPendingSeq() {
    pendingSeq.value = null;
  }


  return {
    entries, oldestSeq, newestSeq, historyVersion, hasMoreBefore, hasMoreAfter,
    pendingSeq, loadingOlder, loadingNewer, locating, bounds,
    loadOlder, fetchNewer, locate, jumpToLatest, cancelLocate, clearPendingSeq,
    invalidate, resume: () => { viewingPast = false; }, viewingPast: () => viewingPast,
  };
}

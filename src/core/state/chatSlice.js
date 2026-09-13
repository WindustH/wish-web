// Conversation slice. Owns: session snapshot, windowed canonical history
// (/history keyset pages), delivery/run streaming state, optimistic user
// entries, and the reconcile loop that makes durable history authoritative
// after every turn.
//
// Lifecycle: one EPOCH per open(id). Every async path captures the epoch and
// discards results when stale; teardown aborts the epoch's AbortController,
// cancelling all in-flight fetches. "stale()" is the only cross-session check.
//
// Streaming honesty rules (review round 1):
//  · response_complete is a HINT — the turn is finalized only when history
//    drained (has_more exhausted), no optimistic echo is pending, AND the
//    run/delivery/snapshot confirm terminal state via API;
//  · tool rounds and retries therefore continue streaming;
//  · a gone (404/410) delivery stream may hop ONCE to its run stream; a gone
//    run stream is settled from durable state, never re-attached blindly;
//  · denied (401/403) surfaces an error and stops — never retried.
import { cfg } from '../config.js';
import { uploadAttachments } from '../attachments.js';
import { bus } from '../bus.js';
import { shallowRef, computed } from 'vue';
import { createSse } from '../api/sse.js';
import { absUrl } from '../api/client.js';
import { debounce } from '../util/fmt.js';
import { platform } from '../../platform/index.js';
import * as api from '../api/endpoints.js';

const EMPTY_STREAM = () => ({
  active: false, phase: 'idle', activity: 'working',   // idle|pending|streaming|finalizing
  deliveryId: null, runId: null, model: null,
  text: '', reasoning: '', toolCalls: {}, currentTool: null, usage: null, committedEntryId: null,
  gap: false, error: null, startedAt: 0,
});

// Terminal vocabularies VERIFIED against wish source (no guessing):
//  · DeliveryState (crates/wish-domain/src/state.rs, snake_case):
//      queued | batch_reserved | processing | consumed | cancelled | failed
//  · RunRecord.state writers (crates/wish-store/src/{queue,recovery,interrupt}.rs):
//      running | canceling | aborted | completed (+ finish_run_tx terminal_state)
const RUN_ACTIVE = ['running', 'canceling', 'queued'];
const DELIVERY_ACTIVE = ['queued', 'batch_reserved', 'processing'];
const GONE = 'gone';      // SSE 404/410 — resource no longer exists
const DENIED = 'denied';  // SSE 401/403 — auth failure, never retried

export const chat = (() => {
  const sessionId = shallowRef(null);
  const snapshot = shallowRef(null);
  const entries = shallowRef([]);
  const oldestSeq = shallowRef(null);
  const newestSeq = shallowRef(null);
  const hasMoreBefore = shallowRef(false);
  const hasMoreAfter = shallowRef(false);    // resident tail is behind the live head
  const loadingOlder = shallowRef(false);
  const loadingInitial = shallowRef(false);
  const locating = shallowRef(false);
  const loadingNewer = shallowRef(false);
  const historyVersion = shallowRef(0);
  const error = shallowRef(null);
  const stream = shallowRef(EMPTY_STREAM());
  const sending = shallowRef(false);
  const sentRun = shallowRef(null);
  // Session capabilities (contract). null = not loaded yet.
  // {status:'ok', data} | {status:'error'} — API failure is NEVER presented as
  // "model cannot do X"; only an explicit modality list may gate the UI.
  // data.input_modalities === null means genuinely unknown → let the server
  // validate on send (unknown ≠ unsupported).
  const capabilities = shallowRef(null);
  const pendingSeq = shallowRef(null);     // locate() target: chat log scrolls to [data-seq] once resident
  const deliveries = shallowRef([]);

  let sse = null;
  let attached = null;                  // {kind:'delivery'|'run', id}
  const deadStreams = new Set();        // URLs that returned 404/410/401/403 —
                                        // never re-attached within this lifecycle
  let offSessionSync = null;
  let offDeliverySync = null;
  let reconcileTimer = null;
  let pollTimer = null;
  let pollTickBusy = false;

  let epoch = 0;
  let epochCtrl = null;

  const isActive = computed(() => sessionId.value !== null);
  const phase = computed(() => {
    const snap = snapshot.value;
    if (stream.value?.active) return 'running';
    if (!snap) return 'idle';
    return snap.phase || 'idle';
  });

  function teardown() {
    // Bumping the epoch invalidates EVERY in-flight path at once — late
    // responses (even ones abort could not cancel) find a stale epoch and
    // are discarded (review round-2 #2).
    epoch += 1;
    resetHistoryWork();
    debouncedInvalidate.cancel();
    epochCtrl?.abort(new Error('session closed')); epochCtrl = null;
    stopStream();
    deadStreams.clear();
    offSessionSync?.(); offSessionSync = null;
    offDeliverySync?.(); offDeliverySync = null;
    clearTimeout(reconcileTimer); reconcileTimer = null;
    clearInterval(pollTimer); pollTimer = null;
    pollTickBusy = false;
  }

  function stopStream() {
    sse?.close(); sse = null; attached = null;
  }

  async function open(id) {
    // Idempotent: mounting the same session again (route key remounts when
    // the sheet path changes, e.g. search → chat after a hit jump) must
    // NEVER discard the resident window. The explicit reload path is
    // reload() — used by the error Retry button (round-3 #4 + round-4 C2).
    if (sessionId.value === id && error.value?.status !== 404 && error.value?.status !== 410) return;
    teardown();                       // bumps epoch (invalidates all old paths)
    await openInner(id);
  }

  async function openInner(id) {
    const myEpoch = epoch;
    epochCtrl = new AbortController();
    const sig = epochCtrl.signal;
    const version = historyVersion.value;
    const stale = () => myEpoch !== epoch;
    sessionId.value = id;
    snapshot.value = null; entries.value = [];
    oldestSeq.value = null; newestSeq.value = null;
    hasMoreBefore.value = false; hasMoreAfter.value = false; error.value = null;
    stream.value = EMPTY_STREAM();
    capabilities.value = null;
    pendingSeq.value = null;
    deliveries.value = [];
    // Full self-reset: a stale `sending`/`loadingOlder` from the previous
    // session must never leak into the new one (review round-2 #1).
    sending.value = false;
    loadingOlder.value = false;
    loadingInitial.value = true;
    // Capabilities: read-only context for the composer (image gating).
    reloadCapabilities();
    try {
      const [snap, page] = await Promise.all([
        api.sessionGet(id, { signal: sig }),
        api.historyPage(id, { limit: cfg.history.pageSize, order: 'desc' }, { signal: sig }),
      ]);
      if (stale()) return;
      snapshot.value = snap;
      const tail = (page.items ?? []).slice().reverse();
      if (version === historyVersion.value) applyPage(tail, page.has_more ?? false);
      offSessionSync = (await import('./syncSlice.js')).sync.subscribeSession(id, onSessionSync);
      offDeliverySync = bindDeliverySync();
      refreshDeliveries(id);
      await reattachIfRunning(id);
    } catch (err) {
      if (stale() || err?.name === 'AbortError') return;
      error.value = err;
      if (err?.status === 404 || err?.status === 410) bus.emit('chat.sessionGone', id);
    } finally {
      if (!stale()) loadingInitial.value = false;
    }
  }
  // (end of openInner)

  function close() { teardown(); sessionId.value = null; }

  // Capabilities (contract): one loader, one retry entry point. Failures
  // keep the ApiError for the UI; unknown comes ONLY from a successful
  // response with input_modalities === null (round-3 #4).
  async function reloadCapabilities() {
    const id = sessionId.value;
    if (!id) return;
    const myEpoch = epoch;
    capabilities.value = null;
    try {
      const data = await api.sessionCapabilities(id, { signal: epochCtrl?.signal });
      if (myEpoch === epoch) capabilities.value = { status: 'ok', data };
    } catch (err) {
      if (myEpoch === epoch) capabilities.value = { status: 'error', error: err };
    }
  }

  // Explicit retry for the chat error state: re-run the FULL open path for
  // the current session (open() early-returns on the same id).
  async function reload() {
    const id = sessionId.value;
    if (!id) return;
    teardown();
    await openInner(id);
  }

  // One contiguous resident window. Search replaces it with the target's
  // neighborhood directly; paging extends either boundary without gaps.
  // Versioning rejects responses from a displaced window, even in one session.
  function resetHistoryWork() {
    historyVersion.value += 1;
    loadingOlder.value = false;
    loadingNewer.value = false;
    locating.value = false;
    pendingSeq.value = null;
    return historyVersion.value;
  }

  function replaceHistory(items, moreBefore, moreAfter) {
    entries.value = entries.value.filter(e => e.__optimistic);
    oldestSeq.value = null; newestSeq.value = null;
    mergeItems(items);
    hasMoreBefore.value = moreBefore;
    hasMoreAfter.value = moreAfter;
  }

  async function locate(targetId, seq) {
    if (sessionId.value !== targetId) await open(targetId);
    if (sessionId.value !== targetId) return false;
    const myEpoch = epoch;
    const version = resetHistoryWork();
    error.value = null;
    if (entries.value.some(e => e.seq === seq)) {
      pendingSeq.value = seq;
      return true;
    }
    locating.value = true;
    try {
      const options = { signal: epochCtrl?.signal };
      const [before, after] = await Promise.all([
        api.historyPage(targetId, {before: seq, order: 'desc', limit: cfg.history.pageSize}, options),
        api.historyPage(targetId, {after: seq - 1, order: 'asc', limit: cfg.history.pageSize}, options),
      ]);
      if (myEpoch !== epoch || version !== historyVersion.value) return false;
      if (!after.items.some(e => e.seq === seq)) throw new Error(`History entry #${seq} was not found`);
      pendingSeq.value = seq;
      replaceHistory([...before.items].reverse().concat(after.items), before.has_more, after.has_more);
      return true;
    } catch (err) {
      if (myEpoch === epoch && version === historyVersion.value) error.value = err;
      return false;
    } finally {
      if (myEpoch === epoch && version === historyVersion.value) locating.value = false;
    }
  }

  function cancelLocate() { if (locating.value) resetHistoryWork(); }

  function clearPendingSeq() { pendingSeq.value = null; }

  async function jumpToLatest() {
    const id = sessionId.value;
    if (!id) return false;
    const myEpoch = epoch;
    const version = resetHistoryWork();
    locating.value = true;
    error.value = null;
    try {
      const page = await api.historyPage(id, {order: 'desc', limit: cfg.history.pageSize}, {signal: epochCtrl?.signal});
      if (myEpoch !== epoch || version !== historyVersion.value) return false;
      replaceHistory([...page.items].reverse(), page.has_more, false);
      return true;
    } catch (err) {
      if (myEpoch === epoch && version === historyVersion.value) error.value = err;
      return false;
    } finally {
      if (myEpoch === epoch && version === historyVersion.value) locating.value = false;
    }
  }

  function onSessionSync(evt) {
    const id = sessionId.value;
    if (!id) return;
    if (evt.kind === 'upsert' && evt.body?.id === id) {
      // Sync upserts contain list metadata, not a full session snapshot.
      // Keep the current model/effort until the authoritative read completes.
      debouncedInvalidate();
    } else if (evt.kind === 'invalidate' || evt.kind === 'snapshot') {
      // 'snapshot' = authoritative reset (reconnect / cursor reset): re-read
      // snapshot + history + live run from the source of truth.
      debouncedInvalidate();
    } else if (evt.kind === 'tombstone') {
      bus.emit('chat.sessionGone', id);
    }
  }

  const debouncedInvalidate = debounce(() => { invalidateLocal(); }, 400);
  async function invalidateLocal() {
    const myEpoch = epoch;
    const id = sessionId.value;
    if (!id) return;
    const sig = epochCtrl?.signal;
    try {
      const snap = await api.sessionGet(id, { signal: sig });
      if (myEpoch !== epoch) return;
      if ((snapshot.value?.revision ?? 0) <= snap.revision) {
        snapshot.value = snap;
      }
    } catch (err) {
      if (myEpoch === epoch) {
        error.value = err;
        if (err?.status === 404 || err?.status === 410) bus.emit('chat.sessionGone', id);
      }
    }
    await fetchNewer();
    if (myEpoch !== epoch) return;
    await reattachIfRunning(id);
  }

  // ── history paging & merge ─────────────────────────────────────────────
  const entryKey = (e) => {
    if (e.seq != null) return `s${e.seq}`;
    if (e.localId) return `o${e.localId}`;
    throw new Error('chat entry has no canonical seq or optimistic id');
  };

  function settleStreamEcho() {
    const s = stream.value;
    if (s.committedEntryId && entries.value.some(entry => entry.id === s.committedEntryId)) {
      stream.value = { ...s, text: '', reasoning: '', toolCalls: {}, usage: null, committedEntryId: null };
    }
  }

  function mergeItems(fresh) {
    if (!fresh.length) return 0;
    const cur = entries.value;
    const byKey = new Map(cur.map((e) => [entryKey(e), e]));
    const freshDeliveryIds = new Set(fresh.map((e) => e.delivery_id).filter(Boolean));
    for (const [k, e] of byKey) {
      if (e.__optimistic && e.deliveryId && freshDeliveryIds.has(e.deliveryId)) byKey.delete(k);
    }
    for (const e of fresh) byKey.set(entryKey(e), e);
    const merged = [...byKey.values()].sort((a, b) => sortKey(a) - sortKey(b));
    entries.value = merged;
    seedQueueTexts(fresh);
    settleStreamEcho();
    const seqs = merged.map((e) => e.seq).filter((s) => s != null);
    if (seqs.length) {
      const lo = Math.min(...seqs), hi = Math.max(...seqs);
      if (oldestSeq.value == null || lo < oldestSeq.value) oldestSeq.value = lo;
      if (newestSeq.value == null || hi > newestSeq.value) newestSeq.value = hi;
    }
    return fresh.length;
  }

  function applyPage(ascItems, moreBefore) {
    if (!ascItems.length) {
      hasMoreBefore.value = moreBefore;
      return;
    }
    mergeItems(ascItems);
    hasMoreBefore.value = moreBefore;
  }

  async function loadOlder({ beforeMerge } = {}) {
    const id = sessionId.value;
    const myEpoch = epoch;
    const version = historyVersion.value;
    const current = () => myEpoch === epoch && version === historyVersion.value;
    if (!id || locating.value || loadingOlder.value || oldestSeq.value == null || !hasMoreBefore.value) return false;
    loadingOlder.value = true;
    try {
      const page = await api.historyPage(id, {
        limit: cfg.history.pageSize, order: 'desc', before: oldestSeq.value,
      }, { signal: epochCtrl?.signal });
      if (!current()) return false;
      const older = (page.items ?? []).slice().reverse();
      if (older.length) await beforeMerge?.();
      if (!current()) return false;
      applyPage(older, page.has_more ?? false);
      return older.length > 0;
    } catch (err) {
      if (current() && err?.name !== 'AbortError') error.value = err;
      return false;
    }
    finally { if (current()) loadingOlder.value = false; }
  }

  // Drain newer pages. "drained" means the cursor reached the live head
  // (has_more exhausted) — hitting the page cap or a stalled cursor means
  // there may STILL be more durable entries, which must not be reported as
  // an up-to-date read (review #5).
  async function fetchNewer({pages = cfg.history.maxDrainPages, beforeMerge} = {}) {
    const myEpoch = epoch;
    const sig = epochCtrl?.signal;
    const version = historyVersion.value;
    const current = () => myEpoch === epoch && version === historyVersion.value;
    if (locating.value || loadingNewer.value) return {ok: false, drained: false, added: 0};
    loadingNewer.value = true;
    let added = 0;
    try {
      for (let i = 0; i < pages; i++) {
        const id = sessionId.value;
        if (!id) return { ok: false, drained: false, added };
        const after = newestSeq.value;
        const page = await api.historyPage(id, {
          limit: cfg.history.pageSize, order: 'asc', ...(after != null ? { after } : {}),
        }, { signal: sig });
        if (!current()) return { ok: false, drained: false, added };
        const fresh = page.items ?? [];
        if (!fresh.length) { hasMoreAfter.value = false; return { ok: true, drained: true, added }; }
        await beforeMerge?.();
        if (!current()) return { ok: false, drained: false, added };
        added += mergeItems(fresh);
        if (!page.has_more) { hasMoreAfter.value = false; return { ok: true, drained: true, added }; }
        if (newestSeq.value === after) { hasMoreAfter.value = true; return { ok: true, drained: false, added }; }
      }
      hasMoreAfter.value = true;                    // page-cap burst exhausted
      return { ok: true, drained: false, added };
    } catch (err) {
      if (current()) { hasMoreAfter.value = true; error.value = err; }
      return { ok: false, drained: false, added };
    } finally { if (current()) loadingNewer.value = false; }
  }

  function sortKey(e) { return e.seq != null ? e.seq : Number.MAX_SAFE_INTEGER - (e.localKey || 0); }

  // Remove optimistic shadows whose durable echo (same delivery_id) is
  // already resident — this can happen when sync/history lands the durable
  // row BEFORE the POST /messages receipt arrives (review round-2 #4).
  function settleOptimistic() {
    const cur = entries.value;
    const durableIds = new Set(cur.filter((e) => !e.__optimistic && e.delivery_id).map((e) => e.delivery_id));
    if (!durableIds.size) return;
    const kept = cur.filter((e) => !(e.__optimistic && e.deliveryId && durableIds.has(e.deliveryId)));
    if (kept.length !== cur.length) entries.value = kept;
  }

  // ── sending & streaming ────────────────────────────────────────────────
  async function send(text, attachments = []) {
    const id = sessionId.value;
    if (!id) throw new Error('no active session');
    if (sending.value) throw new Error('send already in flight');
    const myEpoch = epoch;
    const sig = epochCtrl?.signal;
    sending.value = true;
    let optimistic = null;
    try {
      // Upload belongs to this session epoch; failure retains the whole draft.
      const { blocks, uploaded } = await uploadAttachments(id, attachments, {
        signal: sig,
        capabilities: capabilities.value?.status === 'ok' ? capabilities.value.data : undefined,
      });
      if (myEpoch !== epoch) return null;

      // A running loop consumes a new message at its next completed turn
      // boundary, and the durable user entry is written atomically at
      // enqueue: queue it (dock lists it), pull the entry into the log, and
      // leave the live run's stream untouched.
      if (stream.value.active) {
        const d = await api.messageSend(id, {
          content: text, ...(blocks.length ? { blocks } : {}),
        }, { signal: sig });
        if (myEpoch !== epoch) return null;
        const deliveryId = d.resource_id ?? d.id;
        sentRun.value = { sessionId: id, deliveryId };
        applyDeliveryUpsert({ id: deliveryId, target_session_id: id, state: 'queued',
          enqueue_seq: d.enqueue_seq, text });
        void fetchNewer();
        return deliveryId;
      }

      // A new message belongs at the live tail, even when the reader came
      // here through an old search result. Keep that history range contiguous.
      if (hasMoreAfter.value || locating.value) {
        const ready = await jumpToLatest();
        if (myEpoch !== epoch) return null;
        if (!ready) throw error.value || new Error('Could not load latest history');
      }
      const localKey = Date.now();
      optimistic = {
        __optimistic: true, localId: `opt-${localKey}`, localKey,
        seq: null, kind: 'user_message', deliveryId: null,
        created_at: new Date().toISOString(),
        payload: { role: 'user', content: [{ type: 'text', text }],
          ...(uploaded.length ? { __attachments: uploaded } : {}) },
      };
      if (myEpoch !== epoch) return null;
      entries.value = [...entries.value, optimistic];

      stream.value = { ...EMPTY_STREAM(), active: true, phase: 'pending', startedAt: Date.now() };
      startPollSafety();

      const d = await api.messageSend(id, {
        content: text, ...(blocks.length ? { blocks } : {}),
      }, { signal: sig });
      if (myEpoch !== epoch) return null;
      const deliveryId = d.resource_id ?? d.id;
      sentRun.value = { sessionId: id, deliveryId };
      optimistic.deliveryId = deliveryId;
      settleOptimistic();               // durable echo may already be resident
      stream.value = { ...stream.value, deliveryId };
      attachDelivery(deliveryId);
      refreshDeliveries(id);
      return deliveryId;
    } catch (err) {
      if (myEpoch !== epoch) return null;
      if (optimistic) entries.value = entries.value.filter((e) => e !== optimistic);
      stream.value = { ...stream.value, active: false, phase: 'idle', error: String(err?.detail || err?.message || err) };
      stopPollSafety();
      throw err;
    } finally {
      if (myEpoch === epoch) sending.value = false;
    }
  }

  // One URL construction site: absUrl() is applied EXACTLY ONCE here (review
  // #2 — double concat produced http://host/apihttp://host/api/...).
  function streamUrl(kind, id, afterId = '') {
    const u = new URL(absUrl(`/${kind === 'run' ? 'runs' : 'deliveries'}/${id}/events`));
    if (afterId) u.searchParams.set('after', afterId);
    return u.href;
  }

  function attachDelivery(deliveryId, afterId = '') {
    startStream('delivery', deliveryId, streamUrl('delivery', deliveryId, afterId),
      (f) => handleStreamFrame(deliveryId, f));
  }

  function attachRun(runId, afterId = '') {
    const ok = startStream('run', runId, streamUrl('run', runId, afterId),
      (f) => handleStreamFrame(null, f));
    stream.value = { ...stream.value, runId, active: true, ...(ok ? { phase: 'streaming' } : {}) };
    return ok;
  }

  function startStream(kind, id, url, onFrame) {
    stopStream();
    if (deadStreams.has(url)) {
      // This exact stream already proved terminal (404/410/401/403). Settle
      // from durable state via poll safety instead of looping (review r2).
      attached = null;
      return false;
    }
    attached = { kind, id };
    sse = createSse({
      url,
      onFrame,
      onState: ({ state: st, err }) => onStreamState(kind, id, st, err, url),
    });
    return true;
  }

  function onStreamState(kind, id, st, err, url) {
    if (st !== GONE && st !== DENIED && st !== 'disabled') return;
    const s = stream.value;
    if (url) deadStreams.add(url);
    if (st === 'disabled') {
      stopStream();
      stream.value = { ...s, phase: 'pending' };
      scheduleReconcile();
      return;
    }
    if (st === DENIED) {
      // Auth failure: never retried, surfaced honestly.
      stopStream();
      stream.value = { ...s, active: false, phase: 'idle',
        error: `stream denied: ${err?.status ?? ''} ${err?.message ?? ''}`.trim() };
      stopPollSafety();
      return;
    }
    // GONE (404/410): hop delivery→run at most once; a gone run is settled
    // from durable state via reconcile — never re-attach a dead URL (review #4).
    sse = null; attached = null;
    if (kind === 'delivery' && s.runId) {
      attachRun(s.runId);
      return;
    }
    scheduleReconcile();
  }

  function handleStreamFrame(deliveryId, frame) {
    let data = frame.data ? JSON.parse(frame.data) : {};
    const s = stream.value;
    if (s.gap && frame.event !== 'stream_gap') stream.value = { ...s, gap: false };
    switch (frame.event) {
      case 'stream_disabled': {
        const source = attached;
        if (source) onStreamState(source.kind, source.id, 'disabled', null, streamUrl(source.kind, source.id));
        break;
      }
      case 'resource':
        if (data.run_id && !s.runId) stream.value = { ...s, runId: data.run_id };
        break;
      case 'response_start':
        stream.value = { ...s, phase: 'streaming', activity: 'working', text: '', reasoning: '', toolCalls: {}, usage: null, committedEntryId: null, currentTool: null, model: data.model ?? s.model };
        break;
      case 'response_text_delta':
        stream.value = { ...s, phase: 'streaming', activity: 'writing', currentTool: null, text: cap(s.text + (data.delta ?? '')) };
        break;
      case 'response_reasoning_summary_delta':
        stream.value = { ...s, phase: 'streaming', activity: 'thinking', reasoning: cap(s.reasoning + (data.delta ?? '')), currentTool: null };
        break;
      case 'response_tool_call_delta': {
        const tc = { ...(s.toolCalls || {}) };
        const cur = tc[data.tool_call_id] || { name: data.tool_name, args: '' };
        tc[data.tool_call_id] = { name: data.tool_name ?? cur.name, args: cur.args + (data.json_delta ?? '') };
        stream.value = { ...s, phase: 'streaming', activity: 'tool', toolCalls: tc, currentTool: tc[data.tool_call_id].name || 'tool' };
        break;
      }
      case 'response_usage':
        stream.value = { ...s, usage: data.usage ?? s.usage };
        break;
      case 'response_retry':
        stream.value = { ...s, phase: 'streaming', activity: 'retrying', text: '', reasoning: '', toolCalls: {}, usage: null, committedEntryId: null, currentTool: null };
        break;
      case 'response_error':
        stream.value = { ...s, error: `${data.code ?? 'error'}: ${data.message ?? ''}` };
        scheduleReconcile();
        break;
      case 'stream_gap':
        stream.value = { ...s, gap: true };
        fetchNewer();
        break;
      case 'response_complete':
        stream.value = { ...s, phase: 'finalizing', committedEntryId: data.entry_id };
        settleStreamEcho();
        scheduleReconcile();
        break;
      default:
        break;
    }
  }

  function scheduleReconcile() {
    clearTimeout(reconcileTimer);
    reconcileTimer = setTimeout(reconcile, cfg.history.reconcileDelayMs);
  }

  async function reconcile() {
    const myEpoch = epoch;
    const id = sessionId.value;
    if (!id) return;
    const res = await fetchNewer();
    if (myEpoch !== epoch) return;
    try {
      const snap = await api.sessionGet(id, { signal: epochCtrl?.signal });
      if (myEpoch !== epoch) return;
      snapshot.value = snap;
    } catch (err) {
      if (myEpoch === epoch) error.value = err;
    }
    refreshDeliveries(id);

    const s = stream.value;
    if (!s.active) { finalize(); return; }

    // Failed read, or a read that provably hasn't reached the live head:
    // NEVER finalize (review #5) — keep observing via poll safety.
    if (!res.ok || !res.drained) {
      if (s.phase === 'finalizing') stream.value = { ...s, phase: 'streaming' };
      ensureObserving();
      return;
    }

    settleOptimistic();
    const pendingEcho = entries.value.some((e) => e.__optimistic);
    const stillActive = await turnStillActive(id, s);
    if (myEpoch !== epoch) return;

    if (pendingEcho || stillActive) {
      if (s.phase === 'finalizing') stream.value = { ...s, phase: 'streaming' };
      ensureObserving();
      return;
    }
    finalize();
  }

  // If the turn is still live but the stream died (server end, gone hop
  // exhausted), re-attach to the newest live run reported by the API.
  async function ensureObserving() {
    if (sse) return;
    const id = sessionId.value;
    if (!id || !stream.value.active) return;
    await reattachIfRunning(id, { force: true });
  }

  // Real liveness of the observed turn from durable API state. Only
  // definitive "resource gone" (404/410) counts as terminal; network/5xx
  // errors mean UNKNOWN → keep observing (review #5).
  async function turnStillActive(id, s) {
    const snap = snapshot.value;
    if (snap && (snap.phase === 'running' || (snap.queue ?? 0) > 0)) return true;
    if (s.runId) {
      const r = await resourceState(api.runGet, s.runId, RUN_ACTIVE);
      if (r !== 'terminal') return true;   // active or unknown → keep watching
    }
    if (s.deliveryId) {
      const d = await resourceState(api.deliveryGet, s.deliveryId, DELIVERY_ACTIVE);
      if (d !== 'terminal') return true;
    }
    return false;
  }

  async function resourceState(getFn, id, activeSet) {
    try {
      const body = await getFn(id, { signal: epochCtrl?.signal });
      const st = String(body?.state ?? body?.status ?? body?.outcome ?? '').toLowerCase();
      if (!st) return 'unknown';
      return activeSet.includes(st) ? 'active' : 'terminal';
    } catch (err) {
      if (err?.status === 404 || err?.status === 410) return 'terminal';
      return 'unknown';   // network/5xx: cannot confirm — never fake terminal
    }
  }

  function finalize() {
    stream.value = EMPTY_STREAM();
    stopPollSafety();
    stopStream();
  }

  function startPollSafety() {
    clearInterval(pollTimer);
    pollTimer = setInterval(pollTick, Math.max(2_000, cfg.sync.pollFallbackMs));
  }
  function stopPollSafety() { clearInterval(pollTimer); pollTimer = null; }
  async function pollTick() {
    const id = sessionId.value;
    if (!id || !stream.value.active || pollTickBusy) { if (!stream.value.active) stopPollSafety(); return; }
    pollTickBusy = true;
    try { await reconcile(); } finally { pollTickBusy = false; }
  }

  // Attach to the session's live run. Sole authoritative source: the
  // snapshot field `active_run_id` (backend-derived from the running/
  // canceling run). The runs list is fixed to the earliest 200 and ignores
  // ordering queries, so scanning it can never identify the live run — we
  // do not scan it at all.
  async function reattachIfRunning(id, { force = false } = {}) {
    const myEpoch = epoch;
    try {
      const snap = snapshot.value;
      if (!force && (!snap || (snap.phase !== 'running' && (snap.queue ?? 0) === 0))) return;
      if (!force && stream.value.active) return;
      const runId = typeof snap?.active_run_id === 'string' && snap.active_run_id ? snap.active_run_id : null;
      if (!runId) {
        // Unknown which run is live: show the running phase honestly and
        // keep waiting on the control plane (poll safety still reconciles).
        if (!stream.value.active) {
          stream.value = { ...EMPTY_STREAM(), active: true, phase: 'streaming', startedAt: Date.now() };
          startPollSafety();
        }
        return;
      }
      if (stream.value.active && attached?.id === runId) return;
      const alive = attachRun(runId);   // false → poll-only observation
      if (!alive) { startPollSafety(); return; }   // known-dead URL: poll only
      startPollSafety();
    } catch (err) {
      if (myEpoch === epoch) error.value = err;
    }
  }

  // ── pending queue (dock) ────────────────────────────────────────────────
  // deliveries holds the open session's QUEUED items in enqueue order; the
  // protocol writes each queued message's durable entry at enqueue, so its
  // text is joined from history and kept on the item (survives reloads and
  // history-window moves). Control-plane delivery upserts keep the list
  // live — enqueue, cancel and turn-boundary consumption — without polling.
  function bindDeliverySync() {
    const offs = [
      bus.on('upsert.delivery', (u) => applyDeliveryUpsert(u.body)),
      bus.on('tombstone.delivery', (t) => {
        if (deliveries.value.some((d) => d.id === t.id)) {
          deliveries.value = deliveries.value.filter((d) => d.id !== t.id);
        }
      }),
    ];
    return () => { for (const off of offs) off(); };
  }

  function applyDeliveryUpsert(body) {
    const id = sessionId.value;
    if (!id || body?.target_session_id !== id) return;
    const prev = deliveries.value;
    const known = prev.find((d) => d.id === body.id);
    const kept = prev.filter((d) => d.id !== body.id);
    if (body.state !== 'queued') {
      if (known) deliveries.value = kept;
      return;
    }
    const item = { ...body, text: body.text ?? known?.text ?? '' };
    deliveries.value = [...kept, item].sort((a, b) => a.enqueue_seq - b.enqueue_seq);
  }

  function entryText(e) {
    return (e.payload?.content ?? []).filter((b) => b.type === 'text').map((b) => b.text ?? '').join('\n');
  }

  // The queue item's own entry arriving in a history page is the durable
  // source of its display text.
  function seedQueueTexts(fresh) {
    if (!deliveries.value.length || !fresh.length) return;
    let changed = false;
    const next = deliveries.value.map((d) => {
      if (d.text) return d;
      const e = fresh.find((x) => x.delivery_id === d.id);
      if (!e) return d;
      changed = true;
      return { ...d, text: entryText(e) };
    });
    if (changed) deliveries.value = next;
  }

  // Cancel one queued delivery (dock remove, or edit's take-back). Returns
  // false when it had already left the queue (consumed by the running loop).
  async function cancelQueued(deliveryId) {
    const myEpoch = epoch;
    let cancelled = true;
    try {
      await api.deliveryCancel(deliveryId);
    } catch (err) {
      if (err?.status !== 409) throw err;
      cancelled = false;
    }
    if (myEpoch !== epoch) return cancelled;
    if (deliveries.value.some((d) => d.id === deliveryId)) {
      deliveries.value = deliveries.value.filter((d) => d.id !== deliveryId);
    }
    return cancelled;
  }

  async function refreshDeliveries(id) {
    const myEpoch = epoch;
    try {
      const page = await api.deliveriesList(id, { state: 'queued', limit: 20 }, { signal: epochCtrl?.signal });
      if (myEpoch !== epoch) return;
      const known = new Map(deliveries.value.map((d) => [d.id, d.text]));
      const resident = new Map(entries.value.filter((e) => e.delivery_id).map((e) => [e.delivery_id, entryText(e)]));
      deliveries.value = (page.items ?? [])
        .map((d) => ({ ...d, text: known.get(d.id) ?? resident.get(d.id) ?? '' }))
        .sort((a, b) => a.enqueue_seq - b.enqueue_seq);
    } catch (err) {
      if (myEpoch === epoch) error.value = err;
    }
  }

  async function interrupt() {
    const id = sessionId.value;
    if (!id) return;
    const s = stream.value;
    try {
      if (s.deliveryId && s.phase === 'pending') await api.deliveryCancel(s.deliveryId);
      else await api.sessionInterrupt(id);
    } finally {
      scheduleReconcile();
    }
  }

  // ── drafts: per-device, per-session. The storage adapter IS the draft
  //    source (no second cache); an empty draft deletes the stored key.
  //    Attachment object URLs are not persisted (round-4 #1 / round-5). ──
  const draftKey = (id) => `draft.${id}`;
  function setDraft(text, id = sessionId.value) {
    if (!id) return;
    const store = platform('storage');
    if (text) store.set(draftKey(id), text);
    else store.remove(draftKey(id));
  }
  function getDraft(id = sessionId.value) {
    if (!id) return '';
    return platform('storage').get(draftKey(id)) ?? '';
  }

  return {
    sessionId, snapshot, entries, oldestSeq, newestSeq, hasMoreBefore, hasMoreAfter,
    loadingOlder, loadingNewer, loadingInitial, locating, historyVersion, error, stream, sending, sentRun, capabilities,
    pendingSeq, deliveries, phase, isActive,
    open, close, reload, reloadCapabilities, jumpToLatest, loadOlder, fetchNewer,
    send, interrupt, refreshDeliveries, cancelQueued,
    setDraft, getDraft, locate, cancelLocate, clearPendingSeq,
  };
})();

function cap(text) { return text.length > cfg.sse.maxBufferedChars ? text.slice(0, cfg.sse.maxBufferedChars) : text; }

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
import { bus } from '../bus.js';
import { signal, derive } from './reactive.js';
import { createSse } from '../api/sse.js';
import { absUrl } from '../api/client.js';
import { debounce } from '../util/fmt.js';
import { platform } from '../../platform/index.js';
import * as api from '../api/endpoints.js';

const EMPTY_STREAM = () => ({
  active: false, phase: 'idle',   // idle|pending|streaming|finalizing
  deliveryId: null, runId: null, model: null,
  text: '', reasoning: '', toolCalls: {}, usage: null,
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
  const sessionId = signal(null);
  const snapshot = signal(null);
  const entries = signal([]);
  const oldestSeq = signal(null);
  const newestSeq = signal(null);
  const hasMoreBefore = signal(false);
  const hasMoreAfter = signal(false);    // resident tail is behind the live head
  const loadingOlder = signal(false);
  const loadingInitial = signal(false);
  const error = signal(null);
  const stream = signal(EMPTY_STREAM());
  const sending = signal(false);
  // Session capabilities (contract). null = not loaded yet.
  // {status:'ok', data} | {status:'error'} — API failure is NEVER presented as
  // "model cannot do X"; only an explicit modality list may gate the UI.
  // data.input_modalities === null means genuinely unknown → let the server
  // validate on send (unknown ≠ unsupported).
  const capabilities = signal(null);
  const pendingSeq = signal(null);     // locate() target: chat log scrolls to [data-seq] once resident
  const deliveries = signal([]);

  let sse = null;
  let attached = null;                  // {kind:'delivery'|'run', id}
  const deadStreams = new Set();        // URLs that returned 404/410/401/403 —
                                        // never re-attached within this lifecycle
  let offSessionSync = null;
  let reconcileTimer = null;
  let pollTimer = null;
  let pollTickBusy = false;

  let epoch = 0;
  let epochCtrl = null;

  const isActive = derive(() => sessionId.value !== null);
  const phase = derive(() => {
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
    epochCtrl?.abort(new Error('session closed')); epochCtrl = null;
    stopStream();
    deadStreams.clear();
    offSessionSync?.(); offSessionSync = null;
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
    if (sessionId.peek() === id) return;
    teardown();                       // bumps epoch (invalidates all old paths)
    await openInner(id);
  }

  async function openInner(id) {
    const myEpoch = epoch;
    epochCtrl = new AbortController();
    const sig = epochCtrl.signal;
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
      noteGeneration(snap, { silent: true });   // baseline, no toast
      const tail = (page.items ?? []).slice().reverse();
      applyPage(tail, page.has_more ?? false);
      offSessionSync = (await import('./syncSlice.js')).sync.subscribeSession(id, onSessionSync);
      await reattachIfRunning(id);
    } catch (err) {
      if (stale() || err?.name === 'AbortError') return;
      error.value = err;
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
    const id = sessionId.peek();
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
    const id = sessionId.peek();
    if (!id) return;
    teardown();
    await openInner(id);
  }

  // Bring a target seq into the resident window and flag it for one
  // scroll-into-view. The resident window is ONE CONTIGUOUS seq range:
  // extending it always pages from the current boundary (loadOlder /
  // fetchNewer), so jumping to an old hit can never strand the history
  // between the hit and the previous tail (round-3 #1). Depth-bounded;
  // beyond the bound is an honest failure, never a fake locate.
  async function locate(targetId, seq) {
    if (sessionId.peek() !== targetId) await open(targetId);
    const myEpoch = epoch;
    if (entries.peek().some((e) => e.seq === seq)) {
      pendingSeq.value = seq;
      return true;
    }
    if (oldestSeq.peek() != null && seq < oldestSeq.peek()) {
      let pages = 0;
      while (oldestSeq.peek() > seq && pages < cfg.history.maxLocatePages) {
        const extended = await loadOlder();
        if (myEpoch !== epoch) return false;
        if (!extended) break;            // reached the true beginning
        pages += 1;
      }
      if (myEpoch !== epoch) return false;
      if (oldestSeq.peek() > seq) {
        error.value = new Error(`locate failed: seq ${seq} is deeper than the backfill bound (${cfg.history.maxLocatePages} pages)`);
        return false;
      }
      pendingSeq.value = seq;
      return true;
    }
    // Newer than the resident tail — drain upward.
    const r = await fetchNewer();
    if (myEpoch !== epoch) return false;
    if (!r.ok || newestSeq.peek() == null || newestSeq.peek() < seq) return false;
    pendingSeq.value = seq;
    return true;
  }

  function clearPendingSeq() { pendingSeq.value = null; }

  // After a deep locate the window tail is far behind the live head; this
  // drains upward until caught up (bounded) so "back to latest" is real.
  async function jumpToLatest() {
    const myEpoch = epoch;
    for (let i = 0; i < 100; i++) {
      const r = await fetchNewer();
      if (myEpoch !== epoch) return false;
      if (!r.ok) return false;
      if (r.drained) return true;
      if (r.added === 0) return false;              // no progress — stop
    }
    return false;
  }

  let lastGenerationId = null;

  // A generation cutover (compaction switch) invalidates older context:
  // surface it ONCE per change — never on first open (round-4 #3).
  function noteGeneration(snap, { silent = false } = {}) {
    const gid = snap?.generation_id ?? null;
    if (silent || lastGenerationId == null) {
      lastGenerationId = gid;
      return;
    }
    if (gid != null && gid !== lastGenerationId) {
      lastGenerationId = gid;
      bus.emit('chat.generationChanged', snap.id);
    }
  }

  function onSessionSync(evt) {
    const id = sessionId.peek();
    if (!id) return;
    if (evt.kind === 'upsert' && evt.body?.id === id) {
      noteGeneration(evt.body);
      snapshot.value = evt.body;
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
    const id = sessionId.peek();
    if (!id) return;
    const sig = epochCtrl?.signal;
    try {
      const snap = await api.sessionGet(id, { signal: sig });
      if (myEpoch !== epoch) return;
      snapshot.value = snap;
      noteGeneration(snap);
    } catch (err) {
      if (myEpoch === epoch) error.value = err;
    }
    await fetchNewer();
    if (myEpoch !== epoch) return;
    await reattachIfRunning(id);
  }

  // ── history paging & merge ─────────────────────────────────────────────
  const entryKey = (e) => e.seq != null ? `s${e.seq}` : e.localId ? `o${e.localId}` : `x${e.delivery_id ?? e.id ?? Math.random()}`;

  function mergeItems(fresh) {
    if (!fresh.length) return 0;
    const cur = entries.peek();
    const byKey = new Map(cur.map((e) => [entryKey(e), e]));
    const freshDeliveryIds = new Set(fresh.map((e) => e.delivery_id).filter(Boolean));
    for (const [k, e] of byKey) {
      if (e.__optimistic && e.deliveryId && freshDeliveryIds.has(e.deliveryId)) byKey.delete(k);
    }
    for (const e of fresh) byKey.set(entryKey(e), e);
    const merged = [...byKey.values()].sort((a, b) => sortKey(a) - sortKey(b));
    entries.value = merged;
    const seqs = merged.map((e) => e.seq).filter((s) => s != null);
    if (seqs.length) {
      const lo = Math.min(...seqs), hi = Math.max(...seqs);
      if (oldestSeq.peek() == null || lo < oldestSeq.peek()) oldestSeq.value = lo;
      if (newestSeq.peek() == null || hi > newestSeq.peek()) newestSeq.value = hi;
    }
    return fresh.length;
  }

  function applyPage(ascItems, moreBefore) {
    if (!ascItems.length) {
      hasMoreBefore.value = hasMoreBefore.peek() || moreBefore;
      return;
    }
    mergeItems(ascItems);
    hasMoreBefore.value = moreBefore;
  }

  async function loadOlder() {
    const id = sessionId.peek();
    const myEpoch = epoch;
    if (!id || loadingOlder.peek() || oldestSeq.peek() == null || !hasMoreBefore.peek()) return false;
    loadingOlder.value = true;
    try {
      const page = await api.historyPage(id, {
        limit: cfg.history.pageSize, order: 'desc', before: oldestSeq.peek(),
      }, { signal: epochCtrl?.signal });
      if (myEpoch !== epoch) return false;
      const older = (page.items ?? []).slice().reverse();
      applyPage(older, page.has_more ?? false);
      return older.length > 0;
    } catch (err) {
      if (myEpoch === epoch && err?.name !== 'AbortError') error.value = err;
      return false;
    }
    finally { if (myEpoch === epoch) loadingOlder.value = false; }
  }

  // Drain newer pages. "drained" means the cursor reached the live head
  // (has_more exhausted) — hitting the page cap or a stalled cursor means
  // there may STILL be more durable entries, which must not be reported as
  // an up-to-date read (review #5).
  async function fetchNewer() {
    const myEpoch = epoch;
    const sig = epochCtrl?.signal;
    let added = 0;
    try {
      for (let i = 0; i < cfg.history.maxDrainPages; i++) {
        const id = sessionId.peek();
        if (!id) return { ok: false, drained: false, added };
        const after = newestSeq.peek();
        const page = await api.historyPage(id, {
          limit: cfg.history.pageSize, order: 'asc', ...(after != null ? { after } : {}),
        }, { signal: sig });
        if (myEpoch !== epoch) return { ok: false, drained: false, added };
        const fresh = page.items ?? [];
        if (!fresh.length) { hasMoreAfter.value = false; return { ok: true, drained: true, added }; }
        added += mergeItems(fresh);
        if (!page.has_more) { hasMoreAfter.value = false; return { ok: true, drained: true, added }; }
        if (newestSeq.peek() === after) { hasMoreAfter.value = true; return { ok: true, drained: false, added }; }
      }
      hasMoreAfter.value = true;                    // page-cap burst exhausted
      return { ok: true, drained: false, added };
    } catch (err) {
      hasMoreAfter.value = true;                    // unknown — assume behind
      return { ok: false, drained: false, added };
    }
  }

  function sortKey(e) { return e.seq != null ? e.seq : Number.MAX_SAFE_INTEGER - (e.localKey || 0); }

  // Remove optimistic shadows whose durable echo (same delivery_id) is
  // already resident — this can happen when sync/history lands the durable
  // row BEFORE the POST /messages receipt arrives (review round-2 #4).
  function settleOptimistic() {
    const cur = entries.peek();
    const durableIds = new Set(cur.filter((e) => !e.__optimistic && e.delivery_id).map((e) => e.delivery_id));
    if (!durableIds.size) return;
    const kept = cur.filter((e) => !(e.__optimistic && e.deliveryId && durableIds.has(e.deliveryId)));
    if (kept.length !== cur.length) entries.value = kept;
  }

  // ── sending & streaming ────────────────────────────────────────────────
  async function send(text, images = []) {
    const id = sessionId.peek();
    if (!id) throw new Error('no active session');
    if (sending.peek()) throw new Error('send already in flight');
    if (stream.peek().active) throw new Error('a run is already active');
    const myEpoch = epoch;
    const sig = epochCtrl?.signal;
    sending.value = true;
    let optimistic = null;
    try {
      // Upload images first; failures THROW so the composer keeps the draft
      // and every attachment. Blob upload is per-session by design.
      const blocks = [];
      const uploaded = [];
      for (const img of images.slice(0, cfg.composer.maxImages)) {
        if (img.bytes?.byteLength > cfg.composer.maxImageBytes) {
          throw Object.assign(new Error('image exceeds size limit'), { code: 'image_too_large' });
        }
        const blob = await api.uploadSessionImage(id, img.bytes, img.mime, { signal: sig });
        uploaded.push({ blobId: blob.id ?? blob.sha256, localUrl: img.localUrl, name: img.name });
        blocks.push({ type: 'image', blob_id: blob.id ?? blob.sha256 });
      }

      const localKey = Date.now();
      optimistic = {
        __optimistic: true, localId: `opt-${localKey}`, localKey,
        seq: null, kind: 'user_message', deliveryId: null,
        created_at: new Date().toISOString(),
        payload: { role: 'user', content: [{ type: 'text', text }],
          ...(uploaded.length ? { __images: uploaded } : {}) },
      };
      if (myEpoch !== epoch) return null;
      entries.value = [...entries.peek(), optimistic];

      stream.value = { ...EMPTY_STREAM(), active: true, phase: 'pending', startedAt: Date.now() };
      startPollSafety();

      const d = await api.messageSend(id, {
        content: text, ...(blocks.length ? { blocks } : {}),
      }, { signal: sig });
      if (myEpoch !== epoch) return null;
      const deliveryId = d.resource_id ?? d.id;
      optimistic.deliveryId = deliveryId;
      settleOptimistic();               // durable echo may already be resident
      stream.value = { ...stream.peek(), deliveryId };
      attachDelivery(deliveryId);
      refreshDeliveries(id);
      return deliveryId;
    } catch (err) {
      if (myEpoch !== epoch) return null;
      if (optimistic) entries.value = entries.peek().filter((e) => e !== optimistic);
      stream.value = { ...stream.peek(), active: false, phase: 'idle', error: String(err?.detail || err?.message || err) };
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
    stream.value = { ...stream.peek(), runId, active: true, ...(ok ? { phase: 'streaming' } : {}) };
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
    if (st !== GONE && st !== DENIED) return;
    const s = stream.peek();
    if (url) deadStreams.add(url);
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
    const s = stream.peek();
    if (s.gap && frame.event !== 'stream_gap') stream.value = { ...s, gap: false };
    switch (frame.event) {
      case 'resource':
        if (data.run_id && !s.runId) stream.value = { ...s, runId: data.run_id };
        break;
      case 'response_start':
        stream.value = { ...s, phase: 'streaming', model: data.model ?? s.model };
        break;
      case 'response_text_delta':
        stream.value = { ...s, phase: 'streaming', text: cap(s.text + (data.delta ?? '')) };
        break;
      case 'response_reasoning_summary_delta':
        stream.value = { ...s, phase: 'streaming', reasoning: cap(s.reasoning + (data.delta ?? '')) };
        break;
      case 'response_tool_call_delta': {
        const tc = { ...(s.toolCalls || {}) };
        const cur = tc[data.tool_call_id] || { name: data.tool_name, args: '' };
        tc[data.tool_call_id] = { name: data.tool_name ?? cur.name, args: cur.args + (data.json_delta ?? '') };
        stream.value = { ...s, phase: 'streaming', toolCalls: tc };
        break;
      }
      case 'response_usage':
        stream.value = { ...s, usage: data.usage ?? s.usage };
        break;
      case 'response_retry':
        stream.value = { ...s, phase: 'streaming' };
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
        stream.value = { ...s, phase: 'finalizing' };
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
    const id = sessionId.peek();
    if (!id) return;
    const res = await fetchNewer();
    if (myEpoch !== epoch) return;
    try {
      const snap = await api.sessionGet(id, { signal: epochCtrl?.signal });
      if (myEpoch !== epoch) return;
      snapshot.value = snap;
      noteGeneration(snap);
    } catch (err) {
      if (myEpoch === epoch) error.value = err;
    }
    refreshDeliveries(id);

    const s = stream.peek();
    if (!s.active) { finalize(); return; }

    // Failed read, or a read that provably hasn't reached the live head:
    // NEVER finalize (review #5) — keep observing via poll safety.
    if (!res.ok || !res.drained) {
      if (s.phase === 'finalizing') stream.value = { ...s, phase: 'streaming' };
      ensureObserving();
      return;
    }

    settleOptimistic();
    const pendingEcho = entries.peek().some((e) => e.__optimistic);
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
    const id = sessionId.peek();
    if (!id || !stream.peek().active) return;
    await reattachIfRunning(id, { force: true });
  }

  // Real liveness of the observed turn from durable API state. Only
  // definitive "resource gone" (404/410) counts as terminal; network/5xx
  // errors mean UNKNOWN → keep observing (review #5).
  async function turnStillActive(id, s) {
    const snap = snapshot.peek();
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
    const id = sessionId.peek();
    if (!id || !stream.peek().active || pollTickBusy) { if (!stream.peek().active) stopPollSafety(); return; }
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
      const snap = snapshot.peek();
      if (!force && (!snap || (snap.phase !== 'running' && (snap.queue ?? 0) === 0))) return;
      if (!force && stream.peek().active) return;
      const runId = typeof snap?.active_run_id === 'string' && snap.active_run_id ? snap.active_run_id : null;
      if (!runId) {
        // Unknown which run is live: show the running phase honestly and
        // keep waiting on the control plane (poll safety still reconciles).
        if (!stream.peek().active) {
          stream.value = { ...EMPTY_STREAM(), active: true, phase: 'streaming', startedAt: Date.now() };
          startPollSafety();
        }
        return;
      }
      if (stream.peek().active && attached?.id === runId) return;
      const alive = attachRun(runId);   // false → poll-only observation
      if (!alive) { startPollSafety(); return; }   // known-dead URL: poll only
      startPollSafety();
    } catch (err) {
      if (myEpoch === epoch) error.value = err;
    }
  }

  async function refreshDeliveries(id) {
    const myEpoch = epoch;
    try {
      const page = await api.deliveriesList(id, { limit: 20 }, { signal: epochCtrl?.signal });
      if (myEpoch === epoch) deliveries.value = page.items;
    } catch (err) {
      if (myEpoch === epoch) error.value = err;
    }
  }

  async function interrupt() {
    const id = sessionId.peek();
    if (!id) return;
    const s = stream.peek();
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
  function setDraft(text, id = sessionId.peek()) {
    if (!id) return;
    const store = platform('storage');
    if (text) store.set(draftKey(id), text);
    else store.remove(draftKey(id));
  }
  function getDraft(id = sessionId.peek()) {
    if (!id) return '';
    return platform('storage').get(draftKey(id)) ?? '';
  }

  return {
    sessionId, snapshot, entries, oldestSeq, newestSeq, hasMoreBefore, hasMoreAfter,
    loadingOlder, loadingInitial, error, stream, sending, capabilities,
    pendingSeq, deliveries, phase, isActive,
    open, close, reload, reloadCapabilities, jumpToLatest, loadOlder, fetchNewer,
    send, interrupt, refreshDeliveries,
    setDraft, getDraft, locate, clearPendingSeq,
  };
})();

function cap(text) { return text.length > cfg.sse.maxBufferedChars ? text.slice(0, cfg.sse.maxBufferedChars) : text; }



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
import * as api from '../api/endpoints.js';

const EMPTY_STREAM = () => ({
  active: false, phase: 'idle',   // idle|pending|streaming|finalizing
  deliveryId: null, runId: null, model: null,
  text: '', reasoning: '', toolCalls: {}, usage: null,
  gap: false, error: null, startedAt: 0,
});

const RUN_TERMINAL = ['completed', 'failed', 'canceled', 'cancelled', 'interrupted'];
const DELIVERY_TERMINAL = ['completed', 'failed', 'canceled', 'cancelled', 'delivered'];
const GONE = 'gone';      // SSE 404/410 — resource no longer exists
const DENIED = 'denied';  // SSE 401/403 — auth failure, never retried

export const chat = (() => {
  const sessionId = signal(null);
  const snapshot = signal(null);
  const entries = signal([]);
  const oldestSeq = signal(null);
  const newestSeq = signal(null);
  const hasMoreBefore = signal(false);
  const loadingOlder = signal(false);
  const loadingInitial = signal(false);
  const error = signal(null);
  const stream = signal(EMPTY_STREAM());
  const sending = signal(false);
  const deliveries = signal([]);
  const drafts = new Map();

  let sse = null;
  let attached = null;                  // {kind:'delivery'|'run', id}
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
    epochCtrl?.abort(new Error('session closed')); epochCtrl = null;
    stopStream();
    offSessionSync?.(); offSessionSync = null;
    clearTimeout(reconcileTimer); reconcileTimer = null;
    clearInterval(pollTimer); pollTimer = null;
    pollTickBusy = false;
  }

  function stopStream() {
    sse?.close(); sse = null; attached = null;
  }

  async function open(id) {
    if (sessionId.peek() === id) return;
    teardown();
    const myEpoch = ++epoch;
    epochCtrl = new AbortController();
    const sig = epochCtrl.signal;
    const stale = () => myEpoch !== epoch;
    sessionId.value = id;
    snapshot.value = null; entries.value = [];
    oldestSeq.value = null; newestSeq.value = null;
    hasMoreBefore.value = false; error.value = null;
    stream.value = EMPTY_STREAM();
    deliveries.value = [];
    loadingInitial.value = true;
    try {
      const [snap, page] = await Promise.all([
        api.sessionGet(id, { signal: sig }),
        api.historyPage(id, { limit: cfg.history.pageSize, order: 'desc' }, { signal: sig }),
      ]);
      if (stale()) return;
      snapshot.value = snap;
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

  function close() { teardown(); sessionId.value = null; }

  function onSessionSync(evt) {
    const id = sessionId.peek();
    if (!id) return;
    if (evt.kind === 'upsert' && evt.body?.id === id) {
      snapshot.value = evt.body;
      debouncedInvalidate();
    } else if (evt.kind === 'invalidate') {
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
      if (snap) snapshot.value = snap;
    } catch { /* transient */ }
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
        if (!fresh.length) return { ok: true, drained: true, added };
        added += mergeItems(fresh);
        if (!page.has_more) return { ok: true, drained: true, added };
        if (newestSeq.peek() === after) return { ok: true, drained: false, added };
      }
      return { ok: true, drained: false, added };   // page-cap burst exhausted
    } catch (err) {
      return { ok: false, drained: false, added };
    }
  }

  function sortKey(e) { return e.seq != null ? e.seq : Number.MAX_SAFE_INTEGER - (e.localKey || 0); }

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
      entries.value = entries.peek().slice();
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
    startStream('run', runId, streamUrl('run', runId, afterId),
      (f) => handleStreamFrame(null, f));
    stream.value = { ...stream.peek(), runId, active: true, phase: 'streaming' };
  }

  function startStream(kind, id, url, onFrame) {
    stopStream();
    attached = { kind, id };
    sse = createSse({
      url,
      onFrame,
      onState: ({ state: st, err }) => onStreamState(kind, id, st, err),
    });
  }

  function onStreamState(kind, id, st, err) {
    if (st !== GONE && st !== DENIED) return;
    const s = stream.peek();
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
    let data = null;
    try { data = frame.data ? JSON.parse(frame.data) : {}; } catch { data = {}; }
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
      if (snap) snapshot.value = snap;
    } catch { /* transient */ }
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
      const r = await resourceState(api.runGet, s.runId, RUN_TERMINAL);
      if (r === 'active') return true;
      if (r === 'unknown') return true;
    }
    if (s.deliveryId) {
      const d = await resourceState(api.deliveryGet, s.deliveryId, DELIVERY_TERMINAL);
      if (d === 'active') return true;
      if (d === 'unknown') return true;
    }
    return false;
  }

  async function resourceState(getFn, id, terminalSet) {
    try {
      const body = await getFn(id, { signal: epochCtrl?.signal });
      const st = body?.state ?? body?.status ?? body?.outcome ?? '';
      if (!st) return 'unknown';
      return terminalSet.includes(st) ? 'terminal' : 'active';
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

  // Attach to the session's live run. Preferred source: the contract's
  // snapshot field `active_run_id` (backend-derived from the running/
  // canceling run). Fallback for old daemons: newest non-terminal run in
  // the runs list (bounded to the earliest 200 by the backend — if the live
  // run is not there we simply show the running phase and let the control
  // plane refresh us; we never guess that the first run is the current one).
  async function reattachIfRunning(id, { force = false } = {}) {
    const myEpoch = epoch;
    try {
      const snap = snapshot.peek();
      if (!force && (!snap || (snap.phase !== 'running' && (snap.queue ?? 0) === 0))) return;
      if (!force && stream.peek().active) return;
      let runId = typeof snap?.active_run_id === 'string' && snap.active_run_id ? snap.active_run_id : null;
      if (!runId) {
        const page = await api.sessionRuns(id, {}, { signal: epochCtrl?.signal });
        if (myEpoch !== epoch) return;
        const runs = page.items ?? (Array.isArray(page) ? page : []);
        const live = runs
          .filter((r) => {
            const st = r.state ?? r.status ?? '';
            return st && !RUN_TERMINAL.includes(st);
          })
          .sort((a, b) => String(b.started_at ?? '').localeCompare(String(a.started_at ?? '')));
        runId = live[0]?.id ?? null;
      }
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
      stream.value = { ...EMPTY_STREAM(), active: true, phase: 'streaming', runId, startedAt: Date.now() };
      attachRun(runId);
      startPollSafety();
    } catch { /* best effort */ }
  }

  async function refreshDeliveries(id) {
    const myEpoch = epoch;
    try {
      const page = await api.deliveriesList(id, { limit: 20 }, { signal: epochCtrl?.signal });
      if (myEpoch === epoch) deliveries.value = page.items ?? [];
    } catch {}
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

  // ── in-session history search (server-side pending contract wiring in
  //    the search feature; client fallback kept for old daemons) ─────────
  async function searchAll(query, { pages = 1 } = {}) {
    const id = sessionId.peek();
    if (!id || !query.trim()) return { results: [], pages: 0, entriesScanned: 0, hasMore: false };
    const q = query.trim().toLowerCase();
    const results = [];
    let before = null, pagesDone = 0, entriesScanned = 0, hasMore = false;
    for (let i = 0; i < Math.min(pages, cfg.history.maxSearchPages); i++) {
      const page = await api.historyPage(id, {
        limit: cfg.history.searchPageSize, order: 'desc', ...(before != null ? { before } : {}),
      });
      const items = page.items ?? [];
      entriesScanned += items.length;
      for (const e of items) { if (matchesEntry(e, q)) results.push(e); }
      pagesDone += 1;
      hasMore = Boolean(page.has_more);
      if (!hasMore) break;
      before = items.length ? items[items.length - 1].seq : null;
      if (before == null) break;
    }
    results.sort((a, b) => b.seq - a.seq);
    return { results, pages: pagesDone, entriesScanned, hasMore };
  }

  // ── drafts (explicit ownership — the composer passes its session id) ──
  function setDraft(text, id = sessionId.peek()) { if (id) drafts.set(id, text); }
  function getDraft(id = sessionId.peek()) { return id ? (drafts.get(id) ?? '') : ''; }

  return {
    sessionId, snapshot, entries, oldestSeq, newestSeq, hasMoreBefore,
    loadingOlder, loadingInitial, error, stream, sending, deliveries, phase, isActive,
    open, close, loadOlder, fetchNewer, send, interrupt, refreshDeliveries,
    searchAll, setDraft, getDraft,
  };
})();

function cap(text) { return text.length > cfg.sse.maxBufferedChars ? text.slice(0, cfg.sse.maxBufferedChars) : text; }

function matchesEntry(e, q) {
  const blocks = e?.payload?.content;
  if (Array.isArray(blocks)) {
    for (const b of blocks) {
      if (typeof b?.text === 'string' && b.text.toLowerCase().includes(q)) return true;
      if (typeof b?.arguments === 'object') {
        try { if (JSON.stringify(b.arguments).toLowerCase().includes(q)) return true; } catch {}
      }
    }
  }
  return false;
}

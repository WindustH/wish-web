// Conversation slice. Owns: session snapshot, windowed canonical history
// (/history keyset pages), delivery/run streaming state, optimistic user
// entries, and the reconcile loop that makes durable history authoritative
// after every turn (per ui-integration.md "Loading a conversation").
//
// Lifecycle: one EPOCH per open(id). Every async path captures the epoch and
// discards results when stale; teardown aborts the epoch's AbortController,
// cancelling all in-flight fetches. No scattered boolean guards — "stale()"
// is the only cross-session check (task 1).
//
// Streaming model (dual-mode):
//  · daemon streaming enabled → per-token deltas appended into `stream`;
//  · daemon streaming disabled (observed default: [streaming].enabled=false)
//    → only `resource` + `response_complete` arrive; the UI shows a live
//    "thinking" phase and the turn appears once history reconciles.
// Both modes converge on the same reconcile path. response_complete is NOT
// trusted as a terminal state by itself: reconcile consults the run /
// delivery / snapshot phase via API, so tool-call rounds and retries never
// truncate a still-running turn (task 2).
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

export const chat = (() => {
  const sessionId = signal(null);
  const snapshot = signal(null);
  const entries = signal([]);            // ascending seq; windowed resident
  const oldestSeq = signal(null);        // smallest resident seq
  const newestSeq = signal(null);        // largest resident seq (incl. optimistic)
  const hasMoreBefore = signal(false);
  const loadingOlder = signal(false);
  const loadingInitial = signal(false);
  const error = signal(null);
  const stream = signal(EMPTY_STREAM());
  const sending = signal(false);         // send() in flight (upload+POST)
  const deliveries = signal([]);         // recent delivery states
  const drafts = new Map();              // per-session composer draft (not reactive)

  let sse = null;
  let offSessionSync = null;
  let reconcileTimer = null;
  let pollTimer = null;
  let pollTickBusy = false;

  // ── lifecycle epoch ────────────────────────────────────────────────────
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
    sse?.close(); sse = null;
    offSessionSync?.(); offSessionSync = null;
    clearTimeout(reconcileTimer); reconcileTimer = null;
    clearInterval(pollTimer); pollTimer = null;
    pollTickBusy = false;
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
      const tail = (page.items ?? []).slice().reverse(); // → ascending
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
      // The session state changed (phase/queue). If another device drove a
      // turn, our history may be behind — refresh it (task 2).
      debouncedInvalidate();
    } else if (evt.kind === 'invalidate') {
      debouncedInvalidate();
    } else if (evt.kind === 'tombstone') {
      bus.emit('chat.sessionGone', id);
    }
  }

  // Another device / process changed this session: snapshot + history + a
  // possible live run all need attention (task 2: sync invalidation used to
  // only refresh the snapshot).
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
  // Stable identity for resident entries: durable by seq, optimistic by
  // localId. Null-seq entries must NEVER collide (task 2: "historyPage merges
  // keeping all optimistic items, no mutual overwrite on null seq").
  const entryKey = (e) => e.seq != null ? `s${e.seq}` : e.localId ? `o${e.localId}` : `x${e.delivery_id ?? e.id ?? Math.random()}`;

  function mergeItems(fresh) {
    if (!fresh.length) return 0;
    const cur = entries.peek();
    const byKey = new Map(cur.map((e) => [entryKey(e), e]));
    // Durable echo of a pending optimistic send: same delivery_id → drop
    // the optimistic copy, keep the canonical item.
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

  // Drain newer pages until the cursor stops advancing or has_more ends.
  // Returns {ok, added} so reconcile can refuse to finalize on failure
  // (task 2: "reconcile must succeed before removing optimistic bubbles").
  async function fetchNewer() {
    const myEpoch = epoch;
    const sig = epochCtrl?.signal;
    let added = 0;
    try {
      for (let i = 0; i < cfg.history.maxDrainPages; i++) {
        const id = sessionId.peek();
        if (!id) return { ok: false, added };
        const after = newestSeq.peek();
        const page = await api.historyPage(id, {
          limit: cfg.history.pageSize, order: 'asc', ...(after != null ? { after } : {}),
        }, { signal: sig });
        if (myEpoch !== epoch) return { ok: false, added };
        const fresh = page.items ?? [];
        if (!fresh.length) return { ok: true, added };
        added += mergeItems(fresh);
        if (!page.has_more) return { ok: true, added };
        if (newestSeq.peek() === after) return { ok: true, added }; // cursor stalled
      }
      return { ok: true, added };   // drain cap reached; poll safety continues
    } catch (err) {
      if (err?.name === 'AbortError' || myEpoch !== epoch) return { ok: false, added };
      return { ok: false, added };
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
      // Upload images first (session-partitioned blob tree). Failures THROW
      // so the composer can keep the draft and every attachment (task 1).
      const blocks = [];
      const uploaded = [];
      for (const img of images.slice(0, cfg.composer.maxImages)) {
        if (img.bytes?.byteLength > cfg.composer.maxImageBytes) {
          throw Object.assign(new Error('image exceeds size limit'), { code: 'image_too_large' });
        }
        const blob = await api.uploadSessionImage(id, img.bytes, img.mime, { signal: sig });
        uploaded.push({ blobId: blob.id ?? blob.sha256, localUrl: img.localUrl, name: img.name });
        blocks = [...blocks, { type: 'image', blob_id: blob.id ?? blob.sha256 }];
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
      optimistic.deliveryId = deliveryId;   // reconcile key
      entries.value = entries.peek().slice();
      stream.value = { ...stream.peek(), deliveryId };
      attachDelivery(deliveryId);
      refreshDeliveries(id);
      return deliveryId;
    } catch (err) {
      if (myEpoch !== epoch) return null;   // switched away: new state untouched
      // Failed before/at queueing: remove the optimistic bubble and surface.
      if (optimistic) entries.value = entries.peek().filter((e) => e !== optimistic);
      stream.value = { ...stream.peek(), active: false, phase: 'idle', error: String(err?.detail || err?.message || err) };
      stopPollSafety();
      throw err;
    } finally {
      if (myEpoch === epoch) sending.value = false;
    }
  }

  function sseFor(path, deliveryId, onFrame) {
    sse?.close();
    const url = new URL(absUrl(path));
    sse = createSse({
      url: url.href,
      onFrame,
      onState: ({ state: st, err }) => {
        if (st === 'gone') {
          // Resource disappeared: if the run is still live, follow the run;
          // otherwise settle from durable state.
          sse = null;
          const s = stream.peek();
          if (s.active && s.runId && !sse?.isTerminal) attachRun(s.runId);
          else scheduleReconcile();
        }
      },
    });
  }

  function attachDelivery(deliveryId, afterId = '') {
    const url = new URL(absUrl(`/deliveries/${deliveryId}/events`));
    if (afterId) url.searchParams.set('after', afterId);
    sseFor(url, deliveryId, (f) => handleStreamFrame(deliveryId, f));
  }

  function attachRun(runId, afterId = '') {
    const url = new URL(absUrl(`/runs/${runId}/events`));
    if (afterId) url.searchParams.set('after', afterId);
    sseFor(url, null, (f) => handleStreamFrame(null, f));
    stream.value = { ...stream.peek(), runId, active: true, phase: 'streaming' };
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
        // Some deltas were lost: recover from durable history but KEEP the
        // stream attached (it resumes with Last-Event-ID) — do not tear the
        // connection down for a recoverable gap (task 2).
        stream.value = { ...s, gap: true };
        fetchNewer();
        break;
      case 'response_complete':
        // NOT trusted as terminal on its own: reconcile verifies the real
        // run/delivery state, so agent tool rounds and retries continue.
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
    // Snapshot is authoritative for phase/queue.
    try {
      const snap = await api.sessionGet(id, { signal: epochCtrl?.signal });
      if (myEpoch !== epoch) return;
      if (snap) snapshot.value = snap;
    } catch { /* transient */ }
    refreshDeliveries(id);

    const s = stream.peek();
    if (!s.active) { finalize(); return; }

    if (!res.ok) {
      // Reconcile FAILED — never pretend the turn is durable (task 2).
      // Poll safety keeps retrying; stream stays as-is.
      if (s.phase === 'finalizing') stream.value = { ...s, phase: 'streaming' };
      return;
    }

    const pendingEcho = entries.peek().some((e) => e.__optimistic);
    const stillActive = await turnStillActive(id, s);
    if (myEpoch !== epoch) return;

    if (pendingEcho || stillActive) {
      // Turn continues (tool round, retry, or history not yet durable).
      // Keep observing; reattach if the stream died mid-run.
      if (s.phase === 'finalizing') stream.value = { ...s, phase: 'streaming' };
      if (!sse && s.runId) attachRun(s.runId);
      return;
    }
    finalize();
  }

  // Real liveness of the observed turn, from durable API state.
  async function turnStillActive(id, s) {
    try {
      const snap = snapshot.peek();
      if (snap && (snap.phase === 'running' || (snap.queue ?? 0) > 0)) return true;
    } catch { /* fallthrough */ }
    if (s.runId) {
      try {
        const run = await api.runGet(s.runId, { signal: epochCtrl?.signal });
        const st = run?.state ?? run?.status ?? '';
        if (st && !RUN_TERMINAL.includes(st)) return true;
      } catch { /* gone → terminal */ }
    }
    if (s.deliveryId) {
      try {
        const d = await api.deliveryGet(s.deliveryId, { signal: epochCtrl?.signal });
        const st = d?.state ?? d?.status ?? '';
        if (st && !DELIVERY_TERMINAL.includes(st)) return true;
      } catch { /* gone → terminal */ }
    }
    return false;
  }

  function finalize() {
    stream.value = EMPTY_STREAM();
    stopPollSafety();
    sse?.close(); sse = null;
  }

  // Poll safety: while a turn is active, periodically drain history and, if
  // everything is durable + terminal, finalize (also the fallback when SSE
  // is unavailable). One mechanism; no ad-hoc retry timers.
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

  async function reattachIfRunning(id) {
    const myEpoch = epoch;
    try {
      const snap = snapshot.peek();
      if (!snap || (snap.phase !== 'running' && (snap.queue ?? 0) === 0)) return;
      if (stream.peek().active) return;
      const runs = await api.sessionRuns(id, { limit: 1 }, { signal: epochCtrl?.signal });
      if (myEpoch !== epoch) return;
      const run = (runs.items ?? [])[0];
      if (!run) return;
      const state = run.state ?? run.status ?? '';
      if (RUN_TERMINAL.includes(state)) return;
      // There is a live run: show streaming shell and attach to its events.
      stream.value = { ...EMPTY_STREAM(), active: true, phase: 'streaming', runId: run.id, startedAt: Date.now() };
      attachRun(run.id);
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

  // ── in-session history search (client-side; backend search pending
  //    contract-backend.md — will switch to /history/search, task 5) ──────
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
      for (const e of items) {
        if (matchesEntry(e, q)) results.push(e);
      }
      pagesDone += 1;
      hasMore = Boolean(page.has_more);
      if (!hasMore) break;
      before = items.length ? items[items.length - 1].seq : null;
      if (before == null) break;
    }
    results.sort((a, b) => b.seq - a.seq);
    return { results, pages: pagesDone, entriesScanned, hasMore };
  }

  // ── drafts ────────────────────────────────────────────────────────────
  function setDraft(text) { const id = sessionId.peek(); if (id) drafts.set(id, text); }
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

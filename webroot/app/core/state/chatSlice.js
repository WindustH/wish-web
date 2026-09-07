// Conversation slice. Owns: session snapshot, windowed canonical history
// (/history keyset pages), delivery/run streaming state, optimistic user
// entries, and the reconcile loop that makes durable history authoritative
// after every turn (per ui-integration.md "Loading a conversation").
//
// Streaming model (dual-mode):
//  · daemon streaming enabled → per-token deltas appended into `stream`
//    signals (text / reasoning / tool-call args);
//  · daemon streaming disabled (observed default: [streaming].enabled=false)
//    → only `resource` + `response_complete` arrive; the UI shows a live
//    "thinking" phase and the turn appears once history reconciles.
// Both modes converge on the same reconcile path, so no UI branch lies.
import { cfg } from '../config.js';
import { bus } from '../bus.js';
import { signal, derive } from './reactive.js';
import { createSse } from '../api/sse.js';
import * as api from '../api/endpoints.js';

const EMPTY_STREAM = () => ({
  active: false, phase: 'idle',   // idle|pending|streaming|finalizing
  deliveryId: null, runId: null, model: null,
  text: '', reasoning: '', toolCalls: {}, usage: null,
  gap: false, error: null, startedAt: 0,
});

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
  const deliveries = signal([]);         // recent delivery states
  const drafts = new Map();              // per-session composer draft (not reactive)

  let sse = null;
  let offSessionSync = null;
  let reconcileTimer = null;
  let pollTimer = null;

  const isActive = derive(() => sessionId.value !== null);
  const phase = derive(() => {
    const snap = snapshot.value;
    if (stream.value?.active) return 'running';
    if (!snap) return 'idle';
    return snap.phase || 'idle';
  });

  // ── lifecycle ──────────────────────────────────────────────────────────
  function teardown() {
    sse?.close(); sse = null;
    offSessionSync?.(); offSessionSync = null;
    clearTimeout(reconcileTimer); reconcileTimer = null;
    clearInterval(pollTimer); pollTimer = null;
  }

  async function open(id) {
    if (sessionId.peek() === id) return;
    teardown();
    sessionId.value = id;
    snapshot.value = null; entries.value = [];
    oldestSeq.value = null; newestSeq.value = null;
    hasMoreBefore.value = false; error.value = null;
    stream.value = EMPTY_STREAM();
    deliveries.value = [];
    loadingInitial.value = true;
    try {
      const [snap, page] = await Promise.all([
        api.sessionGet(id),
        api.historyPage(id, { limit: cfg.history.pageSize, order: 'desc' }),
      ]);
      if (sessionId.peek() !== id) return;      // switched away meanwhile
      snapshot.value = snap;
      const tail = (page.items ?? []).slice().reverse(); // → ascending
      applyPage(tail, page.has_more ?? false);
      offSessionSync = (await import('./syncSlice.js')).sync.subscribeSession(id, onSessionSync);
      await reattachIfRunning(id);
    } catch (err) {
      if (sessionId.peek() === id) error.value = err;
    } finally {
      if (sessionId.peek() === id) loadingInitial.value = false;
    }
  }

  function close() { teardown(); sessionId.value = null; }

  function onSessionSync(evt) {
    const id = sessionId.peek();
    if (!id) return;
    if (evt.kind === 'upsert' && evt.body?.id === id) {
      snapshot.value = evt.body;
    } else if (evt.kind === 'invalidate') {
      api.sessionGet(id).then((snap) => {
        if (sessionId.peek() === id) snapshot.value = snap;
      }).catch(() => {});
    } else if (evt.kind === 'tombstone') {
      bus.emit('chat.sessionGone', id);
    }
  }

  // ── history paging ────────────────────────────────────────────────────
  function applyPage(ascItems, moreBefore) {
    if (!ascItems.length) {
      hasMoreBefore.value = hasMoreBefore.peek() || moreBefore;
      return;
    }
    const bySeq = new Map(entries.peek().map((e) => [e.seq, e]));
    for (const e of ascItems) bySeq.set(e.seq, e);        // durable wins over optimistic
    const durable = [...bySeq.values()].sort((a, b) => (a.seq ?? Infinity) - (b.seq ?? Infinity));
    entries.value = durable;
    const seqs = durable.map((e) => e.seq).filter((s) => s != null);
    oldestSeq.value = seqs.length ? Math.min(...seqs) : null;
    newestSeq.value = seqs.length ? Math.max(...seqs) : null;
    hasMoreBefore.value = moreBefore;
  }

  async function loadOlder() {
    const id = sessionId.peek();
    if (!id || loadingOlder.peek() || oldestSeq.peek() == null || !hasMoreBefore.peek()) return false;
    loadingOlder.value = true;
    try {
      const page = await api.historyPage(id, {
        limit: cfg.history.pageSize, order: 'desc', before: oldestSeq.peek(),
      });
      if (sessionId.peek() !== id) return false;
      const older = (page.items ?? []).slice().reverse();
      applyPage(older, page.has_more ?? false);
      return older.length > 0;
    } catch (err) { error.value = err; return false; }
    finally { loadingOlder.value = false; }
  }

  async function fetchNewer() {
    const id = sessionId.peek();
    if (!id) return;
    try {
      const after = newestSeq.peek();
      const page = await api.historyPage(id, {
        limit: cfg.history.pageSize, order: 'asc', ...(after != null ? { after } : {}),
      });
      if (sessionId.peek() !== id) return;
      const fresh = page.items ?? [];
      // Reconcile optimistic entries: drop pending echo already durable.
      const durableDeliveryIds = new Set(fresh.map((e) => e.delivery_id).filter(Boolean));
      const keepOptimistic = entries.peek().filter(
        (e) => !(e.__optimistic && durableDeliveryIds.has(e.deliveryId)),
      );
      const bySeq = new Map(keepOptimistic.map((e) => [e.seq ?? `p-${e.localId}`, e]));
      for (const e of fresh) bySeq.set(e.seq, e);
      const merged = [...bySeq.values()].sort((a, b) => sortKey(a) - sortKey(b));
      entries.value = merged;
      const seqs = merged.map((e) => e.seq).filter((s) => s != null);
      newestSeq.value = seqs.length ? Math.max(...seqs) : newestSeq.peek();
    } catch (err) { /* transient; next sync invalidation will retry */ }
  }

  function sortKey(e) { return e.seq != null ? e.seq : Number.MAX_SAFE_INTEGER - (e.localKey || 0); }

  // ── sending & streaming ────────────────────────────────────────────────
  async function send(text, images = []) {
    const id = sessionId.peek();
    if (!id) return null;
    let blocks = [];
    // Upload images first (session-partitioned blob tree).
    const uploaded = [];
    for (const img of images.slice(0, cfg.composer.maxImages)) {
      if (img.bytes?.byteLength > cfg.composer.maxImageBytes) {
        streamError(new Error('image_too_large')); return null;
      }
      try {
        const blob = await api.uploadSessionImage(id, img.bytes, img.mime);
        uploaded.push({ blobId: blob.id ?? blob.sha256, localUrl: img.localUrl, name: img.name });
        blocks = [...blocks, { type: 'image', blob_id: blob.id ?? blob.sha256 }];
      } catch (err) { streamError(err); return null; }
    }

    const localKey = Date.now();
    const optimistic = {
      __optimistic: true, localId: `opt-${localKey}`, localKey,
      seq: null, kind: 'user_message', deliveryId: null,
      created_at: new Date().toISOString(),
      payload: { role: 'user', content: [{ type: 'text', text }],
        ...(uploaded.length ? { __images: uploaded } : {}) },
    };
    entries.value = [...entries.peek(), optimistic];

    stream.value = { ...EMPTY_STREAM(), active: true, phase: 'pending', startedAt: Date.now() };
    startPollSafety(id);

    try {
      const d = await api.messageSend(id, {
        content: text, ...(blocks.length ? { blocks } : {}),
      });
      const deliveryId = d.resource_id ?? d.id;
      optimistic.deliveryId = deliveryId;   // reconcile key
      entries.value = entries.peek().slice();
      stream.value = { ...stream.peek(), deliveryId };
      attachDelivery(deliveryId);
      refreshDeliveries(id);
      return deliveryId;
    } catch (err) {
      // Failed before queueing: remove the optimistic bubble and surface.
      entries.value = entries.peek().filter((e) => e !== optimistic);
      stream.value = { ...stream.peek(), active: false, phase: 'idle', error: String(err?.detail || err?.message || err) };
      stopPollSafety();
      throw err;
    }
  }

  function streamError(err) {
    stream.value = { ...stream.peek(), error: String(err?.detail || err?.message || err) };
  }

  function attachDelivery(deliveryId, afterId = '') {
    sse?.close();
    const url = new URL(`${cfg.api.baseUrl}/deliveries/${deliveryId}/events`, location.href);
    if (afterId) url.searchParams.set('after', afterId);
    sse = createSse({
      url: url.pathname + url.search,
      onFrame: (f) => handleStreamFrame(deliveryId, f),
    });
  }

  function attachRun(runId, afterId = '') {
    sse?.close();
    const url = new URL(`${cfg.api.baseUrl}/runs/${runId}/events`, location.href);
    if (afterId) url.searchParams.set('after', afterId);
    sse = createSse({
      url: url.pathname + url.search,
      onFrame: (f) => handleStreamFrame(null, f),
    });
    stream.value = { ...stream.peek(), runId, active: true, phase: 'streaming' };
  }

  function handleStreamFrame(deliveryId, frame) {
    let data = null;
    try { data = frame.data ? JSON.parse(frame.data) : {}; } catch { data = {}; }
    const s = stream.peek();
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
        scheduleReconcile();
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
    reconcileTimer = setTimeout(async () => {
      const id = sessionId.peek();
      if (!id) return;
      await fetchNewer();
      api.sessionGet(id).then((snap) => { if (sessionId.peek() === id) snapshot.value = snap; }).catch(() => {});
      refreshDeliveries(id);
      // The turn is durable now — clear the draft stream.
      stream.value = EMPTY_STREAM();
      stopPollSafety();
      sse?.close(); sse = null;
    }, cfg.history.reconcileDelayMs);
  }

  // If the daemon has streaming disabled, the SSE only signals completion;
  // poll history so a long turn still lands promptly even if SSE breaks.
  function startPollSafety(id) {
    clearInterval(pollTimer);
    pollTimer = setInterval(async () => {
      if (!stream.peek().active || sessionId.peek() !== id) { stopPollSafety(); return; }
      await fetchNewer().catch(() => {});
    }, Math.max(2_000, cfg.sync.pollFallbackMs));
  }
  function stopPollSafety() { clearInterval(pollTimer); pollTimer = null; }

  async function reattachIfRunning(id) {
    try {
      const snap = snapshot.peek();
      if (!snap || (snap.phase !== 'running' && snap.queue > 0)) return;
      const runs = await api.sessionRuns(id, { limit: 1 });
      const run = (runs.items ?? [])[0];
      if (!run) return;
      const terminal = ['completed', 'failed', 'canceled', 'cancelled', 'interrupted'];
      const state = run.state ?? run.status ?? '';
      if (terminal.includes(state)) return;
      // There is a live run: show streaming shell and attach to its events.
      stream.value = { ...EMPTY_STREAM(), active: true, phase: 'streaming', runId: run.id, startedAt: Date.now() };
      attachRun(run.id);
      startPollSafety(id);
    } catch { /* best effort */ }
  }

  async function refreshDeliveries(id) {
    try {
      const page = await api.deliveriesList(id, { limit: 20 });
      if (sessionId.peek() === id) deliveries.value = page.items ?? [];
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

  // ── in-session history search (client-side; see from-llm/10) ──────────
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
  function getDraft() { return sessionId.peek() ? (drafts.get(sessionId.peek()) ?? '') : ''; }

  return {
    sessionId, snapshot, entries, oldestSeq, newestSeq, hasMoreBefore,
    loadingOlder, loadingInitial, error, stream, deliveries, phase, isActive,
    open, close, loadOlder, fetchNewer, send, interrupt, refreshDeliveries,
    searchAll, setDraft, getDraft,
  };
})();

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
  if (e?.payload?.tool_name?.toLowerCase().includes(q)) return true;
  return false;
}

function cap(s) { return s.length > cfg.sse.maxBufferedChars ? s.slice(0, cfg.sse.maxBufferedChars) + '…' : s; }

// Conversation view: top bar (desktop: name + 3 actions; mobile: back +
// name + overflow menu), windowed message log, composer.
import { html, Fragment } from '../../h.js';
import { useEffect, useRef, useState, useCallback, useLayoutEffect } from 'preact/hooks';
import { useSignal } from '../../hooks.js';
import { Icon } from '../../components/icon.js';
import { Button } from '../../components/button.js';
import { Spinner } from '../../components/spinner.js';
import { Menu } from '../../components/menu.js';
import { ListResizeHandle } from './resize.js';
import { navigate, isMobile } from '../../router.js';
import { i18n } from '../../../core/i18n/index.js';
import { cfg } from '../../../core/config.js';
import { chat } from '../../../core/state/chatSlice.js';
import { sessions } from '../../../core/state/sessionsSlice.js';
import { Markdown } from '../../components/markdown.js';
import { HistoryEntry, groupEntries, ProcessGroup } from './entry.js';
import { Vlist } from '../../components/vlist.js';
import { announce } from '../../live.js';
import { Composer } from './composer.js';
import { ModelSettings } from './modelsettings.js';
import { SessionsListPane } from './list.js';
import { NewSessionModal } from './newsession.js';
import { Sheet } from '../../components/sheet.js';
import { InfoBody } from './info.js';
import { SearchBody } from './search.js';
import { ManageBody } from './manage.js';

const SESSION_SHEETS = {
  info: { title: 'info.title', body: InfoBody },
  search: { title: 'search.title', body: SearchBody },
  manage: { title: 'manage.title', body: ManageBody },
};

// All routes for one session share this component and the same chat DOM.
// Opening a sheet must preserve scroll, drafts and unsent image attachments.
export function ChatView({ route }) {
  const id = route.params.id;
  const tab = route.path.split('/')[3];
  const mobile = useSignal(isMobile);
  const closeSheet = useCallback(() => navigate(`/s/${id}`, { replace: true }), [id]);
  const openSheet = useCallback((name) => navigate(`/s/${id}/${name}`, { replace: Boolean(tab) }), [id, tab]);
  useEffect(() => { chat.open(id); }, [id]);
  const sheet = SESSION_SHEETS[tab];
  const Body = sheet?.body;
  return html`<${Fragment}>
    ${!mobile && html`<${SessionsListPane} /><${ListResizeHandle} />`}
    <div class="content-pane">
      <${ChatPane} id=${id} mobile=${mobile} openSheet=${openSheet} covered=${mobile && !!sheet} />
      ${sheet && html`<${Sheet} key=${tab} title=${i18n.t(sheet.title)} mobile=${mobile} onClose=${closeSheet}>
        <${Body} id=${id} />
      <//>`}
    </div>
    ${!mobile && html`<${NewSessionModal} />`}
  <//>`;
}

function ChatPane({ id, mobile, openSheet, covered }) {
  const snapshot = useSignal(chat.snapshot);
  const error = useSignal(chat.error);
  const loading = useSignal(chat.loadingInitial);
  const name = snapshot?.name || sessions.getById(id)?.name || '…';

  const [modelOpen, openModel] = useState(false);

  return html`
    <div class="chat" inert=${covered || undefined}>
      <${ChatTopBar} id=${id} openSheet=${openSheet} name=${name} mobile=${mobile}
        phase=${snapshot?.phase} queue=${snapshot?.queue ?? 0} model=${snapshot?.model}
        onOpenModel=${() => openModel(true)} />
      ${modelOpen && html`<${ModelSettings} key=${id} id=${id} onClose=${() => openModel(false)} />`}
      ${error && html`<div class="sl-empty">${i18n.t('common.error')} — ${String(error.detail || error.message)}
        <div><${Button} onClick=${() => chat.reload()}>${i18n.t('common.retry')}<//></div></div>`}
      <${ChatLog} id=${id} loading=${loading} snapshot=${snapshot} />
      <${Composer} sessionId=${id} mobile=${mobile} onSearch=${() => openSheet('search')} />
    </div>`;
}

function ChatTopBar({ id, name, mobile, phase, queue = 0, model, onOpenModel, openSheet: go }) {
  const actions = [
    { icon: 'info', label: i18n.t('chatbar.info'), onClick: () => go('info') },
    { icon: 'search', label: i18n.t('chatbar.search'), onClick: () => go('search') },
    { icon: 'settings-2', label: i18n.t('chatbar.manage'), onClick: () => go('manage') },
  ];
  return html`
    <div class="chatbar">
      ${mobile && html`<button class="btn ghost icon-only" aria-label=${i18n.t('chatbar.back')}
        onClick=${() => navigate('/sessions')}>
        <${Icon} name="arrow-left" />
      </button>`}
      <div class="title">${name}</div>
      ${model && html`<button class="model-chip" title=${i18n.t('model.chipTitle')} onClick=${onOpenModel}>
        ${model}
      </button>`}
      ${phase === 'running' && html`<span class="badge accent">${i18n.t('phase.running')}</span>`}
      ${queue > 0 && html`<span class="badge">${i18n.t('chat.queuedN', { n: queue })}</span>`}
      ${phase === 'compacting' && html`<span class="badge">${i18n.t('phase.compacting')}</span>`}
      ${!mobile
        ? actions.map((a) => html`<button key=${a.icon} class="btn ghost icon-only" title=${a.label}
            aria-label=${a.label} onClick=${a.onClick}><${Icon} name=${a.icon} /></button>`)
        : html`<${Menu} items=${actions} trigger=${({ toggle }) => html`
            <button class="btn ghost icon-only" aria-label=${i18n.t('chatbar.more')} onClick=${toggle}>
              <${Icon} name="ellipsis-vertical" />
            </button>`} />`}
    </div>`;
}

function firstVisibleChild(el) {
  const top = el.getBoundingClientRect().top;
  const kids = el.querySelectorAll('.entry-anchor, .proc-group');
  for (const k of kids) if (k.getBoundingClientRect().bottom > top + 4) return k;
  return null;
}

function ChatLog({ id, loading, snapshot }) {
  const entries = useSignal(chat.entries);
  const hasMore = useSignal(chat.hasMoreBefore);
  const loadingOlder = useSignal(chat.loadingOlder);
  const loadingNewer = useSignal(chat.loadingNewer);
  const locating = useSignal(chat.locating);
  const historyVersion = useSignal(chat.historyVersion);
  const streamState = useSignal(chat.stream);
  const pendingSeq = useSignal(chat.pendingSeq);
  const hasMoreAfter = useSignal(chat.hasMoreAfter);
  const logRef = useRef(null);
  const stickBottom = useRef(true);
  const [farUp, setFarUp] = useState(false);
  const wasActive = useRef(false);

  const groups = groupEntries(entries);
  const shownThrough = useRef(null);
  const latestSeq = entries.reduce((max, e) => Math.max(max, e.seq ?? 0), 0);
  const animateAfter = shownThrough.current;
  useEffect(() => {
    if (!loading) shownThrough.current = Math.max(shownThrough.current ?? 0, latestSeq);
  }, [latestSeq, loading]);

  const prependAnchor = useRef(null);
  const anchorVersion = useRef(historyVersion);
  if (anchorVersion.current !== historyVersion) {
    prependAnchor.current = null;
    anchorVersion.current = historyVersion;
  }
  const restoreAnchor = useCallback(() => {
    const anchor = prependAnchor.current;
    const el = logRef.current;
    if (!el) return;
    const target = chat.pendingSeq.peek();
    if (target != null) {
      const node = el.querySelector(`.entry-anchor[data-seq="${target}"], .proc-step[data-seq="${target}"]`)
        || el.querySelector(`.proc-group[data-seqs~="${target}"]`);
      if (!node) return;
      stickBottom.current = !chat.hasMoreAfter.peek() && target === chat.newestSeq.peek();
      setFarUp(!stickBottom.current);
      el.scrollTop += node.getBoundingClientRect().top - el.getBoundingClientRect().top
        - (el.clientHeight - Math.min(node.offsetHeight, el.clientHeight)) / 2;
      node.classList.remove('history-target');
      void node.offsetWidth;
      node.classList.add('history-target');
      chat.clearPendingSeq();
      return;
    }
    if (!anchor) return;
    const node = el.querySelector(`[data-seq="${anchor.seq}"]`)
      || el.querySelector(`[data-seqs~="${anchor.seq}"]`);
    if (!node) return; // the Vlist's next layout may mount this chunk
    const offset = node.getBoundingClientRect().top - el.getBoundingClientRect().top;
    el.scrollTop += offset - anchor.offset;
    prependAnchor.current = null;
  }, []);

  useEffect(() => {
    const el = logRef.current;
    const load = () => {
      if (loading || chat.locating.peek() || chat.pendingSeq.peek() != null || chat.loadingOlder.peek() || !chat.hasMoreBefore.peek() || chat.error.peek()) return;
      if (el.scrollTop > cfg.history.prefetchOlderTriggerPx) return;
      chat.loadOlder({ beforeMerge: () => {
        // Capture at response time: the user may have kept scrolling during
        // the fetch. Restore before paint, not after two visible frames.
        const first = firstVisibleChild(el);
        if (first) prependAnchor.current = {
          seq: first.dataset.seq,
          offset: first.getBoundingClientRect().top - el.getBoundingClientRect().top,
        };
      }});
    };
    const onScroll = () => {
      stickBottom.current = !chat.hasMoreAfter.peek() && el.scrollHeight - el.scrollTop - el.clientHeight < 80;
      setFarUp(el.scrollHeight - el.scrollTop - el.clientHeight > 2000);
      load();
      if (!loading && !chat.locating.peek() && chat.pendingSeq.peek() == null
          && chat.hasMoreAfter.peek() && !chat.error.peek()
          && el.scrollHeight - el.scrollTop - el.clientHeight < cfg.history.prefetchOlderTriggerPx) {
        chat.fetchNewer({pages: 1});
      }
    };
    el.addEventListener('scroll', onScroll, { passive: true });
    // Fill a viewport containing a short first page as well as prefetching
    // while scrolling. Each completed page rechecks the actual geometry.
    load();
    return () => el.removeEventListener('scroll', onScroll);
  }, [loading, hasMore, loadingOlder, loadingNewer, locating, entries.length]);

  // New messages follow the bottom; a prepended page never drags the reader
  // away from their current anchor. Resizing the composer keeps tail readers
  // at the tail, without disturbing someone reading older history.
  useLayoutEffect(() => {
    const el = logRef.current;
    if (el && stickBottom.current && !prependAnchor.current && chat.pendingSeq.peek() == null && !chat.locating.peek()) el.scrollTop = el.scrollHeight;
  }, [latestSeq, streamState.text, streamState.reasoning, loading]);
  useEffect(() => {
    const el = logRef.current;
    const observer = new ResizeObserver(() => {
      if (stickBottom.current && !prependAnchor.current && chat.pendingSeq.peek() == null && !chat.locating.peek()) el.scrollTop = el.scrollHeight;
    });
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  // Vlist calls restoreAnchor only after the requested chunk has committed.
  // There is no timer racing against asynchronous chunk mounting.
  const groupsIdx = pendingSeq == null ? null : groups.findIndex((g) =>
    g.entry?.seq === pendingSeq || g.steps?.some((s) => s.entry?.seq === pendingSeq || s.fromSeq === pendingSeq));

  // Completion: one polite screen-reader announcement; optional OS
  // notification for failures only (dedup per run) — decisions 22/24.
  useEffect(() => {
    const s = streamState;
    if (wasActive.current && !s?.active) announce(i18n.t('a11y.runDone'));
    wasActive.current = Boolean(s?.active);
    // Failures are always visible in-stream; while the page is hidden the
    // centralized background notifier (ui/notify.js) owns OS notifications.
  }, [streamState?.active, streamState?.error]);

  return html`
    <div class="chatlog" ref=${logRef}>
      <div class="chatlog-inner">
        <div class="history-boundary" role="status">
          ${loadingOlder ? i18n.t('chat.loadingOlder') : !hasMore && entries.length > 0 ? i18n.t('chat.beginning') : ''}
        </div>
        ${loading && html`<div class="chat-empty"><${Spinner} label=${i18n.t('common.loading')} /></div>`}
        ${!loading && entries.length === 0 && html`<div class="chat-empty">${i18n.t('chat.empty')}</div>`}
        ${(farUp || hasMoreAfter) && !streamState?.active && html`<button class="btn ghost jump-latest"
          onClick=${async () => {
            if (hasMoreAfter && !await chat.jumpToLatest()) return;
            const el = logRef.current;
            if (el) { stickBottom.current = true; el.scrollTop = el.scrollHeight; }
          }}>↓ ${i18n.t('chat.jumpLatest')}<//>`}
        <${Vlist} items=${groups} datasetKey=${id} initialWindow="bottom" estimate=${110}
          revealIndex=${groupsIdx} onLayout=${restoreAnchor}
          keyOf=${(g) => g.key}
          render=${(g) => (g.type === 'process'
            ? html`<${ProcessGroup} key=${g.key} item=${g} revealSeq=${pendingSeq} recent=${animateAfter != null && g.steps.some(s => (s.fromSeq ?? s.entry?.seq) > animateAfter)} />`
            : html`<${HistoryEntry} key=${g.key} entry=${g.entry} blocks=${g.blocks} usage=${g.usage} recent=${animateAfter != null && g.entry.seq > animateAfter} />`)} />
        ${hasMoreAfter && html`<div class="history-boundary" role="status">${loadingNewer ? i18n.t('chat.loadingNewer') : ''}</div>`}
        ${!hasMoreAfter && html`<${LiveStream} stream=${streamState} />`}
      </div>
    </div>`;
}

function LiveStream({ stream }) {
  if (!stream?.active) return null;
  const hasBody = stream.text || Object.keys(stream.toolCalls || {}).length > 0;
  return html`<div class="entry assistant">
    <div class="avatar-col"><div class="avatar"><${Icon} name="bot" class="sm" /></div></div>
    <div class="body">
      ${stream.reasoning && !stream.text && html`<div class="fold">
        <span class="fold-chip" style="cursor:default"><${Icon} name="brain" />${i18n.t('entry.thinking')}…</span>
      </div>`}
      ${Object.entries(stream.toolCalls || {}).map(([cid, tc]) => html`
        <div class="fold" key=${cid}>
          <span class="fold-chip" style="cursor:default">
            <${Icon} name="terminal" />${i18n.t('entry.toolCall')}: ${tc.name}…
          </span>
        </div>`)}
      ${stream.text && html`<${Markdown} text=${stream.text} />`}
      ${!hasBody && html`<div class="stream-banner">
        <span class="typing"><i></i><i></i><i></i></span>
        ${stream.phase === 'pending' ? i18n.t('chat.queued') : i18n.t('chat.running')}
      </div>`}
      ${stream.gap && html`<div class="badge err">${i18n.t('entry.streamGap')}</div>`}
      ${stream.error && html`<div class="badge err">${i18n.t('chat.error')}: ${stream.error}</div>`}
    </div>
  </div>`;
}

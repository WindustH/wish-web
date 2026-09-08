// Conversation view: top bar (desktop: name + 3 actions; mobile: back +
// name + overflow menu), windowed message log, composer.
import { html, Fragment } from '../../h.js';
import { useEffect, useRef, useState } from 'preact/hooks';
import { useSignal, useMedia } from '../../hooks.js';
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
import { Composer } from './composer.js';
import { SessionsListPane } from './list.js';
import { NewSessionModal } from './newsession.js';

export function ChatView({ route }) {
  return html`<${ChatShell} id=${route.params.id} />`;
}

// Shared shell for the chat route and its tab routes (info/search/manage):
// desktop = list + chat + right drawer for the tab; mobile = tab becomes a
// second-level full page (chat hidden beneath, back returns to it).
export function ChatShell({ id, tab, sheet }) {
  const mobile = useSignal(isMobile);
  useEffect(() => { chat.open(id); }, [id]);

  if (mobile && tab && sheet) return sheet;
  if (mobile) return html`
    <div class="content-pane"><${ChatPane} id=${id} mobile=${true} /></div>`;

  return html`<${Fragment}>
    <${SessionsListPane} />
    <${ListResizeHandle} />
    <div class="content-pane has-drawer">
      <${ChatPane} id=${id} mobile=${false} />
      ${tab && sheet}
    </div>
    <${NewSessionModal} />
  <//>`;
}

function ChatPane({ id, mobile }) {
  const snapshot = useSignal(chat.snapshot);
  const error = useSignal(chat.error);
  const loading = useSignal(chat.loadingInitial);
  const name = snapshot?.name || sessions.getById(id)?.name || '…';

  return html`
    <div class="chat">
      <${ChatTopBar} id=${id} name=${name} mobile=${mobile} phase=${snapshot?.phase} />
      ${error && html`<div class="sl-empty">${i18n.t('common.error')} — ${String(error.detail || error.message)}
        <div><${Button} onClick=${() => chat.open(id)}>${i18n.t('common.retry')}<//></div></div>`}
      <${ChatLog} id=${id} loading=${loading} snapshot=${snapshot} />
      <${Composer} sessionId=${id} mobile=${mobile} />
    </div>`;
}

function ChatTopBar({ id, name, mobile, phase }) {
  const go = (tab) => navigate(`/s/${id}/${tab}`);
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
      ${phase === 'running' && html`<span class="badge accent">${i18n.t('phase.running')}</span>`}
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

function ChatLog({ id, loading, snapshot }) {
  const entries = useSignal(chat.entries);
  const hasMore = useSignal(chat.hasMoreBefore);
  const loadingOlder = useSignal(chat.loadingOlder);
  const streamState = useSignal(chat.stream);
  const logRef = useRef(null);
  const stickBottom = useRef(true);

  // Track whether the user is pinned to the bottom; auto-scroll only then.
  useEffect(() => {
    const el = logRef.current;
    if (!el) return;
    const onScroll = () => {
      stickBottom.current = el.scrollHeight - el.scrollTop - el.clientHeight < 80;
      // Prefetch older pages when the user scrolls near the top.
      if (el.scrollTop < cfg.history.prefetchOlderTriggerPx && hasMore && !loadingOlder) {
        const prevHeight = el.scrollHeight;
        chat.loadOlder().then((got) => {
          if (got) requestAnimationFrame(() => {
            el.scrollTop = el.scrollHeight - prevHeight; // keep viewport stable
          });
        });
      }
    };
    el.addEventListener('scroll', onScroll, { passive: true });
    return () => el.removeEventListener('scroll', onScroll);
  }, [hasMore, loadingOlder]);

  // Follow new content while pinned to bottom.
  useEffect(() => {
    const el = logRef.current;
    if (el && stickBottom.current) el.scrollTop = el.scrollHeight;
  }, [entries.length, streamState.text, streamState.reasoning, loading]);

  return html`
    <div class="chatlog" ref=${logRef}>
      <div class="chatlog-inner">
        ${hasMore && html`<div class="load-older">
          <${Button} variant="ghost" disabled=${loadingOlder} onClick=${() => chat.loadOlder().then(() => {})}>
            ${loadingOlder ? i18n.t('common.loading') : i18n.t('chat.loadOlder')}
          <//>
        </div>`}
        ${!hasMore && entries.length > 0 && html`<div class="load-older">
          <span style="font-size:12px;color:var(--fg-faint)">${i18n.t('chat.beginning')}</span>
        </div>`}
        ${loading && html`<div class="chat-empty"><${Spinner} label=${i18n.t('common.loading')} /></div>`}
        ${!loading && entries.length === 0 && html`<div class="chat-empty">${i18n.t('chat.empty')}</div>`}
        ${groupEntries(entries).map((item) => item.type === 'process'
          ? html`<${ProcessGroup} key=${item.key} item=${item} />`
          : html`<${HistoryEntry} key=${item.entry.seq ?? item.entry.localId} entry=${item.entry} />`)}
        <${LiveStream} stream=${streamState} />
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

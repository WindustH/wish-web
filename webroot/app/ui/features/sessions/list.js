// Session browser: search box + new button on top, filter row, list below.
// Data: GET /sessions with keyset pagination; rows live-patched by sync.
// Rows render through Vlist (chunked windowing) so a big resident list
// never means a big DOM (task 4/8).
import { html, Fragment } from '../../h.js';
import { useEffect } from 'preact/hooks';
import { useSignal } from '../../hooks.js';
import { Icon } from '../../components/icon.js';
import { Button } from '../../components/button.js';
import { Spinner } from '../../components/spinner.js';
import { Vlist } from '../../components/vlist.js';
import { navigate, isMobile, current } from '../../router.js';
import { i18n } from '../../../core/i18n/index.js';
import { sessions } from '../../../core/state/sessionsSlice.js';
import { sync } from '../../../core/state/syncSlice.js';
import { relTime } from '../../../core/util/fmt.js';
import { NewSessionModal } from './newsession.js';
import { ListResizeHandle } from './resize.js';

export function SessionsListPane() {
  const items = useSignal(sessions.items);
  const loading = useSignal(sessions.loading);
  const loadingMore = useSignal(sessions.loadingMore);
  const hasMore = useSignal(sessions.hasMore);
  const err = useSignal(sessions.error);
  const query = useSignal(sessions.query);
  const tagFilter = useSignal(sessions.tagFilter);
  const activeId = current.peek().params?.id || null;

  useEffect(() => { if (!sessions.items.peek().length) sessions.loadFirst(); }, []);

  return html`
    <div class="sessions-pane">
      <div class="sl-head">
        <input class="input" type="search" placeholder=${i18n.t('sessions.search.placeholder')}
          value=${query}
          onInput=${(e) => sessions.setQuery(e.target.value)}
          aria-label=${i18n.t('sessions.search.placeholder')} />
        <${Button} icon="plus" variant="primary" aria-label=${i18n.t('sessions.new')}
          onClick=${() => NewSessionModal.open()} />
      </div>
      ${tagFilter && html`<div class="sl-filters" role="group" aria-label=${i18n.t('sessions.filter.group')}>
        <button class="seg-item on tag-chip" onClick=${() => sessions.setTagFilter('')}>
          ${i18n.t('sessions.tagged')} “${tagFilter}” <${Icon} name="x" class="sm" />
        </button>
      </div>`}
      <div class="sl-list" role="list">
        ${loading && html`<div class="sl-empty"><${Spinner} label=${i18n.t('sessions.loading')} /></div>`}
        ${!loading && err && html`<div class="sl-empty">${i18n.t('common.error')} — ${String(err.detail || err.message)}
          <div><${Button} onClick=${() => sessions.refresh()}>${i18n.t('common.retry')}<//></div></div>`}
        ${!loading && !err && items.length === 0 && html`
          <div class="sl-empty">${query || tagFilter ? i18n.t('sessions.emptySearch') : i18n.t('sessions.empty')}</div>`}
        ${!loading && !err && items.length > 0 && html`
          <${Vlist} items=${items} keyOf=${(s) => s.id} estimate=${64}
            render=${(s) => html`<${SessionRow} key=${s.id} s=${s} active=${s.id === activeId} />`} />`}
        ${hasMore && html`<button class="btn ghost sl-more" disabled=${loadingMore}
          onClick=${() => sessions.loadMore()}>
          ${loadingMore ? i18n.t('sessions.loading') : i18n.t('sessions.loadMore')}
        </button>`}
      </div>
    </div>
  `;
}

function SessionRow({ s, active }) {
  return html`
    <div class="sl-row ${active ? 'active' : ''}" role="listitem" tabIndex="0"
      onClick=${() => navigate(`/s/${s.id}`)}
      onKeyDown=${(e) => { if (e.key === 'Enter') navigate(`/s/${s.id}`); }}>
      <div class="sl-row-top">
        <span class="sl-dot ${s.phase || ''}" title=${i18n.t(`phase.${s.phase || 'unknown'}`)} />
        <span class="sl-name">${s.name}</span>
      </div>
      <div class="sl-sub">
        <span>${i18n.t(`phase.${s.phase || 'unknown'}`)}</span>
        <span>·</span>
        <span>${relTime(s.updated_at_ms ?? s.updated_at, i18n.t)}</span>
      </div>
    </div>
  `;
}

// Route view: desktop shows list+empty chat hint; mobile shows list only.
export function SessionsView() {
  const mobile = useSignal(isMobile);
  if (mobile) return html`<${Fragment}><${SessionsListPane} /><${NewSessionModal} /><//>`;
  return html`
    <${Fragment}>
      <${SessionsListPane} />
      <${ListResizeHandle} />
      <div class="content-pane">
        <div class="chat chat-empty">${i18n.t('chat.selectSession')}</div>
      </div>
      <${NewSessionModal} />
    <//>
  `;
}

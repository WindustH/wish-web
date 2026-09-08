// In-session history search sheet — SERVER-SIDE (contract: GET
// /sessions/{id}/history/search, bounded snippets, seq keyset). Old daemons
// without the endpoint show an explicit "capability unavailable" notice;
// there is deliberately NO silent client-side full-history fallback.
// Hit click → chat.locate(id, seq) backfills the window and scrolls to the
// exact entry (never "back to bottom").
import { html } from '../../h.js';
import { useEffect, useRef, useState } from 'preact/hooks';
import { Button } from '../../components/button.js';
import { Spinner } from '../../components/spinner.js';
import { Sheet } from '../../components/sheet.js';
import { i18n } from '../../../core/i18n/index.js';
import { chat } from '../../../core/state/chatSlice.js';
import * as api from '../../../core/api/endpoints.js';
import { navigate } from '../../router.js';
import { cfg } from '../../../core/config.js';
import { ChatShell } from './chat.js';

export function SessionSearchView({ route }) {
  const id = route.params.id;
  return html`<${ChatShell} id=${id} tab="search"
    sheet=${html`<${Sheet} title=${i18n.t('search.title')}>
      <${SearchBody} id=${id} />
    <//>`} />`;
}

function SearchBody({ id }) {
  const [q, setQ] = useState('');
  const [state, setState] = useState({ status: 'idle' }); // idle|busy|done|error
  const timer = useRef(null);
  const gen = useRef(0);

  useEffect(() => {
    if (chat.sessionId.peek() !== id) chat.open(id);
  }, [id]);

  // Debounced search with per-query GENERATION: an older query's response
  // can never overwrite a newer one's.
  useEffect(() => {
    clearTimeout(timer.current);
    if (!q.trim()) { gen.current += 1; setState({ status: 'idle' }); return undefined; }
    setState({ status: 'busy' });
    const myGen = ++gen.current;
    timer.current = setTimeout(async () => {
      const res = await runSearch(id, q.trim(), myGen, null);
      if (res && myGen === gen.current) setState(res);
    }, 300);
    return () => clearTimeout(timer.current);
  }, [q]);

  async function runSearch(sid, query, myGen, before) {
    try {
      if (before == null) {
        const out = [];
        let cursor = null, hasMore = false;
        for (let i = 0; i < cfg.history.maxSearchPages; i++) {
          const page = await api.historySearch(sid, {
            q: query, order: 'desc', limit: cfg.history.searchPageSize,
            ...(cursor != null ? { before: cursor } : {}),
          });
          if (myGen !== gen.current) return null;
          if (page.items == null) return null;
          out.push(...page.items);
          hasMore = Boolean(page.has_more);
          if (!hasMore) break;
          cursor = page.items.length ? page.items[page.items.length - 1].seq : null;
          if (cursor == null) break;
        }
        return { status: 'done', q: query, results: out, hasMore, endSeq: cursor, loadingMore: false };
      }
      const page = await api.historySearch(sid, {
        q: query, order: 'desc', limit: cfg.history.searchPageSize, before,
      });
      if (myGen !== gen.current) return null;
      return { page };
    } catch (err) {
      if (myGen === gen.current) return { status: 'error', detail: String(err?.detail || err?.message || err) };
      return null;
    }
  }

  async function more() {
    const myGen = gen.current;
    setState((s) => ({ ...s, loadingMore: true }));
    const res = await runSearch(id, state.q.trim(), myGen, state.endSeq);
    if (!res || myGen !== gen.current) return;
    const page = res.page;
    setState((s) => ({
      ...s,
      status: 'done',
      results: [...s.results, ...(page?.items ?? [])],
      hasMore: Boolean(page?.has_more),
      endSeq: page?.items?.length ? page.items[page.items.length - 1].seq : null,
      loadingMore: false,
    }));
  }

  async function jump(seq) {
    await chat.locate(id, seq);
    navigate(`/s/${id}`);
  }

  return html`
    <input class="input" type="search" autofocus placeholder=${i18n.t('search.placeholder')}
      value=${q} onInput=${(e) => setQ(e.target.value)} />
    <div style="height:12px" />
    ${state.status === 'busy' && html`<${Spinner} label=${i18n.t('common.loading')} />`}
    ${state.status === 'error' && html`
      <div class="hint" style="color:var(--danger,var(--fg-subtle))">${i18n.t('common.error')} — ${state.detail}</div>`}
    ${state.status === 'done' && html`
      <div class="hint" style="font-size:12px;color:var(--fg-subtle);margin-bottom:8px">
        ${i18n.t('search.results', { n: state.results.length })}${state.hasMore ? ' +' : ''}
      </div>
      ${state.results.length === 0 && html`<div class="hint" style="color:var(--fg-subtle)">${i18n.t('search.noResults')}</div>`}
      ${state.results.map((r) => html`<div key=${r.seq ?? r.entry_id} class="search-result"
        onClick=${() => jump(r.seq)}>
        <div class="sr-meta">#${r.seq} · ${r.kind} · ${new Date(r.created_at).toLocaleString(i18n.locale.value)}</div>
        <div class="sr-text">${highlight(r.snippet ?? '', state.q)}</div>
      </div>`)}
      ${state.hasMore && html`<div style="margin-top:12px">
        <${Button} disabled=${state.loadingMore} onClick=${more}>${i18n.t('search.more')}<//>
      </div>`}
    `}
    ${state.status === 'idle' && html`<div class="hint" style="color:var(--fg-subtle);font-size:13px">
      ${i18n.t('search.serverHint')}</div>`}
  `;
}

function highlight(snippet, q) {
  if (!q || !snippet) return snippet;
  const needle = q.trim().toLowerCase();
  const idx = snippet.toLowerCase().indexOf(needle);
  if (idx < 0) return snippet;
  return html`<span>${snippet.slice(0, idx)}<mark>${snippet.slice(idx, idx + needle.length)}</mark>${snippet.slice(idx + needle.length)}</span>`;
}

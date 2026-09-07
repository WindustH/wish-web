// In-session history search. wishd has no server-side message search, so
// this pages /history client-side with an explicit depth budget (see
// from-llm/10 for the proposed backend API).
import { html } from '../../h.js';
import { useEffect, useRef, useState } from 'preact/hooks';
import { Button } from '../../components/button.js';
import { Spinner } from '../../components/spinner.js';
import { i18n } from '../../../core/i18n/index.js';
import { chat } from '../../../core/state/chatSlice.js';
import { navigate } from '../../router.js';
import { cfg } from '../../../core/config.js';

export function SessionSearchView({ route }) {
  const id = route.params.id;
  const [q, setQ] = useState('');
  const [state, setState] = useState({ status: 'idle' }); // idle|busy|done
  const timer = useRef(null);

  useEffect(() => {
    if (chat.sessionId.peek() !== id) chat.open(id);
  }, [id]);

  useEffect(() => {
    clearTimeout(timer.current);
    if (!q.trim()) { setState({ status: 'idle' }); return null; }
    setState({ status: 'busy' });
    timer.current = setTimeout(async () => {
      const res = await chat.searchAll(q, { pages: 3 });
      setState({ status: 'done', q, ...res });
    }, 300);
    return () => clearTimeout(timer.current);
  }, [q]);

  async function deeper() {
    setState((s) => ({ ...s, status: 'busy' }));
    const res = await chat.searchAll(q, { pages: (state.pages || 3) + 4 });
    setState({ status: 'done', q, ...res });
  }

  return html`<div class="panel-scrim" onMouseDown=${(e) => { if (e.target === e.currentTarget) history.back(); }}>
    <div class="panel" role="dialog" aria-label=${i18n.t('search.title')}>
      <div class="panel-head">
        <h2>${i18n.t('search.title')}</h2>
        <${Button} icon="x" variant="ghost" aria-label=${i18n.t('common.close')} onClick=${() => history.back()} />
      </div>
      <div class="panel-body">
        <input class="input" type="search" autoFocus placeholder=${i18n.t('search.placeholder')}
          value=${q} onInput=${(e) => setQ(e.target.value)} />
        <div style="height:12px" />
        ${state.status === 'busy' && html`<${Spinner} label=${i18n.t('common.loading')} />`}
        ${state.status === 'done' && html`
          <div class="hint" style="font-size:12px;color:var(--fg-subtle);margin-bottom:8px">
            ${i18n.t('search.results', { n: state.results.length })}
            · ${i18n.t('search.depth', { pages: state.pages, n: state.entriesScanned })}
          </div>
          ${state.results.length === 0 && html`<div class="hint" style="color:var(--fg-subtle)">${i18n.t('search.noResults')}</div>`}
          ${state.results.map((r) => html`<div key=${r.seq ?? r.id} class="search-result"
            onClick=${() => navigate(`/s/${id}`)}>
            <div class="sr-meta">#${r.seq} · ${r.kind} · ${new Date(r.created_at).toLocaleString()}</div>
            <div class="sr-text">${highlight(entryText(r), state.q)}</div>
          </div>`)}
          ${state.hasMore && html`<div style="margin-top:12px">
            <${Button} onClick=${deeper}>${i18n.t('search.searchAll')}<//>
          </div>`}
        `}
        ${state.status === 'idle' && html`<div class="hint" style="color:var(--fg-subtle);font-size:13px">
          ${i18n.t('search.placeholder')} (max ${cfg.history.maxSearchPages} × ${cfg.history.searchPageSize})</div>`}
      </div>
    </div>
  </div>`;
}

function entryText(e) {
  const blocks = e?.payload?.content;
  if (Array.isArray(blocks)) return blocks.map((b) => b.text || (b.name ? `${b.name} ${JSON.stringify(b.arguments ?? '')}` : '')).join(' ').trim();
  return '';
}

function highlight(text, q) {
  if (!q) return text;
  const idx = text.toLowerCase().indexOf(q.toLowerCase());
  if (idx < 0) return text.slice(0, 160);
  const from = Math.max(0, idx - 60);
  const parts = [];
  if (from > 0) parts.push('…');
  parts.push(text.slice(from, idx));
  parts.push(html`<mark>${text.slice(idx, idx + q.length)}</mark>`);
  parts.push(text.slice(idx + q.length, idx + q.length + 120));
  return parts;
}

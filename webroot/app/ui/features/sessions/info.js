// Session info & stats overlay: snapshot, context/usage stats, recent runs.
import { html } from '../../h.js';
import { useEffect, useState } from 'preact/hooks';
import { useSignal } from '../../hooks.js';
import { Icon } from '../../components/icon.js';
import { Button } from '../../components/button.js';
import { Spinner } from '../../components/spinner.js';
import { i18n } from '../../../core/i18n/index.js';
import { chat } from '../../../core/state/chatSlice.js';
import * as api from '../../../core/api/endpoints.js';
import { fmtTokens, fmtBytes } from '../../../core/util/fmt.js';

export function SessionInfoView({ route }) {
  const id = route.params.id;
  const [usage, setUsage] = useState(null);
  const [runs, setRuns] = useState(null);
  const snapshot = useSignal(chat.snapshot);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (chat.sessionId.peek() !== id) chat.open(id);
    setBusy(true);
    Promise.all([
      api.sessionUsage(id).catch(() => null),
      api.sessionRuns(id, { limit: 10 }).catch(() => null),
    ]).then(([u, r]) => { setUsage(u); setRuns(r); }).finally(() => setBusy(false));
  }, [id]);

  const total = usage?.statistics?.by_provider_model?.[0]?.totals;
  const tokens = total?.tokens;

  return html`<div class="panel-scrim" onMouseDown=${(e) => { if (e.target === e.currentTarget) history.back(); }}>
    <div class="panel" role="dialog" aria-label=${i18n.t('info.title')}>
      <div class="panel-head">
        <h2>${i18n.t('info.title')}</h2>
        <${Button} icon="refresh" variant="ghost" onClick=${() => {
          api.sessionGet(id).then(() => chat.open(id));
          api.sessionUsage(id).then(setUsage).catch(() => {});
          api.sessionRuns(id, { limit: 10 }).then(setRuns).catch(() => {});
        }}>${i18n.t('info.refresh')}<//>
        <${Button} icon="x" variant="ghost" aria-label=${i18n.t('common.close')} onClick=${() => history.back()} />
      </div>
      <div class="panel-body">
        ${!snapshot && html`<${Spinner} label=${i18n.t('common.loading')} />`}
        ${snapshot && html`
          <div class="section-title">${i18n.t('stats.overview')}</div>
          <dl class="kv">
            <dt>${i18n.t('info.provider')}</dt><dd>${snapshot.provider || '—'}</dd>
            <dt>${i18n.t('info.model')}</dt><dd>${snapshot.model || '—'}</dd>
            <dt>${i18n.t('info.phase')}</dt><dd>${i18n.t(`phase.${snapshot.phase || 'unknown'}`)}</dd>
            <dt>${i18n.t('info.queue')}</dt><dd>${snapshot.queue ?? 0}</dd>
            <dt>${i18n.t('info.generation')}</dt><dd>#${snapshot.generation ?? '—'}${snapshot.standby_generation ? ` (standby #${snapshot.standby_generation})` : ''}</dd>
            <dt>${i18n.t('info.storage')}</dt><dd>${snapshot.storage_state || 'hot'}</dd>
            <dt>${i18n.t('info.createdAt')}</dt><dd>${new Date(snapshot.created_at).toLocaleString()}</dd>
            <dt>${i18n.t('info.updatedAt')}</dt><dd>${new Date(snapshot.updated_at).toLocaleString()}</dd>
          </dl>
          ${snapshot.agent_custom != null && html`
            <div class="section-title">${i18n.t('info.agentCustom')}</div>
            <div style="font-size:13px;color:var(--fg-muted);white-space:pre-wrap">${snapshot.agent_custom || '—'}</div>`}
        `}
        <div class="section-title">${i18n.t('info.usage')}</div>
        ${usage && html`<dl class="kv">
          <dt>${i18n.t('stats.attempts')}</dt><dd>${usage.statistics.attempts_with_usage ?? 0}</dd>
          <dt>${i18n.t('stats.tokensIn')}</dt><dd>${fmtTokens(tokens?.input_tokens)}</dd>
          <dt>${i18n.t('stats.tokensOut')}</dt><dd>${fmtTokens(tokens?.output_tokens)}</dd>
          <dt>${i18n.t('stats.tokensTotal')}</dt><dd>${fmtTokens(tokens?.total_tokens)}</dd>
          <dt>${i18n.t('stats.cacheHit')}</dt><dd>${total?.cache ? Math.round((total.cache.request_hit_ratio || 0) * 100) + '%' : '—'}</dd>
        </dl>`}
        ${busy && html`<div><${Spinner} label=${i18n.t('common.loading')} /></div>`}
        <div class="section-title">${i18n.t('info.runs')}</div>
        ${runs && (runs.items || []).map((r) => html`<div key=${r.id} class="search-result">
          <div class="sr-meta">${new Date(r.created_at).toLocaleString()} · ${r.state || r.status || ''} ${r.id.slice(0, 8)}</div>
          <div class="sr-text">${r.kind || 'run'}${r.error ? ` — ${r.error}` : ''}</div>
        </div>`)}
        ${runs && !(runs.items || []).length && html`<div class="hint" style="color:var(--fg-subtle);font-size:13px">${i18n.t('common.empty')}</div>`}
      </div>
    </div>
  </div>`;
}

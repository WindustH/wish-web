// Session info & stats sheet: snapshot, context/usage stats, recent runs.
// Desktop: right drawer. Mobile: second-level page. (see components/sheet)
import { html } from '../../h.js';
import { useEffect, useState } from 'preact/hooks';
import { useSignal } from '../../hooks.js';
import { Button } from '../../components/button.js';
import { Spinner } from '../../components/spinner.js';
import { Sheet } from '../../components/sheet.js';
import { i18n } from '../../../core/i18n/index.js';
import { chat } from '../../../core/state/chatSlice.js';
import * as api from '../../../core/api/endpoints.js';
import { ChatShell } from './chat.js';
import { fmtTokens, fmtDateTime } from '../../../core/util/fmt.js';

export function SessionInfoView({ route }) {
  const id = route.params.id;
  return html`<${ChatShell} id=${id} tab="info"
    sheet=${html`<${Sheet} title=${i18n.t('info.title')}>
      <${InfoBody} id=${id} />
    <//>`} />`;
}

function InfoBody({ id }) {
  const snapshot = useSignal(chat.snapshot);
  const [usage, setUsage] = useState(null);
  const [runs, setRuns] = useState(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState(null);

  async function refresh() {
    setBusy(true);
    setErr(null);
    try {
      const [snap, usagePage, runsPage] = await Promise.all([
        api.sessionGet(id),
        api.sessionUsage(id),
        api.sessionRuns(id, { limit: 10 }),
      ]);
      setUsage(usagePage);
      setRuns(runsPage);
      if (chat.sessionId.peek() === id) chat.snapshot.value = snap;
    } catch (e) {
      setErr(e);   // visible + retryable — never fake-empty sections (round-4)
    } finally { setBusy(false); }
  }

  useEffect(() => {
    if (chat.sessionId.peek() !== id) chat.open(id);
    refresh();
  }, [id]);

  const total = usage?.statistics?.by_provider_model?.[0]?.totals;
  const tokens = total?.tokens;

  return html`
    <div style="display:flex;justify-content:flex-end;margin-bottom:8px">
      <${Button} icon="refresh-cw" variant="ghost" disabled=${busy} onClick=${refresh}>
        ${i18n.t('info.refresh')}
      <//>
    </div>
    ${!snapshot && html`<${Spinner} label=${i18n.t('common.loading')} />`}
    ${snapshot && html`
      <div class="section-title">${i18n.t('stats.overview')}</div>
      <dl class="kv">
        <dt>${i18n.t('info.provider')}</dt><dd>${snapshot.provider || '—'}</dd>
        <dt>${i18n.t('info.model')}</dt><dd>${snapshot.model || '—'}</dd>
        <dt>${i18n.t('info.phase')}</dt><dd>${i18n.t(`phase.${snapshot.phase || 'unknown'}`)}</dd>
        <dt>${i18n.t('info.queue')}</dt><dd>${snapshot.queue ?? 0}</dd>
        <dt>${i18n.t('info.generation')}</dt><dd>#${snapshot.generation ?? '—'} · ${shortId(snapshot.generation_id)}${snapshot.standby_generation ? ` · ${i18n.t('info.standby')} #${snapshot.standby_generation} ${shortId(snapshot.standby_generation_id)}` : ''}</dd>
        <dt>${i18n.t('info.createdAt')}</dt><dd>${fmtDateTime(snapshot.created_at)}</dd>
        <dt>${i18n.t('info.updatedAt')}</dt><dd>${fmtDateTime(snapshot.updated_at)}</dd>
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
    ${busy && html`<div style="margin-top:8px"><${Spinner} /></div>`}
    ${err && html`<div class="load-error" role="alert">
      ${i18n.t('common.loadFailed')} — ${err.message ?? err}
      <button class="btn btn-ghost btn-sm" onClick=${() => refresh()}>${i18n.t('common.retry')}</button>
    </div>`}
    <div class="section-title">${i18n.t('info.runs')}</div>
    ${runs && (runs.items || []).map((r) => html`<div key=${r.id} class="search-result">
      <div class="sr-meta">${fmtDateTime(r.started_at_ms)} · ${r.state} ${r.id.slice(0, 8)}</div>
      <div class="sr-text">${r.kind || 'run'}${r.error ? ` — ${r.error}` : ''}</div>
    </div>`)}
    ${runs && !(runs.items || []).length && html`<div class="hint" style="color:var(--fg-subtle);font-size:13px">${i18n.t('common.empty')}</div>`}
  `;
}

function shortId(id) { return id ? `…${String(id).slice(-6)}` : ''; }

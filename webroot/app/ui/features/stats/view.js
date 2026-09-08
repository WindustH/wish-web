// Stats page: daemon overview, token usage by model, storage status.
// Auto-refresh while visible (invalidation-driven refresh on top).
import { html } from '../../h.js';
import { useEffect, useState } from 'preact/hooks';
import { useSignal } from '../../hooks.js';
import { Button } from '../../components/button.js';
import { Icon } from '../../components/icon.js';
import { i18n } from '../../../core/i18n/index.js';
import { stats } from '../../../core/state/statsSlice.js';
import { fmtTokens, fmtUptime, fmtBytes, relTime } from '../../../core/util/fmt.js';

export function StatsView() {
  const status = useSignal(stats.status);
  const usage = useSignal(stats.usage);
  const storage = useSignal(stats.storage);
  const version = useSignal(stats.version);
  const loading = useSignal(stats.loading);
  const updatedAt = useSignal(stats.updatedAt);

  useEffect(() => {
    stats.startAuto();
    return () => stats.stopAuto();
  }, []);

  const totals = usage?.statistics?.by_provider_model?.[0]?.totals;
  const tokens = totals?.tokens;

  return html`<div class="page">
    <div class="page-head">
      <h1>${i18n.t('stats.title')}</h1>
      <span style="font-size:12px;color:var(--fg-faint)">
        ${updatedAt ? relTime(updatedAt, i18n.t) : ''}
      </span>
      <${Button} icon="refresh-cw" variant="ghost" onClick=${() => stats.refresh()}
        aria-label=${i18n.t('stats.refresh')} />
    </div>
    <div class="stats-grid">
      <div class="card">
        <div class="section-title">${i18n.t('stats.overview')}</div>
        <div class="stat-row">
          <div class="stat"><div class="v">${status?.counts?.sessions ?? '—'}</div><div class="k">${i18n.t('stats.sessions')}</div></div>
          <div class="stat"><div class="v">${status?.counts?.runs ?? '—'}</div><div class="k">${i18n.t('stats.runs')}</div></div>
          <div class="stat"><div class="v">${status ? fmtUptime(status.uptime_ms) : '—'}</div><div class="k">${i18n.t('stats.uptime')}</div></div>
          <div class="stat"><div class="v">${version?.version ?? '—'}</div><div class="k">wishd</div></div>
        </div>
        <div class="section-title">${i18n.t('stats.queue')}</div>
        <div class="stat-row">
          <div class="stat"><div class="v">${status?.queue?.active_sessions ?? 0}</div><div class="k">active</div></div>
          <div class="stat"><div class="v">${status?.queue?.ready_sessions ?? 0}</div><div class="k">ready</div></div>
          <div class="stat"><div class="v">${status?.queue?.pending_items ?? 0}</div><div class="k">pending items</div></div>
          <div class="stat"><div class="v">${status?.queue?.compacting_sessions ?? 0}</div><div class="k">compacting</div></div>
        </div>
      </div>

      <div class="card">
        <div class="section-title">${i18n.t('stats.usage')}</div>
        <div class="stat-row">
          <div class="stat"><div class="v">${fmtTokens(tokens?.input_tokens)}</div><div class="k">${i18n.t('stats.tokensIn')}</div></div>
          <div class="stat"><div class="v">${fmtTokens(tokens?.output_tokens)}</div><div class="k">${i18n.t('stats.tokensOut')}</div></div>
          <div class="stat"><div class="v">${fmtTokens(tokens?.total_tokens)}</div><div class="k">${i18n.t('stats.tokensTotal')}</div></div>
          <div class="stat"><div class="v">${totals?.cache ? Math.round((totals.cache.request_hit_ratio || 0) * 100) + '%' : '—'}</div><div class="k">${i18n.t('stats.cacheHit')}</div></div>
          <div class="stat"><div class="v">${usage?.statistics?.attempts_with_usage ?? '—'}</div><div class="k">${i18n.t('stats.attempts')}</div></div>
        </div>
        <div class="section-title">${i18n.t('stats.byModel')}</div>
        <table class="table">
          <thead><tr><th>provider</th><th>model</th><th>in</th><th>out</th><th>total</th></tr></thead>
          <tbody>
            ${(usage?.statistics?.by_provider_model || []).map((row) => html`<tr key=${row.provider + row.model}>
              <td>${row.provider}</td><td>${row.model}</td>
              <td>${fmtTokens(row.totals?.tokens?.input_tokens)}</td>
              <td>${fmtTokens(row.totals?.tokens?.output_tokens)}</td>
              <td>${fmtTokens(row.totals?.tokens?.total_tokens)}</td>
            </tr>`)}
          </tbody>
        </table>
      </div>

      <div class="card">
        <div class="section-title">${i18n.t('stats.storage')}</div>
        <dl class="kv">
          <dt>executions</dt><dd>${fmtBytes(storage?.counters?.executions?.total_bytes) || '—'}</dd>
          <dt>blobs</dt><dd>${storage?.counters?.blobs?.count ?? '—'}</dd>
        </dl>
      </div>
      ${loading && html`<div style="text-align:center"><span class="spinner" /></div>`}
    </div>
  </div>`;
}

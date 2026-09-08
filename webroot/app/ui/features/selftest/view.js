// Selftest: sequential checks with green/red results, timings, and details.
// `#/selftest?auto=1` runs immediately; results also land on
// window.__selftestResult for the headless E2E driver.
import { html } from '../../h.js';
import { useEffect, useState } from 'preact/hooks';
import { Button } from '../../components/button.js';
import { Icon } from '../../components/icon.js';
import { i18n } from '../../../core/i18n/index.js';
import { theme } from '../../../core/theme/index.js';
import { platform } from '../../../platform/index.js';
import { createSse } from '../../../core/api/sse.js';
import { get } from '../../../core/api/client.js';
import { cfg } from '../../../core/config.js';

const CHECKS = [
  {
    key: 'selftest.mod', detail: () => 'core/config, api/client, api/sse, state/reactive, i18n, theme',
    run: async () => {
      const mods = [
        '../../../core/config.js', '../../../core/api/client.js', '../../../core/api/sse.js',
        '../../../core/state/reactive.js', '../../../core/i18n/index.js', '../../../core/theme/index.js',
        '../../router.js', '../../icons.js',
      ];
      for (const m of mods) await import(m);
      return `${mods.length} modules`;
    },
  },
  {
    key: 'selftest.icons', run: async () => {
      const { ICONS } = await import('../../icons.js');
      const n = Object.keys(ICONS).length;
      if (n < 40) throw new Error(`only ${n} icons`);
      return `${n} icons vendored`;
    },
  },
  {
    key: 'selftest.i18n', run: async () => {
      const cur = i18n.locale.peek();
      for (const l of cfg.i18n.locales) {
        if (!i18n.setLocale(l)) throw new Error(`setLocale(${l}) rejected`);
        if (i18n.t('app.name') == null) throw new Error('t() broken');
      }
      i18n.setLocale(cur);
      if (document.documentElement.lang !== cur) throw new Error(`html.lang=${document.documentElement.lang}`);
      return `zh/en round-trip, html.lang=${document.documentElement.lang}`;
    },
  },
  {
    key: 'selftest.theme', run: async () => {
      const modes = ['light', 'dark', 'auto'];
      for (const m of modes) {
        theme.setMode(m);
        await new Promise((r) => setTimeout(r, 20));
        const attr = document.documentElement.dataset.theme;
        const expect = m === 'auto' ? (matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light') : m;
        if (attr !== expect) throw new Error(`mode=${m} → data-theme=${attr}`);
      }
      theme.setMode(cfg.theme.defaultMode);
      return `data-theme cycles ${modes.join('/')}`;
    },
  },
  {
    key: 'selftest.storage', run: async () => {
      const s = platform('storage');
      s.set('selftest.probe', 'ok');
      const v = s.get('selftest.probe');
      s.remove('selftest.probe');
      if (v !== 'ok') throw new Error(`roundtrip=${v}`);
      return `backend=${s.backend || 'memory'}`;
    },
  },
  {
    key: 'selftest.api', run: async () => {
      const v = await get('/version');
      if (!v || !v.name) throw new Error('bad /version payload');
      return `${v.name} ${v.version}`;
    },
  },
  {
    key: 'selftest.sessions', run: async () => {
      const page = await get('/sessions', { query: { limit: 1 } });
      if (!Array.isArray(page.items)) throw new Error('no items array');
      return `${page.items.length} row(s), count_kind=${page.count_kind}`;
    },
  },
  {
    key: 'selftest.sse', run: async () => {
      const first = await new Promise((resolve, reject) => {
        const sse = createSse({
          url: `${cfg.api.baseUrl}/sync/events`,
          firstTimeoutMs: cfg.sse.firstFrameTimeoutMs,
          onFrame: (f) => { if (f.event) { cleanup(); resolve(f.event); } },
        });
        const timer = setTimeout(() => { cleanup(); reject(new Error(`first frame > ${cfg.sse.firstFrameTimeoutMs}ms`)); }, cfg.sse.firstFrameTimeoutMs);
        function cleanup() { clearTimeout(timer); setTimeout(() => sse.close(), 0); }
      });
      return `first event: ${first}`;
    },
  },
  {
    key: 'selftest.vendor', run: async () => {
      const assets = [
        '/vendor/preact/preact.module.js', '/vendor/preact/hooks.module.js',
        '/vendor/htm/htm.module.js',
      ];
      for (const a of assets) {
        const r = await fetch(a);
        if (!r.ok) throw new Error(`${a} → ${r.status}`);
      }
      return `${assets.length} modules fetch ok`;
    },
  },
  {
    key: 'selftest.sw', optional: true, run: async () => {
      if (!('serviceWorker' in navigator)) return i18n.t('selftest.swUnsupported');
      const reg = await navigator.serviceWorker.getRegistration();
      return reg ? `registered: ${reg.scope}` : 'not registered (first load)';
    },
  },
];

export function SelftestView({ route }) {
  const [results, setResults] = useState(CHECKS.map((c) => ({ key: c.key, status: 'pending' })));
  const [running, setRunning] = useState(false);
  const auto = route?.query?.auto === '1';

  useEffect(() => { if (auto) runAll(); }, []);

  async function runAll() {
    setRunning(true);
    const out = [];
    for (const c of CHECKS) {
      const t0 = performance.now();
      let entry = { key: c.key, status: 'running' };
      setResults((r) => [...r.filter((x) => x.key !== c.key), entry]);
      try {
        const detail = await c.run();
        entry = { key: c.key, status: 'pass', ms: Math.round(performance.now() - t0), detail };
      } catch (err) {
        entry = { key: c.key, status: c.optional ? 'skip' : 'fail', ms: Math.round(performance.now() - t0),
          detail: String(err?.message || err) };
      }
      out.push(entry);
      setResults((r) => [...r.filter((x) => x.key !== c.key), entry]);
    }
    setRunning(false);
    const pass = out.filter((x) => x.status === 'pass').length;
    window.__selftestResult = { pass, total: out.filter((x) => x.status !== 'skip').length,
      allPass: out.every((x) => x.status === 'pass' || x.status === 'skip'), results: out };
  }

  const pass = results.filter((r) => r.status === 'pass').length;
  const fail = results.filter((r) => r.status === 'fail').length;

  return html`<div class="page">
    <div class="page-head">
      <h1>${i18n.t('selftest.title')}</h1>
      <span style="font-size:12px;color:${fail ? 'var(--err)' : 'var(--fg-faint)'}">
        ${i18n.t('selftest.summary', { pass: pass + results.filter((r) => r.status === 'skip').length, total: results.length })}
      </span>
      <${Button} variant="primary" disabled=${running} onClick=${runAll}
        icon=${running ? 'loader-circle' : 'play'}>
        ${running ? i18n.t('selftest.running') : i18n.t('selftest.run')}
      <//>
    </div>
    <div class="st-list">
      <div style="font-size:13px;color:var(--fg-subtle)">${i18n.t('selftest.desc')}</div>
      ${results.map((r) => html`<div key=${r.key} class="st-item ${r.status}">
        <span class="st-ic">
          ${r.status === 'pass' && html`<${Icon} name="check" class="sm" style="width:12px;height:12px" />`}
          ${r.status === 'fail' && html`<${Icon} name="x" class="sm" style="width:12px;height:12px" />`}
          ${r.status === 'running' && html`<span class="spinner" style="width:12px;height:12px;border-width:2px" />`}
        </span>
        <span class="st-name">${i18n.t(r.key)}</span>
        <span class="st-detail">${r.detail || ''} ${r.ms != null ? `· ${r.ms}ms` : ''}</span>
      </div>`)}
    </div>
  </div>`;
}

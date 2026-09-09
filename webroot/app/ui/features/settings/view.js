// Settings with three tabs: UI preferences (local), wishd configuration and
// wish-providerd configuration. Each daemon tab owns its loading/error/retry
// state — one backend being down never affects the others or the UI tab.
// Catalog reads for providerd go through the providerd client (endpoints),
// never a wishd passthrough.
import { html } from '../../h.js';
import { useSignal, useMedia } from '../../hooks.js';
import { useState, useEffect, useRef } from 'preact/hooks';
import { navigate } from '../../router.js';
import { Button } from '../../components/button.js';
import { Icon } from '../../components/icon.js';
import { toast } from '../../components/toast.js';
import { i18n as i18nCore } from '../../../core/i18n/index.js';
import { theme } from '../../../core/theme/index.js';
import { prefs } from '../../../core/state/prefsSlice.js';
import { platform, tryPlatform } from '../../../platform/index.js';
import * as api from '../../../core/api/endpoints.js';
import { cfg } from '../../../core/config.js';

const TABS = ['ui', 'wishd', 'providerd'];

export function SettingsView() {
  const [tab, setTab] = useState('ui');
  useSignal(i18nCore.locale);   // tab labels must follow language switches
  const tabRefs = useRef([]);
  const onTabsKey = (e) => {
    // WAI-ARIA tabs: ArrowLeft/Right move focus AND select.
    if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') return;
    e.preventDefault();
    const cur = TABS.indexOf(tab);
    const next = (cur + (e.key === 'ArrowRight' ? 1 : TABS.length - 1)) % TABS.length;
    setTab(TABS[next]);
    tabRefs.current[next]?.focus();
  };
  return html`<div class="page">
    <div class="page-head"><h1>${i18nCore.t('settings.title')}</h1></div>
    <div class="settings-tabs" role="tablist" aria-label=${i18nCore.t('settings.title')} onKeyDown=${onTabsKey}>
      ${TABS.map((t, i) => html`
        <button key=${t} id=${`stab-${t}`} role="tab" type="button" ref=${(el) => { tabRefs.current[i] = el; }}
          tabindex=${tab === t ? 0 : -1}
          aria-selected=${tab === t} aria-controls=${`spanel-${t}`}
          class="settings-tab ${tab === t ? 'active' : ''}"
          onClick=${() => setTab(t)}>${i18nCore.t(`settings.tab.${t}`)}</button>`)}
    </div>
    <div class="settings-list" role="tabpanel" id=${`spanel-${tab}`} aria-labelledby=${`stab-${tab}`}>
      ${tab === 'ui' && html`<${UiTab} />`}
      ${tab === 'wishd' && html`<${WishdTab} />`}
      ${tab === 'providerd' && html`<${ProviderdTab} />`}
    </div>
  </div>`;
}

function UiTab() {
  const mode = useSignal(theme.mode);
  const locale = useSignal(i18nCore.locale);
  const sendOnEnter = useSignal(prefs.sendOnEnter);
  const keepAwake = useSignal(prefs.keepAwake);
  const notifyOnFailure = useSignal(prefs.notifyOnFailure);
  const isDesktop = useMedia(`(min-width: ${cfg.breakpoints.desktop}px)`);
  const app = tryPlatform('app');
  const storage = tryPlatform('storage');

  return html`
    <div class="card">
      <div class="section-title">${i18nCore.t('settings.general')}</div>
      <div class="setting-row">
        <div><div class="label">${i18nCore.t('settings.theme')}</div></div>
        <div class="seg" role="radiogroup">
          ${cfg.theme.modes.map((m) => html`<button key=${m}
            class=${mode === m ? 'active' : ''} role="radio" aria-checked=${mode === m}
            onClick=${() => theme.setMode(m)}>${i18nCore.t(`settings.theme.${m}`)}</button>`)}
        </div>
      </div>
      <div class="setting-row">
        <div><div class="label">${i18nCore.t('settings.language')}</div></div>
        <div class="seg">
          ${cfg.i18n.locales.map((l) => html`<button key=${l}
            class=${locale === l ? 'active' : ''}
            onClick=${() => i18nCore.setLocale(l)}>${l === 'zh' ? '中文' : 'English'}</button>`)}
        </div>
      </div>
    </div>

    <div class="card">
      <div class="section-title">${i18nCore.t('settings.notifications')}</div>
      <div class="setting-row">
        <div>
          <div class="label">${i18nCore.t('settings.notifyOnFailure')}</div>
          <div class="hint">${i18nCore.t('settings.notifyOnFailureHint')}</div>
        </div>
        <button class="switch ${notifyOnFailure ? 'on' : ''}" role="switch" aria-checked=${notifyOnFailure}
          onClick=${async () => {
            if (!notifyOnFailure) {
              const notify = platform('notify');
              if (!notify.isSupported) { toast(i18nCore.t('settings.notifyDenied')); return; }
              let perm;
              try { perm = await notify.request(); }
              catch (err) { toast(i18nCore.t('common.loadFailed') + ': ' + (err?.message ?? err)); return; }
              if (perm !== 'granted') { toast(i18nCore.t('settings.notifyDenied')); return; }
            }
            prefs.setNotifyOnFailure(!notifyOnFailure);
          }} />
      </div>
    </div>

    <div class="card">
      <div class="section-title">${isDesktop ? i18nCore.t('settings.desktop') : i18nCore.t('settings.mobile')}</div>
      ${isDesktop && html`<div class="setting-row">
        <div>
          <div class="label">${i18nCore.t('settings.sendOnEnter')}</div>
          <div class="hint">${i18nCore.t(sendOnEnter ? 'settings.sendOnEnter' : 'settings.sendOnEnterOff')}</div>
        </div>
        <button class="switch ${sendOnEnter ? 'on' : ''}" role="switch" aria-checked=${sendOnEnter}
          onClick=${() => prefs.setSendOnEnter(!sendOnEnter)} />
      </div>`}
      ${!isDesktop && html`<div class="setting-row">
        <div><div class="label">${i18nCore.t('settings.keepAwake')}</div></div>
        <button class="switch ${keepAwake ? 'on' : ''}" role="switch" aria-checked=${keepAwake}
          onClick=${() => prefs.setKeepAwake(!keepAwake)} />
      </div>`}
    </div>

    <div class="card">
      <div class="section-title">${i18nCore.t('settings.appShell')}</div>
      <div class="setting-row">
        <div><div class="label">PWA</div>
          <div class="hint">${app?.isStandalone() ? i18nCore.t('settings.installed') : 'manifest + sw registered'}</div>
        </div>
        <${Button} icon="download" onClick=${async () => {
          const ok = await app?.promptInstall?.();
          if (ok === false) toast('—');
        }}>${i18nCore.t('settings.pwaInstall')}<//>
      </div>
      <div class="setting-row">
        <div><div class="label">${i18nCore.t('settings.selftest')}</div></div>
        <${Button} icon="activity" onClick=${() => navigate('/selftest')} />
      </div>
      <div class="section-title">${i18nCore.t('settings.storage')}</div>
      <div class="setting-row">
        <div><div class="label">${storage?.backend || '—'}</div>
          <div class="hint">${i18nCore.t('settings.storage')}</div></div>
        <${Button} variant="danger" onClick=${() => { storage?.clear(); toast(i18nCore.t('settings.cleared')); }}>
          ${i18nCore.t('settings.clearStorage')}
        <//>
      </div>
    </div>

    <div class="card">
      <div class="section-title">${i18nCore.t('settings.about')}</div>
      <div class="setting-row">
        <div><div class="label">${i18nCore.t('settings.version', { v: cfg.meta.appVersion })}</div></div>
        <${Icon} name="sparkles" class="lg" style="color:var(--fg-faint)" />
      </div>
    </div>`;
}

/** Redacted JSON viewer + reload, one instance per daemon. Failures show a
 *  retry affordance — a dead backend must not render as an empty config. */
function ConfigViewer({ load, reload, reloadDone, effectivePick }) {
  const [cfgText, setCfgText] = useState(null);   // null = loading
  const [err, setErr] = useState(null);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState(null);

  const aliveRef = useRef(true);
  useEffect(() => () => { aliveRef.current = false; }, []);
  async function refresh() {
    setCfgText(null); setErr(null);
    try {
      const res = await load();
      if (aliveRef.current) setCfgText(JSON.stringify(effectivePick ? effectivePick(res) : res, null, 2));
    } catch (e) { if (aliveRef.current) setErr(e); }
  }
  useEffect(() => { refresh(); }, []);

  async function doReload() {
    if (busy) return;
    setBusy(true); setMsg(null);
    try {
      const res = await reload();
      if (!aliveRef.current) return;   // tab switched away — drop the result
      setMsg({ kind: 'ok', text: await reloadDone(res) });
      refresh();
    } catch (e) {
      if (aliveRef.current) setMsg({ kind: 'err', text: String(e?.detail || e?.message || e) });
    } finally {
      if (aliveRef.current) setBusy(false);
    }
  }

  return html`
    ${err && html`<div class="load-error" role="alert" style="margin:6px 0">
      ${i18nCore.t('common.loadFailed')}: ${String(err?.detail || err?.message || err)}
      <button class="btn btn-ghost btn-sm" onClick=${refresh}>${i18nCore.t('common.retry')}</button>
    </div>`}
    ${!err && html`<pre class="config-view">${cfgText ?? i18nCore.t('common.loading')}</pre>`}
    <div style="display:flex;gap:8px;margin-top:8px">
      <${Button} icon="refresh-cw" disabled=${busy} onClick=${doReload}>${i18nCore.t('settings.reloadConfig')}<//>
    </div>
    ${msg && html`<div class="badge ${msg.kind === 'ok' ? 'ok' : 'err'}" style="margin-top:8px">${msg.text}</div>`}`;
}

function WishdTab() {
  const [streaming, setStreaming] = useState(null);   // null=loading | {enabled,generation} | {err}
  const [busy, setBusy] = useState(false);
  const aliveRef = useRef(true);
  useEffect(() => () => { aliveRef.current = false; }, []);

  function load() {
    setStreaming(null);
    api.streamingGet()
      .then((st) => { if (aliveRef.current) setStreaming({ enabled: Boolean(st.enabled), generation: st.config_generation }); })
      .catch((e) => { if (aliveRef.current) setStreaming({ err: e }); });
  }
  useEffect(() => { load(); }, []);

  async function putStreaming(next) {
    if (busy || !streaming || streaming.err) return;   // no concurrent optimistic toggles
    const prev = streaming;
    setBusy(true);
    setStreaming({ ...prev, enabled: next });         // optimistic
    try {
      const st = await api.streamingPut(next);         // strict {enabled} body
      if (!aliveRef.current) return;
      setStreaming({ enabled: Boolean(st.enabled), generation: st.config_generation });
      toast(i18nCore.t('settings.streamingApplied'));
    } catch (e) {
      if (!aliveRef.current) return;
      setStreaming(prev);
      toast(String(e?.detail || e?.message || e));
    } finally {
      if (aliveRef.current) setBusy(false);
    }
  }

  return html`
    <div class="card">
      <div class="section-title">${i18nCore.t('settings.streaming')}</div>
      ${streaming?.err && html`<div class="load-error" role="alert">
        ${i18nCore.t('common.loadFailed')}: ${String(streaming.err?.detail || streaming.err?.message || streaming.err)}
        <button class="btn btn-ghost btn-sm" onClick=${load}>${i18nCore.t('common.retry')}</button>
      </div>`}
      ${!streaming && html`<div class="hint">${i18nCore.t('common.loading')}…</div>`}
      ${streaming && !streaming.err && html`
        <div class="setting-row">
          <div>
            <div class="label">${i18nCore.t('settings.streamingToggle')}</div>
            <div class="hint">${i18nCore.t('settings.streamingBoundary')}</div>
          </div>
          <button class="switch ${streaming.enabled ? 'on' : ''}" role="switch" disabled=${busy}
            aria-checked=${streaming.enabled}
            onClick=${() => putStreaming(!streaming.enabled)} />
        </div>`}
      <div class="section-title">${i18nCore.t('settings.daemonConfig')}</div>
      <${ConfigViewer}
        load=${() => api.configEffective()}
        reload=${() => api.configReload()}
        reloadDone=${(res) => {
          // Exact wishd contract: restart_required lists pending sections.
          const sections = res?.restart_required ?? [];
          return sections.length
            ? i18nCore.t('settings.restartRequired', { sections: sections.join(', ') })
            : i18nCore.t('settings.reloadDone', { sections: 'ok' });
        }} />
    </div>`;
}

function ProviderdTab() {
  const [providers, setProviders] = useState(null); // null=loading | [{...}] | {err}
  const [listErr, setListErr] = useState(null);
  const aliveRef = useRef(true);
  useEffect(() => () => { aliveRef.current = false; }, []);
  function loadProviders() {
    setProviders(null); setListErr(null);
    api.providerConfigs()
      .then((d) => { if (aliveRef.current) setProviders(d.providers ?? []); })
      .catch((e) => { if (aliveRef.current) setListErr(e); });
  }
  useEffect(() => { loadProviders(); }, []);

  return html`
    <div class="card">
      <div class="section-title">${i18nCore.t('settings.providerdProviders')}</div>
      ${listErr && html`<div class="load-error" role="alert">
        ${i18nCore.t('common.loadFailed')}: ${String(listErr?.detail || listErr?.message || listErr)}
        <button class="btn btn-ghost btn-sm" onClick=${loadProviders}>${i18nCore.t('common.retry')}</button>
      </div>`}
      ${!listErr && !providers && html`<div class="hint">${i18nCore.t('common.loading')}…</div>`}
      ${Array.isArray(providers) && providers.length === 0 && html`<div class="hint">${i18nCore.t('new.noProviders')}</div>`}
      ${Array.isArray(providers) && providers.map((p) => html`
        <div class="setting-row" key=${p.id}>
          <div>
            <div class="label">${p.id}${p.enabled === false ? ` · ${i18nCore.t('common.disabled')}` : ''}</div>
            <div class="hint">${p.protocol ?? ''} ${p.models ? Object.keys(p.models).join(', ') : i18nCore.t('new.anyModel')}</div>
          </div>
        </div>`)}
      <div class="section-title">${i18nCore.t('settings.daemonConfig')}</div>
      <${ConfigViewer}
        load=${() => api.providerdEffective()}
        reload=${() => api.providerdReload()}
        effectivePick=${(res) => res.providerd}
        reloadDone=${(res) => { loadProviders(); return i18nCore.t('settings.reloadDoneGen', { gen: res?.config_generation ?? '?' }); }} />
    </div>`;
}

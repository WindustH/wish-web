// Settings: general + per-form-factor sections (desktop/mobile/app shell)
// + advanced area behind a show/hide toggle (daemon config, reload).
// UI prefs persist via the platform storage adapter.
import { html } from '../../h.js';
import { useEffect, useState } from 'preact/hooks';
import { useSignal, useMedia } from '../../hooks.js';
import { Button } from '../../components/button.js';
import { Icon } from '../../components/icon.js';
import { i18n } from '../../../core/i18n/index.js';
import { cfg } from '../../../core/config.js';
import { theme } from '../../../core/theme/index.js';
import { i18n as i18nCore } from '../../../core/i18n/index.js';
import { prefs } from '../../../core/state/prefsSlice.js';
import { stats } from '../../../core/state/statsSlice.js';
import { platform, tryPlatform } from '../../../platform/index.js';
import * as api from '../../../core/api/endpoints.js';
import { navigate } from '../../router.js';
import { toast } from '../../components/toast.js';

export function SettingsView() {
  const mode = useSignal(theme.mode);
  const locale = useSignal(i18nCore.locale);
  const sendOnEnter = useSignal(prefs.sendOnEnter);
  const keepAwake = useSignal(prefs.keepAwake);
  const advanced = useSignal(prefs.showAdvanced);
  const version = useSignal(stats.version);
  const isDesktop = useMedia(`(min-width: ${cfg.breakpoints.desktop}px)`);
  const [daemonCfg, setDaemonCfg] = useState(null);
  const [reloadMsg, setReloadMsg] = useState(null);

  useEffect(() => { stats.refresh(); }, []);

  async function loadDaemonCfg() {
    try { setDaemonCfg(JSON.stringify(await api.configEffective(), null, 2)); }
    catch (e) { setDaemonCfg(String(e?.detail || e)); }
  }
  useEffect(() => { if (advanced) loadDaemonCfg(); }, [advanced]);

  async function reloadConfig() {
    try {
      const res = await api.configReload();
      const sections = res?.restart_required ?? res?.restart_required_sections ?? [];
      setReloadMsg(sections.length
        ? { kind: 'restart', text: i18nCore.t('settings.restartRequired', { sections: sections.join(', ') }) }
        : { kind: 'ok', text: i18nCore.t('settings.reloadDone', { sections: 'ok' }) });
      loadDaemonCfg();
    } catch (e) { toast(String(e?.detail || e?.message || e)); }
  }

  const app = tryPlatform('app');
  const storage = tryPlatform('storage');

  return html`<div class="page">
    <div class="page-head"><h1>${i18nCore.t('settings.title')}</h1></div>
    <div class="settings-list">

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
          <div>
            <div class="label">${i18nCore.t('settings.keepAwake')}</div>
          </div>
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
      </div>

      <div class="card">
        <div class="setting-row">
          <div><div class="label">${i18nCore.t('settings.advanced')}</div></div>
          <${Button} icon=${advanced ? 'chevron-up' : 'chevron-down'}
            onClick=${() => prefs.setShowAdvanced(!advanced)}>
            ${advanced ? i18nCore.t('settings.hideAdvanced') : i18nCore.t('settings.showAdvanced')}
          <//>
        </div>
        ${advanced && html`
          <div class="section-title">${i18nCore.t('settings.daemonConfig')}</div>
          <pre class="config-view">${daemonCfg ?? i18nCore.t('common.loading')}</pre>
          <div style="display:flex;gap:8px;margin-top:8px">
            <${Button} icon="refresh-cw" onClick=${reloadConfig}>${i18nCore.t('settings.reloadConfig')}<//>
          </div>
          ${reloadMsg && html`<div class="badge ${reloadMsg.kind === 'ok' ? 'ok' : 'err'}" style="margin-top:8px">${reloadMsg.text}</div>`}
          <div class="section-title">${i18nCore.t('settings.storage')}</div>
          <div class="setting-row">
            <div><div class="label">${storage?.backend || '—'}</div>
              <div class="hint">${i18nCore.t('settings.storage')}</div></div>
            <${Button} variant="danger" onClick=${() => { storage?.clear(); toast(i18nCore.t('settings.cleared')); }}>
              ${i18nCore.t('settings.clearStorage')}
            <//>
          </div>`}
      </div>

      <div class="card">
        <div class="section-title">${i18nCore.t('settings.about')}</div>
        <div class="setting-row">
          <div><div class="label">${i18nCore.t('settings.version', { v: version?.version ?? '—' })}</div></div>
          <${Icon} name="sparkles" class="lg" style="color:var(--fg-faint)" />
        </div>
      </div>
    </div>
  </div>`;
}
void platform;

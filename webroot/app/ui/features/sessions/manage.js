// Session management overlay: rename, compact, reset, interrupt, clone,
// prune — each with confirmation. Actions map 1:1 onto wishd endpoints.
import { html } from '../../h.js';
import { useEffect, useState } from 'preact/hooks';
import { useSignal } from '../../hooks.js';
import { Button } from '../../components/button.js';
import { i18n } from '../../../core/i18n/index.js';
import { chat } from '../../../core/state/chatSlice.js';
import { sessions } from '../../../core/state/sessionsSlice.js';
import * as api from '../../../core/api/endpoints.js';
import { toast } from '../../components/toast.js';
import { navigate } from '../../router.js';

export function SessionManageView({ route }) {
  const id = route.params.id;
  const snapshot = useSignal(chat.snapshot);
  const [renaming, setRenaming] = useState('');
  const [confirming, setConfirming] = useState(null); // {action, run}
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (chat.sessionId.peek() !== id) chat.open(id);
    else api.sessionGet(id).then((s) => { chat.snapshot.value = s; }).catch(() => {});
    setRenaming(snapshot?.name || sessions.getById(id)?.name || '');
  }, [id]);

  async function run(action) {
    setBusy(true);
    try {
      const res = await action();
      toast(i18n.t('manage.done'));
      return res;
    } catch (e) {
      toast(String(e?.detail || e?.message || e));
    } finally {
      setBusy(false);
      setConfirming(null);
      api.sessionGet(id).then((s) => { chat.snapshot.value = s; }).catch(() => {});
    }
  }

  const actions = [
    {
      id: 'compact', icon: 'layers', label: i18n.t('manage.compact'), desc: i18n.t('manage.compactDesc'),
      confirm: true, run: () => api.sessionCompact(id),
    },
    {
      id: 'reset', icon: 'refresh-cw', label: i18n.t('manage.reset'), desc: i18n.t('manage.resetDesc'),
      confirm: true, run: () => api.sessionReset(id, {}),
    },
    {
      id: 'interrupt', icon: 'pause', label: i18n.t('manage.interrupt'),
      desc: '', confirm: false, disabled: snapshot?.phase !== 'running',
      run: () => api.sessionInterrupt(id),
    },
    {
      id: 'clone', icon: 'split', label: i18n.t('manage.clone'), desc: i18n.t('manage.cloneDesc'),
      confirm: true, run: async () => {
        const res = await api.sessionClone(id);
        sessions.refresh();
        if (res?.id) navigate(`/s/${res.id}`);
        return res;
      },
    },
    {
      id: 'prune', icon: 'archive', label: i18n.t('manage.prune'), desc: i18n.t('manage.pruneDesc'),
      confirm: true, run: () => api.sessionPrune(id, {}),
    },
  ];

  return html`<div class="panel-scrim" onMouseDown=${(e) => { if (e.target === e.currentTarget) history.back(); }}>
    <div class="panel" role="dialog" aria-label=${i18n.t('manage.title')}>
      <div class="panel-head">
        <h2>${i18n.t('manage.title')}</h2>
        <${Button} icon="x" variant="ghost" aria-label=${i18n.t('common.close')} onClick=${() => history.back()} />
      </div>
      <div class="panel-body">
        <div class="section-title">${i18n.t('manage.rename')}</div>
        <div style="display:flex;gap:8px">
          <input class="input" value=${renaming} placeholder=${i18n.t('manage.renamePlaceholder')}
            onInput=${(e) => setRenaming(e.target.value)} />
          <${Button} variant="primary" disabled=${!renaming.trim() || busy}
            onClick=${() => run(() => sessions.rename(id, renaming.trim()))}>
            ${i18n.t('manage.apply')}
          <//>
        </div>
        <div class="section-title">${i18n.t('manage.title')}</div>
        ${actions.map((a) => html`<div key=${a.id} class="setting-row" style="align-items:flex-start">
          <div>
            <div class="label">${a.label}</div>
            ${a.desc && html`<div class="hint">${a.desc}</div>`}
          </div>
          <${Button} disabled=${busy || a.disabled}
            onClick=${() => (a.confirm ? setConfirming(a) : run(a.run))}>
            ${a.label}
          <//>
        </div>`)}
      </div>
      ${confirming && html`<div class="modal-foot" style="border-top:1px solid var(--line);justify-content:space-between">
        <span style="font-size:13px">${i18n.t('manage.confirm', { action: confirming.label })}</span>
        <span style="display:flex;gap:8px">
          <${Button} onClick=${() => setConfirming(null)}>${i18n.t('manage.cancel')}<//>
          <${Button} variant="primary" onClick=${() => run(confirming.run)}>${i18n.t('manage.confirmYes')}<//>
        </span>
      </div>`}
    </div>
  </div>`;
}

// Session management sheet: rename, compact, reset, interrupt, clone,
// prune — each with confirmation. Actions map 1:1 onto wishd endpoints.
import { html } from '../../h.js';
import { useEffect, useState } from 'preact/hooks';
import { useSignal } from '../../hooks.js';
import { Button } from '../../components/button.js';
import { Sheet } from '../../components/sheet.js';
import { i18n } from '../../../core/i18n/index.js';
import { chat } from '../../../core/state/chatSlice.js';
import { sessions } from '../../../core/state/sessionsSlice.js';
import * as api from '../../../core/api/endpoints.js';
import { toast } from '../../components/toast.js';
import { navigate } from '../../router.js';
import { ChatShell } from './chat.js';

export function SessionManageView({ route }) {
  const id = route.params.id;
  return html`<${ChatShell} id=${id} tab="manage"
    sheet=${html`<${Sheet} title=${i18n.t('manage.title')}>
      <${ManageBody} id=${id} />
    <//>`} />`;
}

function ManageBody({ id }) {
  const snapshot = useSignal(chat.snapshot);
  const [renaming, setRenaming] = useState('');
  const [confirming, setConfirming] = useState(null); // {action, run}
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (chat.sessionId.peek() !== id) chat.open(id);
    else api.sessionGet(id).then((s) => { chat.snapshot.value = s; }).catch(() => {});
    setRenaming(chat.snapshot.peek()?.name || sessions.getById(id)?.name || '');
  }, [id]);

  async function refreshSnapshot() {
    const s = await api.sessionGet(id).catch(() => null);
    if (s && chat.sessionId.peek() === id) chat.snapshot.value = s;
  }

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
      refreshSnapshot();
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

  return html`
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
    <div style="height:80px" />
    ${confirming && html`<div class="confirm-bar">
      <span style="font-size:13px">${i18n.t('manage.confirm', { action: confirming.label })}</span>
      <span style="display:flex;gap:8px">
        <${Button} onClick=${() => setConfirming(null)}>${i18n.t('manage.cancel')}<//>
        <${Button} variant="primary" onClick=${() => run(confirming.run)}>${i18n.t('manage.confirmYes')}<//>
      </span>
    </div>`}
  `;
}

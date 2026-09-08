// Session management sheet: metadata (pin/archive/tags — contract PATCH
// fields), rename, compact, reset, interrupt, clone, prune, DELETE.
// DELETE is PERMANENT (no trash bin on the daemon): explicit confirm, and a
// busy 409 is surfaced without silently interrupting the running turn.
import { html } from '../../h.js';
import { useEffect, useState } from 'preact/hooks';
import { useSignal } from '../../hooks.js';
import { Button } from '../../components/button.js';
import { Icon } from '../../components/icon.js';
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
  const [tagInput, setTagInput] = useState('');

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
      // busy 409: NEVER auto-interrupt — tell the user and let them decide.
      if (e?.status === 409 || e?.code === 'busy' || /busy/i.test(String(e?.code ?? ''))) {
        toast(i18n.t('manage.busy'));
      } else {
        toast(String(e?.detail || e?.message || e));
      }
    } finally {
      setBusy(false);
      setConfirming(null);
      refreshSnapshot();
    }
  }

  const meta = {
    pinned: Boolean(snapshot?.pinned),
    archived: Boolean(snapshot?.archived),
    tags: Array.isArray(snapshot?.tags) ? snapshot.tags : [],
  };

  function patchMeta(patch) {
    return run(() => sessions.updateMeta(id, patch));
  }

  function addTag() {
    const t = tagInput.trim();
    if (!t) return;
    if (meta.tags.includes(t)) { setTagInput(''); return; }
    if (meta.tags.length >= 16 || t.length > 64) { toast(i18n.t('manage.tagsLimit')); return; }
    setTagInput('');
    patchMeta({ tags: [...meta.tags, t] });
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
    <div class="section-title">${i18n.t('manage.meta')}</div>
    <div class="setting-row">
      <div><div class="label">${i18n.t('manage.pin')}</div>
        <div class="hint">${i18n.t('manage.pinDesc')}</div></div>
      <button class="switch ${meta.pinned ? 'on' : ''}" role="switch" aria-checked=${meta.pinned}
        disabled=${busy} onClick=${() => patchMeta({ pinned: !meta.pinned })} />
    </div>
    <div class="setting-row">
      <div><div class="label">${i18n.t('manage.archive')}</div>
        <div class="hint">${i18n.t('manage.archiveDesc')}</div></div>
      <button class="switch ${meta.archived ? 'on' : ''}" role="switch" aria-checked=${meta.archived}
        disabled=${busy} onClick=${() => patchMeta({ archived: !meta.archived })} />
    </div>
    <div class="setting-row" style="align-items:flex-start">
      <div><div class="label">${i18n.t('manage.tags')}</div>
        <div class="hint">${i18n.t('manage.tagsHint')}</div>
        <div class="tag-list" style="margin-top:6px;display:flex;flex-wrap:wrap;gap:6px">
          ${meta.tags.map((t) => html`<button key=${t} class="seg-item on tag-chip" disabled=${busy}
            title=${i18n.t('manage.removeTag')}
            onClick=${() => patchMeta({ tags: meta.tags.filter((x) => x !== t) })}>
            ${t} <${Icon} name="x" class="sm" />
          </button>`)}
          ${meta.tags.length === 0 && html`<span class="hint">—</span>`}
        </div>
      </div>
    </div>
    <div style="display:flex;gap:8px;margin-top:4px">
      <input class="input" value=${tagInput} placeholder=${i18n.t('manage.addTag')}
        disabled=${busy}
        onInput=${(e) => setTagInput(e.target.value)}
        onKeyDown=${(e) => {
          if (e.key === 'Enter' && !(e.isComposing || e.keyCode === 229)) { e.preventDefault(); addTag(); }
        }} />
      <${Button} disabled=${busy || !tagInput.trim()} onClick=${addTag}>${i18n.t('manage.addTag')}<//>
    </div>

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
    <div class="section-title" style="color:var(--danger,#c0392b)">${i18n.t('manage.danger')}</div>
    <div class="setting-row" style="align-items:flex-start">
      <div>
        <div class="label">${i18n.t('manage.delete')}</div>
        <div class="hint">${i18n.t('manage.deleteDesc')}</div>
      </div>
      <${Button} disabled=${busy} onClick=${() => setConfirming({ id: 'delete', label: i18n.t('manage.delete'), run: del })}>
        ${i18n.t('manage.delete')}
      <//>
    </div>
    <div style="height:80px" />
    ${confirming && html`<div class="confirm-bar">
      <span style="font-size:13px">
        ${confirming.id === 'delete'
          ? i18n.t('manage.deleteConfirm')
          : i18n.t('manage.confirm', { action: confirming.label })}
      </span>
      <span style="display:flex;gap:8px">
        <${Button} onClick=${() => setConfirming(null)}>${i18n.t('manage.cancel')}<//>
        <${Button} variant="primary" onClick=${() => run(confirming.run)}>${i18n.t('manage.confirmYes')}<//>
      </span>
    </div>`}
  `;

  async function del() {
    await api.sessionDelete(id);
    sessions.dropRow(id);
    chat.close();
    navigate('/sessions');
  }
}

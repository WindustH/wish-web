// Per-session model settings, opened from the model chip next to the title.
// Selections are captured ONCE from the snapshot (later revisions must not
// silently redefine the user's in-progress choice); If-Match uses the
// revision as of SAVE time. Switching provider never injects the old
// provider's current model into the new list.
import { html } from '../../h.js';
import { useState } from 'preact/hooks';
import { useSignal } from '../../hooks.js';
import { Modal } from '../../components/modal.js';
import { Button } from '../../components/button.js';
import { i18n } from '../../../core/i18n/index.js';
import { chat } from '../../../core/state/chatSlice.js';
import * as api from '../../../core/api/endpoints.js';
import { toast } from '../../components/toast.js';
import { useProviderModels, withCurrent } from './models.js';

export function ModelSettings({ id, onClose }) {
  useSignal(chat.snapshot);            // re-render on snapshot refresh only
  const [initial] = useState(() => {
    const s = chat.snapshot.peek() ?? {};
    return { provider: s.provider ?? '', model: s.model ?? '', effort: s.reasoning_effort ?? '' };
  });
  const { providers, provider, setProvider, models, loading, loadErr, retry } =
    useProviderModels({ initialProvider: initial.provider });
  const [model, setModel] = useState(initial.model);
  const [effort, setEffort] = useState(initial.effort);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState(null);

  // Keep the current model selectable only on ITS OWN provider's list.
  const sameProvider = provider === initial.provider;
  // While the new provider's catalog loads, models is null — the render
  // array must stay an array; "loading" is conveyed by the separate state.
  const choices = (sameProvider ? withCurrent(models, initial.model) : models) ?? [];
  const effortCleared = Boolean(initial.effort) && !effort.trim();
  const changed =
    provider !== initial.provider ||
    model !== initial.model ||
    (!effortCleared && (effort.trim() || '') !== (initial.effort || ''));

  async function save() {
    if (!changed || !provider || !model || effortCleared) return;
    setBusy(true);
    setErr(null);
    try {
      const body = { provider, model };
      const e = effort.trim();
      if (e) body.reasoning_effort = e;
      const rev = chat.snapshot.peek()?.revision ?? null;
      const next = await api.sessionUpdateModel(id, body, rev);
      if (chat.sessionId.peek() === id) {
        chat.snapshot.value = next;
        chat.reloadCapabilities();
      }
      toast(i18n.t('model.saved'));
      onClose();
    } catch (e) {
      // Keep the dialog + selections open; 409 gets a human-readable line.
      setErr(e?.status === 409 ? i18n.t('model.conflict') : String(e?.detail || e?.message || e));
    } finally {
      setBusy(false);
    }
  }

  return html`<${Modal} title=${i18n.t('model.title')} onClose=${onClose} dismissable=${!busy}
    footer=${html`
      <${Button} disabled=${busy} onClick=${onClose}>${i18n.t('manage.cancel')}<//>
      <${Button} variant="primary" disabled=${busy || !changed || !provider || !model || effortCleared} onClick=${save}>
        ${busy ? i18n.t('common.loading') : i18n.t('common.save')}
      <//>`}>
    <div class="field">
      <label>${i18n.t('new.provider')}</label>
      <select class="select" value=${provider} disabled=${busy || !providers}
        onChange=${(e) => { setProvider(e.target.value); setModel(''); }}>
        ${(providers || []).map((p) => html`<option key=${p.id} value=${p.id}>${p.id}</option>`)}
      </select>
    </div>
    <div class="field">
      <label>${i18n.t('new.model')}</label>
      ${loadErr && html`<div class="load-error" role="alert" style="margin:4px 0">
        ${String(loadErr.detail || loadErr.message || loadErr)}
        <button class="btn btn-ghost btn-sm" onClick=${retry}>${i18n.t('common.retry')}</button>
      </div>`}
      ${!loadErr && loading && html`<div class="hint">${i18n.t('common.loading')}…</div>`}
      ${!loadErr && !loading && choices.length === 0 && html`
        <div class="hint" style="font-size:12px;color:var(--fg-subtle)">${i18n.t('new.noModels')}</div>`}
      <select class="select" value=${model} onChange=${(e) => setModel(e.target.value)} disabled=${busy || !choices.length}>
        <option value="">—</option>
        ${choices.map((m) => html`<option key=${m.id} value=${m.id}>${m.id}${m.source === 'current' ? ` (${i18n.t('model.currentSuffix')})` : ''}</option>`)}
      </select>
    </div>
    <div class="field">
      <label>${i18n.t('new.reasoning')}</label>
      <input class="input" placeholder="max / high / medium / low" value=${effort} disabled=${busy}
        onInput=${(e) => setEffort(e.target.value)} />
      ${effortCleared && html`<div class="hint" style="color:var(--warn);margin-top:4px">${i18n.t('model.effortClearUnsupported')}</div>`}
    </div>
    <div class="hint" style="margin-top:6px">${i18n.t('model.nextRunNote')}</div>
    ${err && html`<div class="load-error" role="alert" style="margin-top:10px">${err}</div>`}
  <//>`;
}

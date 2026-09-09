// New session modal: name + provider/model (+ optional reasoning effort,
// agent_custom). Model choices come from provider configs (explicit models
// map first; catalog fetch as fallback), per ui-integration guidance of not
// auto-picking the first catalog entry.
import { html } from '../../h.js';
import { useState, useEffect } from 'preact/hooks';
import { Modal } from '../../components/modal.js';
import { Button } from '../../components/button.js';
import { Spinner } from '../../components/spinner.js';
import { navigate } from '../../router.js';
import { i18n } from '../../../core/i18n/index.js';
import * as api from '../../../core/api/endpoints.js';
import { sessions } from '../../../core/state/sessionsSlice.js';
import { chat } from '../../../core/state/chatSlice.js';
import { useProviderModels } from './models.js';

let openState = { open: false };
const listeners = new Set();
function setOpen(v) { openState = { ...openState, open: v }; listeners.forEach((fn) => fn(openState)); }
NewSessionModal.open = () => setOpen(true);

export function NewSessionModal() {
  const [, force] = useState(0);
  useEffect(() => { const fn = () => force((n) => n + 1); listeners.add(fn); return () => listeners.delete(fn); });
  if (!openState.open) return null;
  return html`<${NewSessionForm} onClose=${() => setOpen(false)} />`;
}

function NewSessionForm({ onClose }) {
  // Shared provider/model loader (decision #5) — same code path as the
  // per-session model settings.
  const { providers, provider, setProvider, models, loadErr, retry } = useProviderModels();
  const [model, setModel] = useState('');
  const [name, setName] = useState('');
  const [effort, setEffort] = useState('');
  const [agentCustom, setAgentCustom] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState(null);

  const canCreate = provider && model && !busy;

  async function create() {
    setBusy(true); setErr(null);
    try {
      const snap = await sessions.create({
        name: name.trim() || undefined, provider, model,
        reasoningEffort: effort.trim() || undefined,
        agentCustom: agentCustom.trim() || undefined,
      });
      setOpen(false);
      navigate(`/s/${snap.id}`);
    } catch (e) {
      setErr(e);
    } finally { setBusy(false); }
  }

  return html`<${Modal} title=${i18n.t('new.title')} onClose=${onClose}
    footer=${html`
      <${Button} onClick=${onClose}>${i18n.t('new.cancel')}<//>
      <${Button} variant="primary" disabled=${!canCreate} onClick=${create}>
        ${busy ? i18n.t('common.loading') : i18n.t('new.create')}
      <//>`}>
    <div class="field">
      <label>${i18n.t('new.name')}</label>
      <input class="input" placeholder=${i18n.t('new.namePlaceholder')} value=${name}
        onInput=${(e) => setName(e.target.value)} />
    </div>
    <div class="field">
      <label>${i18n.t('new.provider')}</label>
      <select class="select" value=${provider} onChange=${(e) => { setProvider(e.target.value); setModel(''); }}>
        ${(providers || []).map((p) => html`<option key=${p.id} value=${p.id}>${p.id}</option>`)}
        ${providers && providers.length === 0 && html`<option value="">—</option>`}
      </select>
    </div>
    <div class="field">
      <label>${i18n.t('new.model')}</label>
      ${loadErr && html`<div class="load-error" role="alert" style="margin:4px 0">
        ${String(loadErr.detail || loadErr.message || loadErr)}
        <button class="btn btn-ghost btn-sm" onClick=${retry}>${i18n.t('common.retry')}</button>
      </div>`}
      ${!loadErr && models && models.length === 0 && html`<div class="hint" style="font-size:12px;color:var(--fg-subtle)">${i18n.t('new.noModels')}</div>`}
      <select class="select" value=${model} onChange=${(e) => setModel(e.target.value)} disabled=${!models?.length}>
        <option value="">—</option>
        ${(models ?? []).map((m) => html`<option key=${m.id} value=${m.id}>${m.id}</option>`)}
      </select>
    </div>
    <div class="field">
      <label>${i18n.t('new.reasoning')}</label>
      <input class="input" placeholder="max / high / medium / low" value=${effort}
        onInput=${(e) => setEffort(e.target.value)} />
    </div>
    <div class="field">
      <label>${i18n.t('new.agentCustom')}</label>
      <textarea class="textarea" rows="3" value=${agentCustom}
        onInput=${(e) => setAgentCustom(e.target.value)}></textarea>
    </div>
    ${err && html`<div class="badge err" style="margin-bottom:8px">${String(err.detail || err.message)}</div>`}
  <//>`;
}
void chat;

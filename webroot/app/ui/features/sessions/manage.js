// Session management sheet: metadata (tags; generic JSON preserved) — contract PATCH
// fields), rename, compact, reset, interrupt, clone, prune, DELETE.
// DELETE is PERMANENT (no trash bin on the daemon): explicit confirm, and a
// busy 409 is surfaced without silently interrupting the running turn.
import { html } from '../../h.js';
import { useEffect, useState, useRef } from 'preact/hooks';
import { useSignal } from '../../hooks.js';
import { Button } from '../../components/button.js';
import { Icon } from '../../components/icon.js';
import { i18n } from '../../../core/i18n/index.js';
import { chat } from '../../../core/state/chatSlice.js';
import { sessions } from '../../../core/state/sessionsSlice.js';
import * as api from '../../../core/api/endpoints.js';
import { toast } from '../../components/toast.js';
import { Modal } from '../../components/modal.js';
import { navigate } from '../../router.js';

export function ManageBody({ id }) {
  const snapshot = useSignal(chat.snapshot);
  const [renaming, setRenaming] = useState('');
  const [confirming, setConfirming] = useState(null); // {id, label, run}
  const [confirmErr, setConfirmErr] = useState(null);
  const [pruneOpen, setPruneOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [tagInput, setTagInput] = useState('');

  useEffect(() => {
    let current = true;
    const refresh = async () => {
      try {
        if (chat.sessionId.peek() !== id) await chat.open(id);
        const next = await api.sessionGet(id);
        if (current && chat.sessionId.peek() === id) {
          chat.snapshot.value = next;
          setRenaming(next.name);
        }
      } catch (error) {
        if (current) toast(String(error.detail || error.message));
      }
    };
    refresh();
    return () => { current = false; };
  }, [id]);

  async function refreshSnapshot() {
    try {
      const next = await api.sessionGet(id);
      if (chat.sessionId.peek() === id) chat.snapshot.value = next;
    } catch (error) {
      if (chat.sessionId.peek() === id) toast(String(error.detail || error.message));
    }
  }

  // Confirmed action: single submit (busy guards the button), failure keeps
  // the dialog open with the error; cancel never executes anything.
  async function runConfirmed(action) {
    setBusy(true);
    setConfirmErr(null);
    try {
      const res = await action();
      toast(i18n.t('manage.done'));
      setConfirming(null);
      return res;
    } catch (e) {
      setConfirmErr(String(e?.detail || e?.message || e));
      return null;
    } finally {
      setBusy(false);
      await refreshSnapshot();   // confirmed actions change session state
    }
  }

  async function run(action) {
    setBusy(true);
    try {
      const res = await action();
      toast(i18n.t('manage.done'));
      return res;
    } catch (e) {
      // busy 409: NEVER auto-interrupt — tell the user and let them decide.
      // revision 409 (If-Match): metadata changed concurrently — refresh and
      // surface the conflict; a blind retry would overwrite the other edit.
      if (e?.code === 'state_conflict') {
        toast(i18n.t('manage.busy'));
      } else if (e?.code === 'revision_conflict') {
        toast(i18n.t('manage.metaConflict'));
      } else {
        toast(String(e?.detail || e?.message || e));
      }
    } finally {
      setBusy(false);
      setConfirming(null);
      await refreshSnapshot();
    }
  }

  const meta = {
    // metadata is one generic JSON object; tags remain a defined key, every
    // other key (including legacy pinned/archived values) rides along
    // untouched in the PATCH body — no special treatment, no migration.
    tags: Array.isArray(snapshot?.metadata?.tags) ? snapshot.metadata.tags : [],
  };

  function patchMeta(patch) {
    return run(() => sessions.updateMeta(snapshot, patch));
  }

  function addTag() {
    const t = tagInput.trim();
    if (!t) return;
    if (meta.tags.includes(t)) { setTagInput(''); return; }
    if (meta.tags.length >= 16 || [...t].length > 64) { toast(i18n.t('manage.tagsLimit')); return; }
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
      confirm: false, open: () => setPruneOpen(true),
    },
  ];

  return html`
    <div class="section-title">${i18n.t('manage.meta')}</div>
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
      <input class="input tag-input" value=${tagInput} placeholder=${i18n.t('manage.addTag')}
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
        onClick=${() => (a.confirm ? setConfirming(a) : (a.open ? a.open() : run(a.run)))}>
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
    ${pruneOpen && html`<${PruneDialog} id=${id} busy=${busy} setBusy=${setBusy}
      onClose=${() => setPruneOpen(false)} onDone=${() => refreshSnapshot()} />`}
    ${confirming && html`<${Modal} title=${confirming.label} dismissable=${!busy}
      onClose=${() => { setConfirming(null); setConfirmErr(null); }}>
      <p style="margin:0 0 4px;font-size:14px">
        ${confirming.id === 'delete'
          ? i18n.t('manage.deleteConfirm')
          : i18n.t('manage.confirm', { action: confirming.label })}
      </p>
      ${confirmErr && html`<div class="load-error" role="alert" style="margin-top:10px">${confirmErr}</div>`}
      <div style="display:flex;gap:8px;justify-content:flex-end;margin-top:18px">
        <${Button} disabled=${busy} onClick=${() => { setConfirming(null); setConfirmErr(null); }}>${i18n.t('manage.cancel')}<//>
        <${Button} variant="primary" disabled=${busy} onClick=${() => runConfirmed(confirming.run)}>${i18n.t('manage.confirmYes')}<//>
      </div>
    <//>`}
  `;

  async function del() {
    await api.sessionDelete(id);
    sessions.dropRow(id);
    chat.close();
    navigate('/sessions');
  }
}

// ── Prune dialog (decision #3) ───────────────────────────────────────────
// 7/30/90/custom days → FIXED cutoff date shown; preview runs dry_run and
// reads the report; EXECUTE reuses the exact previewed cutoff — changing the
// time invalidates the preview. Empty reclaimable data is stated plainly,
// never reported as freed space. Copy avoids internal jargon: this reclaims
// old recyclable data; the live context and still-referenced resources are
// kept by the retention rules, so it is not "delete every message before X".
import { fmtDateTime, fmtBytes } from '../../../core/util/fmt.js';

const PRUNE_CHOICES = [7, 30, 90];

function PruneDialog({ id, busy, setBusy, onClose, onDone }) {
  const [days, setDays] = useState(30);
  const [custom, setCustom] = useState('');
  // The cutoff is FROZEN when the time frame is chosen (never recomputed at
  // render): the preview and the execution reuse this exact value, so both
  // POSTs are equal by construction and the displayed date never drifts.
  const [selCutoff, setSelCutoff] = useState(() => Date.now() - 30 * 86_400_000);
  const [report, setReport] = useState(null);   // preview result for the CURRENT cutoff
  const [cutoffMs, setCutoffMs] = useState(null); // the cutoff the report was made with
  const [previewBusy, setPreviewBusy] = useState(false);
  const [err, setErr] = useState(null);
  const previewGen = useRef(0);
  // Any selection change or unmount must discard a late preview response.
  useEffect(() => () => { previewGen.current += 1; setPreviewBusy(false); }, []);
  const dialogBusy = busy || previewBusy;

  const effectiveDays = days === 'custom' ? Number(custom) : days;
  // A day count so large the cutoff would fall before the epoch (or stop
  // being finite) is an input error, not a silently clamped value.
  const validDays = Number.isInteger(effectiveDays) && effectiveDays > 0
    && Number.isFinite(Date.now() - effectiveDays * 86_400_000)
    && Date.now() - effectiveDays * 86_400_000 > 0;
  const previewValid = report != null && cutoffMs != null && cutoffMs === selCutoff;

  const cutoffFor = (d) => {
    if (!Number.isInteger(d) || d <= 0) return null;
    const cut = Date.now() - d * 86_400_000;
    return Number.isFinite(cut) && cut > 0 ? cut : null;
  };

  function chooseDays(v) {
    previewGen.current += 1;          // selection change invalidates in-flight preview
    setDays(v);
    // Returning to "custom" keeps the number already typed in — it must keep
    // producing a valid cutoff, never leave preview enabled with a null one.
    setSelCutoff(v === 'custom' ? cutoffFor(Number(custom)) : cutoffFor(v));
    setReport(null);           // any time change invalidates the preview
    setCutoffMs(null);
    setErr(null);
  }

  function setCustomDays(v) {
    previewGen.current += 1;
    setCustom(v);
    setSelCutoff(cutoffFor(Number(v)));
    setReport(null);
    setCutoffMs(null);
    setErr(null);
  }

  async function preview() {
    if (!validDays || previewBusy) return;
    const cutoff = selCutoff;
    const gen = ++previewGen.current;
    setPreviewBusy(true);
    setErr(null);
    try {
      const res = await api.sessionPrune(id, {
        before_ms: cutoff, keep_sealed_generations: 1, dry_run: true,
      });
      if (previewGen.current !== gen) return;   // selection changed meanwhile
      setReport(res.report);
      setCutoffMs(cutoff);
    } catch (e) {
      if (previewGen.current !== gen) return;
      setErr(String(e?.detail || e?.message || e));
    } finally {
      if (previewGen.current === gen) setPreviewBusy(false);
    }
  }

  async function execute() {
    if (!previewValid) return;   // must preview this exact cutoff first
    setBusy(true);
    setErr(null);
    try {
      await api.sessionPrune(id, {
        before_ms: cutoffMs, keep_sealed_generations: 1, dry_run: false,
      });
      toast(i18n.t('prune.done'));
      onDone?.();
      onClose();
    } catch (e) {
      setErr(String(e?.detail || e?.message || e));   // keep the dialog open
    } finally {
      setBusy(false);
    }
  }

  // Contract field names (contract-backend.md §3): pruned_entries,
  // pruned_entry_bytes, pruned_executions, freed_execution_bytes,
  // pruned_image_jobs, pruned_blobs, freed_blob_bytes, pruned_generations,
  // vacuumed. No legacy dual-name guessing.
  const reclaimed = report
    ? {
      entries: report.pruned_entries,
      generations: report.pruned_generations,
      executions: report.pruned_executions,
      imageJobs: report.pruned_image_jobs,
      bytes: report.pruned_entry_bytes + report.freed_blob_bytes
        + report.freed_execution_bytes,
      blobs: report.pruned_blobs,
    }
    : null;
  // "Nothing to reclaim" only when EVERY category is zero.
  const empty = reclaimed && Object.values(reclaimed).every((v) => !v);

  return html`<${Modal} title=${i18n.t('manage.prune')} onClose=${onClose} dismissable=${!busy}>
    <div class="setting-row" style="align-items:flex-start">
      <div><div class="label">${i18n.t('prune.scope')}</div>
        <div class="hint">${i18n.t('prune.keepNote')}</div></div>
    </div>
    <div class="seg" role="radiogroup" style="margin:12px 0 8px">
      ${PRUNE_CHOICES.map((d) => html`
        <button key=${d} role="radio" aria-checked=${days === d} disabled=${busy}
          class="seg-item ${days === d ? 'on' : ''}" onClick=${() => chooseDays(d)}>${i18n.t('prune.days', { n: d })}</button>`)}
      <button role="radio" aria-checked=${days === 'custom'} disabled=${busy}
        class="seg-item ${days === 'custom' ? 'on' : ''}" onClick=${() => chooseDays('custom')}>${i18n.t('prune.custom')}</button>
    </div>
    ${days === 'custom' && html`
      <input class="input" type="number" min="1" step="1" value=${custom} disabled=${busy}
        placeholder=${i18n.t('prune.customDays')} style="width:12rem"
        onInput=${(e) => setCustomDays(e.target.value)} />`}
    ${selCutoff != null && validDays && html`<div class="hint" style="margin-top:8px">${i18n.t('prune.cutoffAt')} ${fmtDateTime(selCutoff)}</div>`}
    ${!validDays && html`<div class="hint" style="margin-top:8px;color:var(--warn)">${i18n.t('prune.customInvalid')}</div>`}

    <div style="display:flex;gap:8px;margin-top:14px;align-items:center">
      <${Button} disabled=${!validDays || dialogBusy} onClick=${preview}>${previewBusy ? i18n.t('sessions.loading') : i18n.t('prune.preview')}<//>
      ${previewValid && !empty && html`<span class="hint">${i18n.t('prune.reportLine', {
        n: reclaimed.entries, size: fmtBytes(reclaimed.bytes),
      })}${reclaimed.generations ? ` · ${i18n.t('prune.reportGenerations', { n: reclaimed.generations })}` : ''}${reclaimed.executions ? ` · ${i18n.t('prune.reportExecutions', { n: reclaimed.executions })}` : ''}${reclaimed.imageJobs ? ` · ${i18n.t('prune.reportImages', { n: reclaimed.imageJobs })}` : ''}${reclaimed.blobs ? ` · ${i18n.t('prune.reportBlobs', { n: reclaimed.blobs })}` : ''}</span>`}
      ${previewValid && empty && html`<span class="hint">${i18n.t('prune.nothing')}</span>`}
    </div>
    ${err && html`<div class="load-error" role="alert" style="margin-top:10px">${err}</div>`}
    <div style="display:flex;gap:8px;justify-content:flex-end;margin-top:18px">
      <${Button} disabled=${busy} onClick=${onClose}>${i18n.t('manage.cancel')}<//>
      <${Button} variant="primary" disabled=${busy || !previewValid || empty} onClick=${execute}>${i18n.t('prune.run')}<//>
    </div>
  <//>`;
}

// One history entry. Assistant text renders as markdown; reasoning,
// tool calls and tool results are folded chips (spec: no-body entries are
// collapsed by default; click opens a detail modal).
import { html } from '../../h.js';
import { useEffect, useState } from 'preact/hooks';
import { Icon } from '../../components/icon.js';
import { Modal } from '../../components/modal.js';
import { CopyButton } from '../../components/copyable.js';
import { Markdown } from '../../components/markdown.js';
import { i18n } from '../../../core/i18n/index.js';
import { blobUrl } from '../../../core/api/endpoints.js';
import { fmtTokens } from '../../../core/util/fmt.js';

export { groupEntries } from './grouping.js';

export function HistoryEntry({ entry, blocks, usage }) {
  const kind = entry.kind;
  const inner = HistoryEntryInner(entry, kind, blocks, usage);
  if (entry.seq != null) {
    return html`<div class="entry-anchor" data-seq=${entry.seq}>${inner}</div>`;
  }
  return inner;
}

function HistoryEntryInner(entry, kind, blocks, usage) {
  if (kind === 'user_message') return html`<${UserEntry} entry=${entry} />`;
  if (kind === 'assistant_message') return html`<${AssistantEntry} blocks=${blocks} usage=${usage} />`;
  if (kind === 'interruption' || kind === 'background_terminal' || kind === 'system_message') {
    return html`<${SystemEntry} entry=${entry} kind=${kind} />`;
  }
  return null;
}

function UserEntry({ entry }) {
  const blocks = entry.payload?.content || [];
  const images = entry.payload?.__images || [];
  return html`<div class="entry user">
    <div class="bubble">
      ${blocks.filter((b) => b.type === 'text').map((b, i) => html`<div key=${i}>${b.text}</div>`)}
      ${images.map((img, i) => html`<img key=${'i' + i} src=${img.localUrl} alt=${img.name || 'image'} loading="lazy" />`)}
      ${blocks.filter((b) => b.type === 'image' && !images.length).map((b, i) => html`<${PendingImage} key=${'b' + i} blob=${b} />`)}
    </div>
  </div>`;
}

function PendingImage({ blob }) {
  // Durable history carries base64 image data; show a small lazy thumbnail.
  const src = blob.data_base64
    ? `data:${blob.mime_type || 'image/png'};base64,${blob.data_base64}`
    : blob.sha256 ? blobUrl(blob.sha256) : null;
  if (!src) return null;
  return html`<img src=${src} alt="" loading="lazy" />`;
}

// Only body segments reach this component. Thinking and tool activity
// belongs to ProcessGroup; usage appears once on the last body segment.
function AssistantEntry({ blocks, usage }) {
  return html`<div class="entry assistant">
    <div class="avatar-col"><div class="avatar"><${Icon} name="bot" class="sm" /></div></div>
    <div class="body">
      ${blocks.map((b, i) => b.type === 'image'
        ? html`<${PendingImage} key=${i} blob=${b} />`
        : html`<${Markdown} key=${i} text=${b.text} />`)}
      <div class="meta">
        ${usage && html`<span>${i18n.t('entry.usage', {
          in: fmtTokens(usage.input_tokens), out: fmtTokens(usage.output_tokens), total: fmtTokens(usage.total_tokens),
        })}</span>`}
        ${blocks.some(b => b.type === 'text') && html`<${CopyButton} text=${blocks.filter(b=>b.type === 'text').map(b => b.text).join('\n\n')} />`}
      </div>
    </div>
  </div>`;
}

function SystemEntry({ entry, kind }) {
  const [open, setOpen] = useState(false);
  const label = kind === 'interruption' ? i18n.t('entry.interruption')
    : kind === 'background_terminal' ? i18n.t('entry.backgroundTerminal') : i18n.t('entry.system');
  const text = (entry.payload?.content || []).map((b) => b.text || '').join('\n')
    || entry.payload?.text || '';
  return html`<div class="entry assistant">
    <div class="avatar-col"><div class="avatar" style="font-size:11px">·</div></div>
    <div class="body">
      <div class="fold">
        <button class="fold-chip" onClick=${() => setOpen(true)}>
          <${Icon} name="circle-dot" />${label}
        </button>
      </div>
      ${open && html`<${Modal} title=${label} onClose=${() => setOpen(false)} wide>
        <pre class="raw">${text}</pre>
        <${CopyButton} text=${text} label=${i18n.t('common.copy')} />
      <//>`}
    </div>
  </div>`;
}

// ─── process grouping ──────────────────────────────────────────────────
// Consecutive "pure" thinking/tool entries (assistant messages with no
// text, tool results) collapse into ONE group component. If the final
// assistant message of the same run leads with reasoning/tool_call blocks
// before its text, those blocks join the group too — the message body then
// renders text only. (audit item ⑤: group the sequence, don't just hide it)

export function ProcessGroup({ item, revealSeq }) {
  const [open, setOpen] = useState(false);
  const steps = item.steps;
  const seqs = [...new Set(steps.map(s => s.fromSeq ?? s.entry?.seq).filter(seq => seq != null))];
  useEffect(() => { if (revealSeq != null && seqs.includes(revealSeq)) setOpen(true); }, [revealSeq]);
  const kinds = new Set(steps.map((s) => s.kind === 'entry' ? s.entry.kind : 'block'));
  return html`<div class="proc-group" data-seq=${seqs[0]} data-seqs=${seqs.join(' ')}>
    <button class="proc-head" onClick=${() => setOpen(!open)} aria-expanded=${open}>
      <${Icon} name=${open ? 'chevron-down' : 'layers'} />
      ${i18n.t('proc.title')} · ${steps.length} ${i18n.t('proc.stepsUnit')}
      ${kinds.has('tool_result') || steps.some((s) => s.block?.type === 'tool_call') ? ` · ${i18n.t('proc.hasTools')}` : ''}
    </button>
    ${open && html`<div class="proc-steps">
      ${steps.map((s, i) => renderStep(s, i))}
    </div>`}
  </div>`;
}

function renderStep(step, i) {
  if (step.kind === 'block') {
    const b = step.block;
    if (b.type === 'reasoning') {
      return html`<div class="proc-step" key=${i} data-seq=${step.fromSeq ?? step.entry?.seq}>
        <div class="proc-step-label"><${Icon} name="brain" />${i18n.t('entry.thinking')} · #${step.fromSeq}</div>
        <pre>${b.text || ''}</pre>
      </div>`;
    }
    return html`<div class="proc-step" key=${i} data-seq=${step.fromSeq ?? step.entry?.seq}>
      <div class="proc-step-label"><${Icon} name="terminal" />${i18n.t('entry.toolCall')}: ${b.name || '—'} · #${step.fromSeq}</div>
      <pre>${JSON.stringify(b.arguments ?? {}, null, 2)}</pre>
    </div>`;
  }
  const e = step.entry;
  if (e.kind === 'tool_result') {
    const text = (e.payload?.content || []).map((b) => b.text || '').join('\n');
    return html`<div class="proc-step" key=${i} data-seq=${step.fromSeq ?? step.entry?.seq}>
      <div class="proc-step-label"><${Icon} name="wrench" />${i18n.t('entry.toolResult')}: ${e.payload?.tool_name || '—'} · #${e.seq}</div>
      <pre>${text}</pre>
      ${(e.payload?.content || []).filter(b=>b.type === 'image').map((b,j)=>html`<${PendingImage} key=${j} blob=${b} />`)}
    </div>`;
  }
  const blocks = e.payload?.content || [];
  return html`<div class="proc-step" key=${i} data-seq=${step.fromSeq ?? step.entry?.seq}>
    ${blocks.map((b, j) => b.type === 'reasoning'
      ? html`<div key=${'r' + j}>
          <div class="proc-step-label"><${Icon} name="brain" />${i18n.t('entry.thinking')} · #${e.seq}</div>
          <pre>${b.text || ''}</pre>
        </div>`
      : html`<div key=${'t' + j}>
          <div class="proc-step-label"><${Icon} name="terminal" />${i18n.t('entry.toolCall')}: ${b.name || '—'} · #${e.seq}</div>
          <pre>${JSON.stringify(b.arguments ?? {}, null, 2)}</pre>
        </div>`)}
  </div>`;
}

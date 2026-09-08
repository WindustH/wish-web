// One history entry. Assistant text renders as markdown; reasoning,
// tool calls and tool results are folded chips (spec: no-body entries are
// collapsed by default; click opens a detail modal).
import { html } from '../../h.js';
import { useState } from 'preact/hooks';
import { Icon } from '../../components/icon.js';
import { Modal } from '../../components/modal.js';
import { CopyButton } from '../../components/copyable.js';
import { Markdown } from '../../components/markdown.js';
import { i18n } from '../../../core/i18n/index.js';
import { truncate, firstLine } from '../../../core/util/fmt.js';

export function HistoryEntry({ entry }) {
  const kind = entry.kind;
  if (kind === 'user_message') return html`<${UserEntry} entry=${entry} />`;
  if (kind === 'assistant_message') return html`<${AssistantEntry} entry=${entry} />`;
  if (kind === 'tool_result') return html`<${ToolResultEntry} entry=${entry} />`;
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
    : blob.sha256 ? `/wishd-api/blobs/${blob.sha256}` : null;
  if (!src) return null;
  return html`<img src=${src} alt="" loading="lazy" />`;
}

function AssistantEntry({ entry }) {
  const [detail, setDetail] = useState(null);
  const blocks = entry.__skipProcessBlocks
    ? dropLeadingProcessBlocks(entry.payload?.content || [])
    : (entry.payload?.content || []);
  const texts = blocks.filter((b) => b.type === 'text');
  const reasoning = blocks.filter((b) => b.type === 'reasoning');
  const toolCalls = blocks.filter((b) => b.type === 'tool_call');
  const usage = entry.payload?.usage;
  return html`<div class="entry assistant">
    <div class="avatar-col"><div class="avatar"><${Icon} name="bot" class="sm" /></div></div>
    <div class="body">
      ${reasoning.length > 0 && html`<div class="fold">
        <button class="fold-chip" onClick=${() => setDetail({ type: 'reasoning', items: reasoning })}>
          <${Icon} name="brain" />${i18n.t('entry.thinking')}${reasoning.length > 1 ? ` ×${reasoning.length}` : ''}
        </button>
      </div>`}
      ${toolCalls.length > 0 && html`<div class="fold">
        ${toolCalls.map((tc, i) => html`<button key=${i} class="fold-chip"
          onClick=${() => setDetail({ type: 'tool_call', items: [tc] })}>
          <${Icon} name="terminal" />${i18n.t('entry.toolCall')}: ${tc.name || tc.tool_name || '—'}
        </button>`)}
      </div>`}
      ${texts.map((b, i) => html`<${Markdown} key=${i} text=${b.text} />`)}
      ${(texts.length === 0 && reasoning.length + toolCalls.length > 0) && html`
        <div class="hint" style="color:var(--fg-subtle);font-size:13px">—</div>`}
      <div class="meta">
        ${usage && html`<span>${i18n.t('entry.usage', {
          in: fmtK(usage.input_tokens), out: fmtK(usage.output_tokens), total: fmtK(usage.total_tokens),
        })}</span>`}
        ${texts.length > 0 && html`<${CopyButton} text=${texts.map((b) => b.text).join('\n\n')} />`}
      </div>
      ${detail && html`<${DetailModal} detail=${detail} onClose=${() => setDetail(null)} />`}
    </div>
  </div>`;
}

function dropLeadingProcessBlocks(blocks) {
  let i = 0;
  while (i < blocks.length && (blocks[i].type === 'reasoning' || blocks[i].type === 'tool_call')) i++;
  return blocks.slice(i);
}

function ToolResultEntry({ entry }) {
  const [open, setOpen] = useState(false);
  const text = (entry.payload?.content || []).map((b) => b.text || '').join('\n');
  const name = entry.payload?.tool_name || 'tool';
  return html`<div class="entry assistant">
    <div class="avatar-col"><div class="avatar" style="font-size:11px">⌘</div></div>
    <div class="body">
      <div class="fold">
        <button class="fold-chip" onClick=${() => setOpen(true)}>
          <${Icon} name="wrench" />${i18n.t('entry.toolResult')}: ${name}
          <span style="color:var(--fg-faint)">· ${firstLine(text, 60) || i18n.t('common.empty')}</span>
        </button>
      </div>
      ${open && html`<${DetailModal} detail=${{ type: 'tool_result', items: [entry.payload] }} onClose=${() => setOpen(false)} />`}
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
      ${open && html`<${DetailModal} detail=${{ type: kind, text }} onClose=${() => setOpen(false)} />`}
    </div>
  </div>`;
}

export function DetailModal({ detail, onClose }) {
  let title = '', body = null, copyText = '';
  if (detail.type === 'reasoning') {
    title = i18n.t('entry.thinking');
    copyText = detail.items.map((r) => r.text || '').join('\n\n');
    body = html`<div class="md" style="color:var(--fg-muted)">${detail.items.map((r, i) =>
      html`<p key=${i} style="white-space:pre-wrap">${r.text || ''}</p>`)}</div>`;
  } else if (detail.type === 'tool_call') {
    const tc = detail.items[0] || {};
    title = `${i18n.t('entry.toolCall')}: ${tc.name || tc.tool_name || '—'}`;
    copyText = JSON.stringify(tc.arguments ?? tc, null, 2);
    body = html`<div>
      <dl class="kv">
        <dt>id</dt><dd>${tc.id || '—'}</dd>
      </dl>
      <pre class="raw">${JSON.stringify(tc.arguments ?? {}, null, 2)}</pre>
    </div>`;
  } else if (detail.type === 'tool_result') {
    const p = detail.items[0] || {};
    title = `${i18n.t('entry.toolResult')}: ${p.tool_name || '—'}`;
    const text = (p.content || []).map((b) => b.text || '').join('\n');
    copyText = text;
    body = html`<pre class="raw">${truncate(text, 200_000)}</pre>`;
  } else {
    title = detail.type;
    copyText = detail.text || '';
    body = html`<pre class="raw">${detail.text || ''}</pre>`;
  }
  return html`<${Modal} title=${title} onClose=${onClose} wide>
    ${body}
    <div style="margin-top:16px;display:flex;justify-content:flex-end">
      <${CopyButton} text=${copyText} label=${i18n.t('common.copy')} />
    </div>
  <//>`;
}

function fmtK(n) {
  if (n == null) return '0';
  if (n >= 1000) return (n / 1000).toFixed(1) + 'k';
  return String(n);
}

// ─── process grouping ──────────────────────────────────────────────────
// Consecutive "pure" thinking/tool entries (assistant messages with no
// text, tool results) collapse into ONE group component. If the final
// assistant message of the same run leads with reasoning/tool_call blocks
// before its text, those blocks join the group too — the message body then
// renders text only. (audit item ⑤: group the sequence, don't just hide it)

function isProcessOnly(entry) {
  if (entry.kind === 'tool_result') return true;
  if (entry.kind === 'assistant_message') {
    const blocks = entry.payload?.content || [];
    const hasText = blocks.some((b) => b.type === 'text' && (b.text || '').trim());
    const hasProcess = blocks.some((b) => b.type === 'reasoning' || b.type === 'tool_call');
    return !hasText && hasProcess;
  }
  return false;
}

function leadingProcessBlocks(entry) {
  const blocks = entry.payload?.content || [];
  const out = [];
  for (const b of blocks) {
    if (b.type === 'reasoning' || b.type === 'tool_call') out.push(b);
    else break;
  }
  return out;
}

/** entries (asc) → render items: {type:'entry', entry} | {type:'process', steps} */
export function groupEntries(entries) {
  const items = [];
  let group = null;
  const flush = () => { if (group && group.steps.length) items.push(group); group = null; };

  for (const entry of entries) {
    if (isProcessOnly(entry)) {
      group ||= { type: 'process', key: `proc-${entry.seq ?? entry.localId}`, steps: [] };
      group.steps.push({ kind: 'entry', entry });
      continue;
    }
    if (group && entry.kind === 'assistant_message') {
      const lead = leadingProcessBlocks(entry);
      const sameRun = entry.run_id == null || group.steps.every((s) => s.entry.run_id == null || s.entry.run_id === entry.run_id);
      if (lead.length && sameRun) {
        for (const b of lead) group.steps.push({ kind: 'block', block: b, fromSeq: entry.seq });
        entry.__skipProcessBlocks = true;   // don't render those chips twice
      }
      flush();
      items.push({ type: 'entry', entry });
      continue;
    }
    flush();
    items.push({ type: 'entry', entry });
  }
  flush();
  return items;
}

export function ProcessGroup({ item }) {
  const [open, setOpen] = useState(false);
  const steps = item.steps;
  const kinds = new Set(steps.map((s) => s.kind === 'entry' ? s.entry.kind : 'block'));
  return html`<div class="proc-group">
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
      return html`<div class="proc-step" key=${i}>
        <div class="proc-step-label"><${Icon} name="brain" />${i18n.t('entry.thinking')} · #${step.fromSeq}</div>
        <pre>${b.text || ''}</pre>
      </div>`;
    }
    return html`<div class="proc-step" key=${i}>
      <div class="proc-step-label"><${Icon} name="terminal" />${i18n.t('entry.toolCall')}: ${b.name || '—'} · #${step.fromSeq}</div>
      <pre>${JSON.stringify(b.arguments ?? {}, null, 2)}</pre>
    </div>`;
  }
  const e = step.entry;
  if (e.kind === 'tool_result') {
    const text = (e.payload?.content || []).map((b) => b.text || '').join('\n');
    return html`<div class="proc-step" key=${i}>
      <div class="proc-step-label"><${Icon} name="wrench" />${i18n.t('entry.toolResult')}: ${e.payload?.tool_name || '—'} · #${e.seq}</div>
      <pre>${truncate(text, 200_000)}</pre>
    </div>`;
  }
  const blocks = e.payload?.content || [];
  return html`<div class="proc-step" key=${i}>
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

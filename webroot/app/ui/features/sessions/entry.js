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
  const blocks = entry.payload?.content || [];
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

// Minimal, safe markdown renderer (no dependencies, no raw HTML pass-through).
// Supports the subset that matters in wish transcripts: fenced code, inline
// code, bold/italic, links, headings, lists, blockquotes, hr, tables.
// Everything unknown renders as plain text — XSS-safe by construction.
import { html } from '../h.js';

const starts = (line, prefix) => line.trimStart().startsWith(prefix);

export function parseBlocks(src) {
  const lines = String(src ?? '').split('\n');
  const out = [];
  let i = 0;
  while (i < lines.length) {
    const line = lines[i];
    if (starts(line, '```')) {
      const lang = line.trim().slice(3).trim();
      const buf = [];
      i++;
      while (i < lines.length && !starts(lines[i], '```')) buf.push(lines[i++]);
      i++; // closing fence
      out.push({ type: 'code', lang, code: buf.join('\n') });
    } else if (/^#{1,4} /.test(line.trimStart())) {
      const trimmed = line.trimStart();
      const level = trimmed.match(/^#+/)[0].length;
      out.push({ type: 'h', level, text: trimmed.replace(/^#+\s*/, '') });
      i++;
    } else if (/^\s*(?:[-*+]|\d+[.)]) /.test(line)) {
      const ordered = /^\s*\d/.test(line);
      const items = [];
      while (i < lines.length && /^\s*(?:[-*+]|\d+[.)]) /.test(lines[i])) {
        items.push(lines[i].replace(/^\s*(?:[-*+]|\d+[.)])\s*/, ''));
        i++;
      }
      out.push({ type: 'list', ordered, items });
    } else if (/^\s*>\s?/.test(line)) {
      const buf = [];
      while (i < lines.length && /^\s*>\s?/.test(lines[i])) { buf.push(lines[i].replace(/^\s*>\s?/, '')); i++; }
      out.push({ type: 'quote', text: buf.join('\n') });
    } else if (/^\s*(?:---|\*\*\*|___)\s*$/.test(line)) {
      out.push({ type: 'hr' }); i++;
    } else if (isTableStart(lines, i)) {
      const rows = [];
      while (i < lines.length && /^\s*\|.*\|\s*$/.test(lines[i])) {
        rows.push(lines[i].trim().replace(/^\|/, '').replace(/\|$/, '').split('|').map((c) => c.trim()));
        i++;
      }
      rows.splice(1, 1); // separator row
      out.push({ type: 'table', rows });
    } else if (line.trim() === '') {
      i++;
    } else {
      const buf = [];
      while (i < lines.length && lines[i].trim() !== '' && !isBlockStart(lines[i])) {
        buf.push(lines[i]); i++;
      }
      if (buf.length) out.push({ type: 'p', text: buf.join('\n') });
      else i++; // safety: never loop forever
    }
  }
  return out;
}

function isBlockStart(line) {
  return starts(line, '```') || /^#{1,4} /.test(line.trimStart()) ||
    /^\s*(?:[-*+]|\d+[.)]) /.test(line) || /^\s*>\s?/.test(line) ||
    /^\s*\|/.test(line);
}

function isTableStart(lines, i) {
  const row = lines[i] ?? '', sep = lines[i + 1] ?? '';
  return /^\s*\|.*\|\s*$/.test(row) && /^\s*\|[-:\s|]+\|\s*$/.test(sep);
}

export function Markdown({ text = '' }) {
  const blocks = parseBlocks(text);
  return html`<div class="md">${blocks.map(renderBlock)}</div>`;
}

function renderBlock(b, key) {
  switch (b.type) {
    case 'code':
      return html`<pre key=${key}><code class="lang-${b.lang || 'text'}">${b.code}</code></pre>`;
    case 'h': {
      const Tag = `h${Math.min(b.level + 1, 4)}`;
      return html`<${Tag} key=${key}>${inline(b.text)}<//>`;
    }
    case 'list':
      return b.ordered
        ? html`<ol key=${key}>${b.items.map((it, j) => html`<li key=${j}>${inline(it)}</li>`)}</ol>`
        : html`<ul key=${key}>${b.items.map((it, j) => html`<li key=${j}>${inline(it)}</li>`)}</ul>`;
    case 'quote':
      return html`<blockquote key=${key}>${inline(b.text)}</blockquote>`;
    case 'hr':
      return html`<hr key=${key} />`;
    case 'table':
      return html`<table key=${key}><tbody>
        ${b.rows.map((r, ri) => html`<tr key=${ri}>${r.map((c, ci) =>
          ri === 0 ? html`<th key=${ci}>${inline(c)}</th>` : html`<td key=${ci}>${inline(c)}</td>`)}</tr>`)}
      </tbody></table>`;
    default:
      return html`<p key=${key}>${inline(b.text)}</p>`;
  }
}

// Inline: `code`, **bold**, *italic*, [text](url) — regex-driven over text
// nodes only; link URLs are scheme-checked.
const INLINE_PATTERNS = [
  { re: /`([^`]+)`/, make: (m, k) => html`<code key=${k}>${m[1]}</code>` },
  { re: /\*\*([^*]+)\*\*/, make: (m, k) => html`<strong key=${k}>${inline(m[1])}</strong>` },
  { re: /\*([^*]+)\*/, make: (m, k) => html`<em key=${k}>${inline(m[1])}</em>` },
  { re: /\[([^\]]+)\]\(([^)\s]+)\)/, make: (m, k) =>
    /^https?:\/\//i.test(m[2])
      ? html`<a key=${k} href=${m[2]} target="_blank" rel="noreferrer noopener">${m[1]}</a>`
      : html`<span key=${k}>${m[1]}</span>` },
];

function inline(text) {
  const parts = [];
  let rest = String(text ?? '');
  let key = 0;
  while (rest) {
    let best = null, bestM = null;
    for (const p of INLINE_PATTERNS) {
      const m = rest.match(p.re);
      if (m && (best === null || m.index < bestM.index)) { best = p; bestM = m; }
    }
    if (!best) { parts.push(rest); break; }
    if (bestM.index > 0) parts.push(rest.slice(0, bestM.index));
    parts.push(best.make(bestM, key++));
    rest = rest.slice(bestM.index + bestM[0].length);
  }
  return parts;
}

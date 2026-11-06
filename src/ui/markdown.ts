import MarkdownIt, { type Token } from 'markdown-it';
import { highlightCode } from './codeHighlight.ts';
import DOMPurify from 'dompurify';
import { tex } from '@mdit/plugin-tex';
import temml from 'temml';
import { createBoundedCache } from '../core/util/boundedCache.ts';
import {
  markdownSourceMap,
  sourceRenderer,
  sourceLocation,
  type SourceCache,
  type SourceMapping,
} from './markdownSourceMap.ts';
import { cjkEmphasis } from './markdownEmphasis.ts';
import { parseFileMention } from '../core/blobMentions.ts';

const markdown = new MarkdownIt({
  html: false,
  linkify: true,
  breaks: true,
  typographer: true,
  highlight: highlightCode,
});
markdown.use(cjkEmphasis);
markdown.use(tex, {
  render: (content, displayMode) =>
    temml.renderToString(content, {
      displayMode,
      annotate: true,
      trust: false,
      throwOnError: false,
    }),
  delimiters: 'all',
});
const validateLink = markdown.validateLink;
markdown.validateLink = (href) => !!parseFileMention(href) || validateLink(href);
const fileIcon =
  '<svg class="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8Z"/><path d="M14 2v6h6"/></svg>';
markdown.renderer.rules.link_open = (tokens, index, options, _env, renderer) => {
  const href = String(tokens[index]!.attrGet('href') ?? '');
  if (parseFileMention(href))
    return `<a href="#" class="file-mention" data-file-mention="${markdown.utils.escapeHtml(href)}">${fileIcon}`;
  return renderer.renderToken(tokens, index, options).replace('<a ', '<a target="_blank" rel="noopener noreferrer" ');
};
const renderImage = markdown.renderer.rules.image!;
markdown.renderer.rules.image = (tokens, index, options, env, renderer) => {
  const token = tokens[index]!;
  const href = String(token.attrGet('src') ?? '');
  if (!parseFileMention(href)) return renderImage(tokens, index, options, env, renderer);
  const label = renderer.renderInlineAsText(token.children ?? [], options, env) || href.split(/[\\/]/).at(-1)!;
  return `<a href="#" class="file-mention" data-file-mention="${markdown.utils.escapeHtml(href)}">${fileIcon}${markdown.utils.escapeHtml(label)}</a>`;
};
const fence = markdown.renderer.rules.fence!;
// A fenced block gets a head: the language it names, and a button that copies it.
markdown.renderer.rules.fence = (tokens, index, options, env, renderer) => {
  const label = markdown.utils.escapeHtml((env as { copyLabel: string }).copyLabel);
  const language = markdown.utils.escapeHtml(tokens[index]!.info.trim().split(/\s+/)[0] ?? '');
  return `<div class="code-block"><div class="code-head"><span class="code-lang">${language}</span><button class="code-copy btn ghost sm" type="button" aria-label="${label}" title="${label}"><svg class="icon sm" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false"><path d="M15.5 8.5v-2A2.5 2.5 0 0 0 13 4H6.5A2.5 2.5 0 0 0 4 6.5V13a2.5 2.5 0 0 0 2.5 2.5h2"/><rect x="8.5" y="8.5" width="11.5" height="11.5" rx="2.5" fill="currentColor" fill-opacity=".18"/></svg></button></div>${fence(tokens, index, options, env, renderer)}</div>`;
};

markdown.use(markdownSourceMap);
sourceRenderer(markdown);

// Large/streaming answers must not retain 500 full intermediate renderings.
const RENDER_CACHE = createBoundedCache(500, 2_000_000);

const sanitize = (html: string) =>
  DOMPurify.sanitize(html, {
    ADD_ATTR: ['target'],
    ADD_TAGS: ['annotation', 'semantics'],
  });

export interface MarkdownBlock {
  key: string;
  html: string;
  start: number;
  end: number;
  mappings: SourceMapping[];
}

/** Retain only this document's current blocks, never all its growing intermediate versions.
 * Parsing remains document-wide: a later reference definition can change an earlier link.
 * Unchanged blocks reuse both sanitized HTML and their Vue-owned DOM nodes.
 */
interface CachedBlock {
  fingerprint: string;
  children: (Token[] | null)[];
  block: MarkdownBlock;
}
export function createMarkdownBlocks() {
  const sourceCache: SourceCache = { previous: new Map(), next: new Map() };
  let previous = new Map<string, CachedBlock>();
  return (text: string, copyLabel: string, streaming = false): MarkdownBlock[] => {
    const removed: number[] = [];
    for (let i = 0; i < text.length; i++)
      if (text[i] === '\r' && text[i + 1] === '\n') removed.push(i - removed.length);
    const originalAt = (position: number) => {
      let lo = 0,
        hi = removed.length;
      while (lo < hi) {
        const mid = (lo + hi) >>> 1;
        if (removed[mid]! < position) lo = mid + 1;
        else hi = mid;
      }
      return position + lo;
    };
    sourceCache.next = new Map();
    const environment = { copyLabel, originalAt, sourceCache, sourceEntries: [] as SourceMapping[] };
    const tokens = markdown.parse(text, environment);
    sourceCache.previous = sourceCache.next;
    const current = new Map<string, CachedBlock>();
    const blocks: MarkdownBlock[] = [];
    let group: ReturnType<typeof markdown.parse> = [];
    const lines = text.replace(/\r\n?/g, '\n').split('\n');
    const offsets = [0];
    for (const line of lines) offsets.push(offsets[offsets.length - 1]! + line.length + 1);
    for (const token of tokens) {
      group.push(token);
      if (token.level !== 0 || token.nesting === 1) continue;
      const first = group[0]!;
      const key = `${first.map?.[0] ?? blocks.length}:${first.type}`;
      // A growing, unclosed code fence is escaped now and highlighted once it closes.
      const closingLine = first.map ? (lines[first.map[1] - 1]?.trim() ?? '') : '';
      const unclosedFence =
        streaming &&
        first.type === 'fence' &&
        !(
          closingLine.length >= first.markup.length &&
          [...closingLine].every((character) => character === first.markup[0]) &&
          first.map![1] - first.map![0] > 1
        );
      const normalizedStart = offsets[first.map?.[0] ?? 0]!;
      const normalizedEnd = Math.min(text.length - removed.length, offsets[first.map?.[1] ?? lines.length]!);
      const start = originalAt(normalizedStart);
      const end = originalAt(normalizedEnd);
      // Inline parsing already reuses immutable child arrays only when content,
      // source positions and references match. Compare those identities instead
      // of serializing the same child AST and source runs on every stream update.
      const children = group.map((token) => token.children);
      const fingerprint = JSON.stringify([
        copyLabel,
        unclosedFence,
        start,
        end,
        group.map(({ children, content, ...fields }) => ({ ...fields, ...(children ? {} : { content }) })),
        group.map(sourceLocation),
        removed.slice(start - normalizedStart, end - normalizedEnd),
      ]);
      const cached = previous.get(key);
      environment.sourceEntries = [];
      const block =
        cached?.fingerprint === fingerprint && children.every((value, index) => value === cached.children[index])
          ? cached.block
          : {
              key,
              start,
              end,
              mappings: environment.sourceEntries,
              html: sanitize(
                markdown.renderer.render(
                  group,
                  unclosedFence ? { ...markdown.options, highlight: null } : markdown.options,
                  environment,
                ),
              ),
            };
      current.set(key, { fingerprint, children, block });
      blocks.push(block);
      group = [];
    }
    previous = current;
    return blocks;
  };
}

/** Whole-document renderer for browser review fixtures; views use createMarkdownBlocks. */
export function renderMarkdown(text: string, copyLabel: string): string {
  const cacheKey = `${copyLabel}\0${text}`;
  const cached = RENDER_CACHE.get(cacheKey);
  if (cached !== undefined) return cached;

  const html = sanitize(markdown.render(text, { copyLabel }));

  RENDER_CACHE.set(cacheKey, html);
  return html;
}

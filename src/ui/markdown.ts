import MarkdownIt, { type Env, type Token } from 'markdown-it';
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
import { markdownBreaks } from './markdownBreaks.ts';
import { parseFileMention } from '../core/blobMentions.ts';

const markdown = new MarkdownIt({
  html: false,
  linkify: true,
  breaks: true,
  typographer: true,
  highlight: highlightCode,
});
markdown.use(cjkEmphasis);
markdown.use(markdownBreaks);
markdown.use(tex, {
  render: (content, displayMode) => {
    try {
      return temml.renderToString(content, {
        displayMode,
        annotate: true,
        trust: false,
        throwOnError: false,
      });
    } catch {
      // An incomplete streamed formula can trigger a parser exception even
      // with throwOnError disabled. Keep its source visible until it completes.
      return `<code>${markdown.utils.escapeHtml(content)}</code>`;
    }
  },
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

/** Retain only this document's current blocks, never its intermediate versions. */
interface CachedBlock {
  fingerprint: string;
  children: (Token[] | null)[];
  block: MarkdownBlock;
}
export function createMarkdownBlocks() {
  const sourceCache: SourceCache = { previous: new Map(), next: new Map() };
  let previous = new Map<string, CachedBlock>();
  const origins = new WeakMap<MarkdownBlock, { line: number; normalized: number }>();
  const renderTail = (
    text: string,
    copyLabel: string,
    streaming: boolean,
    offset: number,
    lineOffset: number,
    normalizedOffset: number,
  ) => {
    const removed: number[] = [];
    for (let i = 0; i < text.length; i++)
      if (text[i] === '\r' && text[i + 1] === '\n') removed.push(i - removed.length);
    const originalAt = (position: number) => {
      position -= normalizedOffset;
      let lo = 0,
        hi = removed.length;
      while (lo < hi) {
        const mid = (lo + hi) >>> 1;
        if (removed[mid]! < position) lo = mid + 1;
        else hi = mid;
      }
      return offset + position + lo;
    };
    sourceCache.next = new Map();
    const environment = {
      copyLabel,
      originalAt,
      sourceOffset: normalizedOffset,
      sourceCache,
      sourceEntries: [] as SourceMapping[],
      references: undefined as Env['references'],
    };
    const tokens = markdown.parse(text, environment);
    if (!offset) sourceCache.previous = sourceCache.next;
    else {
      // Retain stable inline arrays so the final full parse can reuse them too.
      for (const key of sourceCache.previous.keys()) if (key >= normalizedOffset) sourceCache.previous.delete(key);
      for (const [key, value] of sourceCache.next) sourceCache.previous.set(key, value);
    }
    const current = offset ? new Map(previous) : new Map<string, CachedBlock>();
    for (const [key, value] of current) if (value.block.start >= offset) current.delete(key);
    const blocks: MarkdownBlock[] = [];
    let group: ReturnType<typeof markdown.parse> = [];
    const lines = text.replace(/\r\n?/g, '\n').split('\n');
    const offsets = [0];
    for (const line of lines) offsets.push(offsets[offsets.length - 1]! + line.length + 1);
    for (const token of tokens) {
      group.push(token);
      if (token.level !== 0 || token.nesting === 1) continue;
      const first = group[0]!;
      const key = `${lineOffset + (first.map?.[0] ?? blocks.length)}:${first.type}`;
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
      const start = originalAt(normalizedOffset + normalizedStart);
      const end = originalAt(normalizedOffset + normalizedEnd);
      // Inline parsing already reuses immutable child arrays only when content,
      // source positions and references match. Compare those identities instead
      // of serializing the same child AST and source runs on every stream update.
      const children = group.map((token) => token.children);
      const fingerprint = JSON.stringify([
        copyLabel,
        unclosedFence,
        start,
        end,
        group.map(({ children, content, map, ...fields }) => ({
          ...fields,
          map: map?.map((line) => line + lineOffset) ?? null,
          ...(children ? {} : { content }),
        })),
        group.map(sourceLocation),
        removed
          .slice(start - offset - normalizedStart, end - offset - normalizedEnd)
          .map((position) => position + normalizedOffset),
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
      origins.set(block, { line: lineOffset + (first.map?.[0] ?? 0), normalized: normalizedOffset + normalizedStart });
      current.set(key, { fingerprint, children, block });
      blocks.push(block);
      group = [];
    }
    previous = current;
    return {
      blocks,
      hasReferences: !!environment.references && Object.keys(environment.references).length > 0,
    };
  };

  let snapshot:
    | {
        text: string;
        copyLabel: string;
        streaming: boolean;
        blocks: MarkdownBlock[];
        hasReferences: boolean;
      }
    | undefined;
  return (text: string, copyLabel: string, streaming = false): MarkdownBlock[] => {
    if (snapshot?.text === text && snapshot.copyLabel === copyLabel && snapshot.streaming === streaming)
      return snapshot.blocks;

    // A top-level list, quote, table, paragraph or open fence can still grow.
    // Keep TWO trailing blocks mutable: a trailing "2" paragraph can become
    // "2. item" and merge into the preceding ordered list on the next chunk.
    // Edits, locale changes and stream completion always get a full parse.
    const append =
      streaming &&
      snapshot?.streaming &&
      snapshot.copyLabel === copyLabel &&
      !snapshot.hasReferences &&
      // Unlike an open $$ block, the TeX plugin treats an unclosed \[ block
      // as ordinary paragraphs. A later \] can change any of those blocks.
      !text.includes('\\[') &&
      text.startsWith(snapshot.text);
    const stableCount = append ? Math.max(0, snapshot!.blocks.length - 2) : 0;
    const tail = stableCount ? snapshot!.blocks[stableCount] : undefined;
    let offset = tail?.start ?? 0;
    const origin = tail ? origins.get(tail) : undefined;
    let parsed = renderTail(
      text.slice(offset),
      copyLabel,
      streaming,
      offset,
      origin?.line ?? 0,
      origin?.normalized ?? 0,
    );
    // Reference definitions have document-wide effects, including when they
    // arrive after a link in the frozen prefix. Fall back for these documents.
    if (offset && parsed.hasReferences) {
      offset = 0;
      parsed = renderTail(text, copyLabel, streaming, 0, 0, 0);
    }
    const blocks = offset ? [...snapshot!.blocks.slice(0, stableCount), ...parsed.blocks] : parsed.blocks;
    snapshot = { text, copyLabel, streaming, ...parsed, blocks };
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

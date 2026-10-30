import MarkdownIt from 'markdown-it';
import { highlightCode } from './codeHighlight.ts';
import DOMPurify from 'dompurify';
import { tex } from '@mdit/plugin-tex';
import temml from 'temml';
import { createBoundedCache } from '../core/util/boundedCache.ts';

const markdown = new MarkdownIt({
  html: false,
  linkify: true,
  breaks: true,
  typographer: true,
  highlight: highlightCode,
});
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
markdown.renderer.rules.link_open = (tokens, index, options, _env, renderer) => {
  tokens[index].attrSet('target', '_blank');
  tokens[index].attrSet('rel', 'noopener noreferrer');
  return renderer.renderToken(tokens, index, options);
};
const fence = markdown.renderer.rules.fence!;
// A fenced block gets a head: the language it names, and a button that copies it.
markdown.renderer.rules.fence = (tokens, index, options, env, renderer) => {
  const label = markdown.utils.escapeHtml((env as { copyLabel: string }).copyLabel);
  const language = markdown.utils.escapeHtml(tokens[index]!.info.trim().split(/\s+/)[0] ?? '');
  return `<div class="code-block"><div class="code-head"><span class="code-lang">${language}</span><button class="code-copy btn ghost sm" type="button" aria-label="${label}" title="${label}"><svg class="icon sm" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false"><path d="M15.5 8.5v-2A2.5 2.5 0 0 0 13 4H6.5A2.5 2.5 0 0 0 4 6.5V13a2.5 2.5 0 0 0 2.5 2.5h2"/><rect x="8.5" y="8.5" width="11.5" height="11.5" rx="2.5" fill="currentColor" fill-opacity=".18"/></svg></button></div>${fence(tokens, index, options, env, renderer)}</div>`;
};

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
}

/** Retain only this document's current blocks, never all its growing intermediate versions.
 * Parsing remains document-wide: a later reference definition can change an earlier link.
 * Unchanged blocks reuse both sanitized HTML and their Vue-owned DOM nodes.
 */
export function createMarkdownBlocks() {
  let previous = new Map<string, { fingerprint: string; block: MarkdownBlock }>();
  return (text: string, copyLabel: string, streaming = false): MarkdownBlock[] => {
    const environment = { copyLabel };
    const tokens = markdown.parse(text, environment);
    const current = new Map<string, { fingerprint: string; block: MarkdownBlock }>();
    const blocks: MarkdownBlock[] = [];
    let group: ReturnType<typeof markdown.parse> = [];
    const lines = text.split('\n');
    for (const token of tokens) {
      group.push(token);
      if (token.level !== 0 || token.nesting === 1) continue;
      const first = group[0]!;
      const key = `${first.map?.[0] ?? blocks.length}:${first.type}`;
      // A growing, unclosed code fence is escaped now and highlighted once it closes.
      const closingLine = first.map ? (lines[first.map[1] - 1]?.trim() ?? '') : '';
      const plain =
        streaming &&
        first.type === 'fence' &&
        !(
          closingLine.length >= first.markup.length &&
          [...closingLine].every((character) => character === first.markup[0]) &&
          first.map![1] - first.map![0] > 1
        );
      const fingerprint = JSON.stringify([copyLabel, plain, group]);
      const cached = previous.get(key);
      const block =
        cached?.fingerprint === fingerprint
          ? cached.block
          : {
              key,
              html: sanitize(
                markdown.renderer.render(
                  group,
                  plain ? { ...markdown.options, highlight: null } : markdown.options,
                  environment,
                ),
              ),
            };
      current.set(key, { fingerprint, block });
      blocks.push(block);
      group = [];
    }
    previous = current;
    return blocks;
  };
}

export function renderMarkdown(text: string, copyLabel: string): string {
  const cacheKey = `${copyLabel}\0${text}`;
  const cached = RENDER_CACHE.get(cacheKey);
  if (cached !== undefined) return cached;

  const html = sanitize(markdown.render(text, { copyLabel }));

  RENDER_CACHE.set(cacheKey, html);
  return html;
}

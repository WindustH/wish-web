import MarkdownIt from 'markdown-it';
import DOMPurify from 'dompurify';
import { tex } from '@mdit/plugin-tex';
import temml from 'temml';
import { createBoundedCache } from '../core/util/boundedCache.ts';

const markdown = new MarkdownIt({ html: false, linkify: true, breaks: true, typographer: true });
markdown.use(tex, {
  render: (content, displayMode) => temml.renderToString(content, {
    displayMode, annotate: true, trust: false, throwOnError: false,
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
  return `<div class="code-block"><div class="code-head"><span class="code-lang">${language}</span><button class="code-copy btn ghost sm" type="button">${label}</button></div>${fence(tokens, index, options, env, renderer)}</div>`;
};

// Large/streaming answers must not retain 500 full intermediate renderings.
const RENDER_CACHE = createBoundedCache(500, 2_000_000);

export function renderMarkdown(text: string, copyLabel: string): string {
  const cacheKey = `${copyLabel}\0${text}`;
  const cached = RENDER_CACHE.get(cacheKey);
  if (cached !== undefined) return cached;

  const html = DOMPurify.sanitize(
    markdown.render(text, { copyLabel }),
    { ADD_ATTR: ['target'], ADD_TAGS: ['annotation', 'semantics'] }
  );

  RENDER_CACHE.set(cacheKey, html);
  return html;
}

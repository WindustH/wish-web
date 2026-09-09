import MarkdownIt from 'markdown-it';
import DOMPurify from 'dompurify';

const markdown = new MarkdownIt({ html: false, linkify: true, breaks: true, typographer: true });
markdown.renderer.rules.link_open = (tokens, index, options, _env, renderer) => {
  tokens[index].attrSet('target', '_blank');
  tokens[index].attrSet('rel', 'noopener noreferrer');
  return renderer.renderToken(tokens, index, options);
};
const fence = markdown.renderer.rules.fence!;
markdown.renderer.rules.fence = (tokens, index, options, env, renderer) => {
  const label = markdown.utils.escapeHtml((env as { copyLabel: string }).copyLabel);
  return `<div class="code-block"><button class="code-copy btn ghost sm" type="button">${label}</button>${fence(tokens, index, options, env, renderer)}</div>`;
};

export function renderMarkdown(text: string, copyLabel: string): string {
  return DOMPurify.sanitize(markdown.render(text, { copyLabel }), { ADD_ATTR: ['target'] });
}

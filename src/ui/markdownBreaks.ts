import type { MarkdownIt } from 'markdown-it';

/** Recognize explicit line breaks without enabling raw HTML or rewriting code and source offsets. */
export function markdownBreaks(markdown: MarkdownIt) {
  markdown.inline.ruler.before('html_inline', 'explicit_line_break', (state, silent) => {
    if (state.src.charCodeAt(state.pos) !== 0x3c) return false;
    const match = /^<br[\t ]*\/?>/i.exec(state.src.slice(state.pos, state.posMax));
    if (!match) return false;
    if (!silent) state.push('hardbreak', 'br', 0).markup = match[0];
    state.pos += match[0].length;
    return true;
  });
}

import type { MarkdownIt } from 'markdown-it';

const cjk = /^[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}\p{Script=Hangul}]$/u;

/** Allow bold punctuation next to CJK prose, without rewriting source or bypassing
 * Markdown's delimiter pairing, escaping, code spans or nested inline rules.
 */
export function cjkEmphasis(markdown: MarkdownIt) {
  const punctuation = (character: string) =>
    markdown.utils.isMdAsciiPunct(character.codePointAt(0) ?? 0) || markdown.utils.isPunctChar(character);
  markdown.inline.ruler.before('emphasis', 'cjk_strong', (state, silent) => {
    if (silent || state.src.charCodeAt(state.pos) !== 0x2a) return false;
    const scanned = state.scanDelims(state.pos, true);
    if (scanned.length < 2) return false;
    const previous = state.src.charCodeAt(state.pos - 1);
    const previousStart = state.pos - (previous >= 0xdc00 && previous <= 0xdfff ? 2 : 1);
    const before = state.src.slice(Math.max(0, previousStart), state.pos);
    const after = String.fromCodePoint(state.src.codePointAt(state.pos + scanned.length) ?? 0x20);
    const open = scanned.can_open || (cjk.test(before) && punctuation(after));
    const close = scanned.can_close || (punctuation(before) && cjk.test(after));
    if (open === scanned.can_open && close === scanned.can_close) return false;
    for (let index = 0; index < scanned.length; index++) {
      const token = state.push('text', '', 0);
      token.content = '*';
      state.delimiters.push({
        marker: 0x2a,
        length: scanned.length,
        token: state.tokens.length - 1,
        end: -1,
        open,
        close,
      });
    }
    state.pos += scanned.length;
    return true;
  });
}

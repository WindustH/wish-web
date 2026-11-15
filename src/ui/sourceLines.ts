/** Number logical source lines without adding text nodes to copied/quoted content.
 * Highlight.js emits only escaped text and spans; reopen multiline tokens on each
 * row so CSS can wrap the text while keeping its original line number aligned.
 */
export function sourceLines(highlighted: string): string {
  const rows: string[] = [];
  const spans: string[] = [];
  let line = '';
  let offset = 0;
  const finish = (ending: string) => {
    rows.push(
      `<span class="source-line" data-line="${rows.length + 1}"><span class="source-line-text">${line}${'</span>'.repeat(spans.length)}${ending.replaceAll('\r', '&#13;')}</span></span>`,
    );
    line = spans.join('');
  };
  for (const match of highlighted.matchAll(/<\/?span\b[^>]*>|\r\n?|\n/g)) {
    line += highlighted.slice(offset, match.index);
    const token = match[0];
    if (token[0] === '<') {
      line += token;
      if (token.startsWith('</')) spans.pop();
      else spans.push(token);
    } else finish(token);
    offset = match.index + token.length;
  }
  line += highlighted.slice(offset);
  finish('');
  return rows.join('');
}

/** Number logical source lines without adding text nodes to copied/quoted content.
 * Highlight.js emits only escaped text and spans; reopen multiline tokens on each
 * row so CSS can wrap the text while keeping its original line number aligned.
 */
export function sourceLines(highlighted: string, firstLine = 1, final = true): string {
  const rows: string[] = [];
  const spans: string[] = [];
  let line = '';
  let offset = 0;
  let endsWithBreak = false;
  const finish = (ending: string) => {
    rows.push(
      `<span class="source-line" data-line="${rows.length + firstLine}"><span class="source-line-text">${line}${'</span>'.repeat(spans.length)}${ending.replaceAll('\r', '&#13;')}</span></span>`,
    );
    line = spans.join('');
  };
  for (const match of highlighted.matchAll(/<\/?span\b[^>]*>|\r\n?|\n/g)) {
    line += highlighted.slice(offset, match.index);
    if (match.index > offset) endsWithBreak = false;
    const token = match[0];
    if (token[0] === '<') {
      line += token;
      if (token.startsWith('</')) spans.pop();
      else spans.push(token);
    } else {
      finish(token);
      endsWithBreak = true;
    }
    offset = match.index + token.length;
  }
  line += highlighted.slice(offset);
  if (final || offset < highlighted.length || !endsWithBreak) finish('');
  return rows.join('');
}

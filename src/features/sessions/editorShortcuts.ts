/** Terminal-style deletions, expressed as ranges so the editor's undo and attachment logic apply. */
export function shortcutDeletion(key: string, text: string, start: number, end: number): { start: number; end: number } | undefined {
  if (!['c', 'u', 'k', 'w'].includes(key)) return;
  // Copy remains native when there is a selection.
  if (key === 'c') return start === end ? { start: 0, end: text.length } : undefined;
  if (start !== end) return { start, end };
  if (key === 'u') return { start: text.slice(0, start).lastIndexOf('\n') + 1, end };
  if (key === 'k') {
    const lineEnd = text.indexOf('\n', end);
    return { start, end: lineEnd < 0 ? text.length : lineEnd === start ? lineEnd + 1 : lineEnd };
  }
  const before = text.slice(0, start);
  return { start: start - (before.match(/\S+\s*$/u)?.[0].length ?? before.length), end };
}

/**
 * Whether a key press sends what was typed: Enter alone when Enter sends, Ctrl/⌘ + Enter when it
 * makes a new line. Never while an input method is composing.
 */
export function isSendKey(event: KeyboardEvent, sendOnEnter: boolean): boolean {
  if (event.key !== 'Enter' || event.isComposing || event.keyCode === 229) return false;
  const plain = !event.ctrlKey && !event.metaKey && !event.shiftKey && !event.altKey;
  const mod = event.ctrlKey || event.metaKey;
  return sendOnEnter ? plain : mod;
}

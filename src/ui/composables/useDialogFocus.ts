// Controlled dialogs have no Reka DialogTrigger. Remember the real opener so
// Escape/Close returns the keyboard to the action that opened the surface.
export function useDialogFocus() {
  let opener: HTMLElement | null = null;
  function opened(event: Event) {
    opener = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const content = event.target as HTMLElement;
    const initial = content.querySelector<HTMLElement>('[data-initial-focus]:not(:disabled)');
    if (initial) { event.preventDefault(); initial.focus({ preventScroll: true }); }
  }
  function closed(event: Event) {
    if (!opener?.isConnected) return;
    // A nonmodal sheet can close because the user selected another control.
    // Preserve that control's focus instead of jumping back to the opener.
    const active = document.activeElement;
    const content = event.target as HTMLElement;
    if (active && active !== document.body && !content.contains(active)) return;
    event.preventDefault();
    opener.focus({ preventScroll: true });
  }
  function outside(event: CustomEvent<{ originalEvent: Event }>) {
    const target = event.detail.originalEvent.target;
    // Let the opener's click toggle a nonmodal sheet. Otherwise pointerdown
    // closes it first and the following click immediately opens it again.
    if (target instanceof Node && opener?.contains(target)) event.preventDefault();
  }
  return { opened, closed, outside };
}

import { useMedia } from './useMedia';
// Controlled dialogs have no Reka DialogTrigger. Remember the real opener so
// Escape/Close returns the keyboard to the action that opened the surface.
export function useDialogFocus() {
  const mobile = useMedia('(max-width: 899px)');
  let opener: HTMLElement | null = null;
  function opened(event: Event) {
    opener = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const content = event.target as HTMLElement;
    const initial = content.querySelector<HTMLElement>('[data-initial-focus]:not(:disabled)');
    if (mobile.value && initial?.matches('input[type="search"], .picker-search input')) {
      event.preventDefault();
      content.focus({ preventScroll: true });
      return;
    }
    if (initial) { event.preventDefault(); initial.focus({ preventScroll: true }); }
  }
  function closed(event: Event) {
    if (!opener?.isConnected) return;
    // Preserve an explicitly focused control when navigation closes a dialog.
    const active = document.activeElement;
    const content = event.target as HTMLElement;
    if (active && active !== document.body && !content.contains(active)) return;
    event.preventDefault();
    opener.focus({ preventScroll: true });
  }
  return { opened, closed };
}

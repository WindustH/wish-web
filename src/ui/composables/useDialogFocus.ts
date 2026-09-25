import { useMedia } from './useMedia.ts';
// Controlled dialogs have no Reka DialogTrigger. Remember the real opener so
// Escape/Close returns the keyboard to the action that opened the surface.
let lastInputWasKeyboard = true;
let trackingInput = false;
function trackInputModality() {
  if (trackingInput || typeof document === 'undefined') return;
  trackingInput = true;
  document.addEventListener('pointerdown', () => { lastInputWasKeyboard = false; }, true);
  document.addEventListener('keydown', event => {
    if (!event.metaKey && !event.ctrlKey && !event.altKey) lastInputWasKeyboard = true;
  }, true);
}
export function useDialogFocus() {
  trackInputModality();
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
    const active = document.activeElement;
    const content = event.target as HTMLElement;
    // Pointer users should not inherit a sticky focus highlight after a dialog
    // closes. Keyboard users still return to the action that opened it.
    event.preventDefault();
    if (!lastInputWasKeyboard) {
      if (active instanceof HTMLElement && (active === opener || content.contains(active))) active.blur();
      return;
    }
    if (!opener?.isConnected) return;
    // Preserve an explicitly focused control when navigation closes a dialog.
    if (active && active !== document.body && !content.contains(active) && active !== opener) return;
    opener.focus({ preventScroll: true });
  }
  return { opened, closed };
}

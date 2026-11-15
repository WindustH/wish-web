import { onBeforeUnmount } from 'vue';
import { useIsMobile } from './useMedia.ts';
// Controlled dialogs have no Reka DialogTrigger. Remember the real opener so
// Escape/Close returns the keyboard to the action that opened the surface.
let lastInputWasKeyboard = true;
let inputOwners = 0;
let pointerOpener: HTMLElement | null = null;
function onPointerDown(event: PointerEvent) {
  lastInputWasKeyboard = false;
  pointerOpener =
    event.target instanceof Element ? event.target.closest<HTMLElement>('button, a, [role="button"]') : null;
}
function onClick(event: MouseEvent) {
  if (event.detail === 0) lastInputWasKeyboard = true;
}
function onKeyDown(event: KeyboardEvent) {
  if (!event.metaKey && !event.ctrlKey && !event.altKey) {
    lastInputWasKeyboard = true;
    pointerOpener = null;
  }
}
function trackInputModality() {
  if (typeof document === 'undefined') return;
  if (inputOwners++ === 0) {
    document.addEventListener('pointerdown', onPointerDown, true);
    document.addEventListener('click', onClick, true);
    document.addEventListener('keydown', onKeyDown, true);
  }
  onBeforeUnmount(() => {
    if (--inputOwners > 0) return;
    document.removeEventListener('pointerdown', onPointerDown, true);
    document.removeEventListener('click', onClick, true);
    document.removeEventListener('keydown', onKeyDown, true);
    pointerOpener = null;
    lastInputWasKeyboard = true;
  });
}
export function useDialogFocus() {
  trackInputModality();
  const mobile = useIsMobile();
  let opener: HTMLElement | null = null;
  function opened(event: Event) {
    opener =
      !lastInputWasKeyboard && pointerOpener?.isConnected
        ? pointerOpener
        : document.activeElement instanceof HTMLElement
          ? document.activeElement
          : null;
    pointerOpener = null;
    const content = event.target as HTMLElement;
    const initial = content.querySelector<HTMLElement>('[data-initial-focus]:not(:disabled)');
    if (mobile.value && initial?.matches('input[type="search"], .picker-search input')) {
      event.preventDefault();
      content.focus({ preventScroll: true });
      return;
    }
    if (initial) {
      event.preventDefault();
      initial.focus({ preventScroll: true });
    }
  }
  function closed(event: Event) {
    pointerOpener = null;
    const active = document.activeElement;
    const content = event.target as HTMLElement;
    event.preventDefault();
    if (!opener?.isConnected) return;
    // Preserve an explicitly focused control when outside interaction or navigation closes it.
    if (active && active !== document.body && !content.contains(active) && active !== opener) return;
    // Restore buttons for pointer/assistive users too, but do not reopen a phone keyboard
    // by focusing an editor that happened to be active before a pointer opened the dialog.
    if (!lastInputWasKeyboard && opener.matches('input, textarea, [contenteditable]:not([contenteditable="false"])')) {
      if (active instanceof HTMLElement && content.contains(active)) active.blur();
      return;
    }
    opener.focus({ preventScroll: true });
  }
  return { opened, closed };
}

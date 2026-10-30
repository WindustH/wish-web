// Consume only the compatibility click belonging to a press that dismissed a menu.
// A new pointerdown starts a new gesture and is never blocked. No invisible overlay remains.
export function consumeDismissalClick(browser: Window, pointerId?: number) {
  const clear = () => {
    clearTimeout(timer);
    browser.removeEventListener('click', click, { capture: true });
    browser.removeEventListener('pointerdown', clear, { capture: true });
  };
  const click = (event: MouseEvent) => {
    if (event.detail === 0) return; // Keyboard and accessibility activation.
    if ('pointerId' in event && pointerId !== undefined && event.pointerId !== pointerId) return;
    event.preventDefault();
    event.stopImmediatePropagation();
    clear();
  };
  const timer = setTimeout(clear, 1500);
  browser.addEventListener('click', click, { capture: true });
  browser.addEventListener('pointerdown', clear, { capture: true });
  return clear;
}

// Activate small touch buttons at touchend instead of relying on a browser's delayed mouse
// synthesis. Cancel that synthesis only for a confirmed tap; scrolling and long presses stay native.
export function touchButton() {
  let press: { id: number; x: number; y: number; at: number; button: HTMLElement } | undefined;
  const cancel = () => { press = undefined; };
  function start(event: TouchEvent) {
    cancel();
    const touch = event.touches[0];
    if (event.touches.length !== 1 || !touch) return;
    press = { id: touch.identifier, x: touch.clientX, y: touch.clientY, at: event.timeStamp, button: event.currentTarget as HTMLElement };
  }
  function move(event: TouchEvent) {
    const touch = event.touches[0];
    if (!press || event.touches.length !== 1 || !touch || touch.identifier !== press.id
      || Math.hypot(touch.clientX - press.x, touch.clientY - press.y) > 10) cancel();
  }
  function end(event: TouchEvent) {
    const held = press;
    cancel();
    const touch = event.changedTouches[0];
    if (!held || !event.cancelable || event.touches.length || !touch || touch.identifier !== held.id
      || event.timeStamp - held.at > 500 || !held.button.isConnected
      || Math.hypot(touch.clientX - held.x, touch.clientY - held.y) > 10) return;
    const hit = held.button.ownerDocument.elementFromPoint(touch.clientX, touch.clientY);
    if (!hit || !held.button.contains(hit)) return;
    event.preventDefault();
    held.button.click();
  }
  // touchend already activates a verified tap. A later browser-synthesized click can target
  // a replacement node after streaming changed the rail, so it must not activate anything.
  function acceptsClick(event: MouseEvent): boolean {
    const source = event as MouseEvent & { sourceCapabilities?: { firesTouchEvents?: boolean }; pointerType?: string };
    return !source.sourceCapabilities?.firesTouchEvents && source.pointerType !== 'touch';
  }
  return { start, move, end, cancel, acceptsClick };
}

/** Browser default cancellation still permits an application binding to handle the key. */
export const browserBlockedKeys = new WeakSet<KeyboardEvent>();
export const handledShortcut = (event: KeyboardEvent) => event.defaultPrevented && !browserBlockedKeys.has(event);

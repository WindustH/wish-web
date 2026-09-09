// HTTP LAN pages do not expose the Clipboard API. Keep that browser-specific
// copy path here so message and code-block controls share the same behavior.
export const browserClipboard = {
  async writeText(text) {
    if (navigator.clipboard && window.isSecureContext) {
      await navigator.clipboard.writeText(text);
      return;
    }
    const focused = document.activeElement;
    const input = document.createElement('textarea');
    input.value = text;
    input.style.cssText = 'position:fixed;top:0;left:0;opacity:0;pointer-events:none';
    (focused?.closest('[role="dialog"]') ?? document.body).append(input);
    try {
      input.focus({ preventScroll: true });
      input.select();
      if (!document.execCommand('copy')) throw new Error('Clipboard copy failed');
    } finally {
      input.remove();
      focused?.focus({ preventScroll: true });
    }
  },
};
